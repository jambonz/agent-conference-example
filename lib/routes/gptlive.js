/**
 * OpenAI GPT Live (limited-access alpha) speech-to-speech test route.
 *
 * Point a jambonz application at ws://<host>/gptlive and call it.
 *
 * Requires GPTLIVE_API_KEY in the environment — an OpenAI key enrolled in the
 * GPT Live Early Access Program. An ordinary OpenAI key completes the websocket
 * handshake and is then refused with "Voice session access denied", which shows
 * up here as completionReason 'server error' on /gptlive-action.
 *
 * GPT Live is NOT the OpenAI Realtime API, even though both live at
 * api.openai.com. Differences that matter when reading this file:
 *   - llmOptions carries ONLY session_update. There is no response_create and
 *     no response.create client event — the model starts and drives the
 *     conversation itself once the session is started.
 *   - `model` goes on the verb, not inside session_update; it rides in the
 *     connection URL and the feature-server rejects the verb if it is repeated.
 *   - Work the model wants done arrives as a *delegation*, and the two modes
 *     are plumbed differently — see DELEGATION_MODE below.
 */
const DEFAULT_MODEL = 'gpt-live-1-boulder-alpha';
const DEFAULT_DELEGATION_MODEL = 'gpt-5.5';
const DEFAULT_VOICE = 'marin';

const SYSTEM_PROMPT =
  'You are a friendly, helpful voice assistant on a phone call. ' +
  'Keep replies short and conversational. ' +
  'Always answer in English unless the caller speaks another language. ' +
  'You are speaking out loud, so use plain prose with no markdown.';

/* Flat Responses-shape function tool. Declared inside the delegation (see
 * below) — GPT Live has no session-level tools array. */
const weatherTool = {
  type: 'function',
  name: 'get_weather',
  description: 'Get the current weather for a city. Call this whenever the caller asks about the weather.',
  parameters: {
    type: 'object',
    properties: {
      location: {type: 'string', description: 'City name, e.g. "Chicago"'},
      scale: {type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature unit'}
    },
    required: ['location']
  }
};

const lookupWeather = async(location, scale = 'celsius') => {
  /* Bound both calls: the feature-server's stall watchdog is disarmed by the
   * time a function call is dispatched, so a hung upstream would leave the
   * caller in dead air until the call's own time limit (undici applies no
   * default request timeout). */
  const signal = AbortSignal.timeout(5000);
  const geoRes = await fetch('https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(location)}&count=1&language=en&format=json`, {signal});
  const geo = await geoRes.json();
  if (!geo.results || geo.results.length === 0) return `No weather data found for "${location}".`;

  const {latitude, longitude} = geo.results[0];
  const wxRes = await fetch('https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m` +
    `&temperature_unit=${scale}`, {signal});
  const wx = await wxRes.json();
  const unit = scale === 'fahrenheit' ? 'degrees Fahrenheit' : 'degrees Celsius';
  return `It is currently ${wx.current.temperature_2m} ${unit} in ${location} ` +
    `with wind at ${wx.current.wind_speed_10m} kilometers per hour.`;
};

const service = ({logger, makeService}) => {
  const svc = makeService({path: '/gptlive'});

  svc.on('session:new', (session) => {
    const log = logger.child({call_sid: session.callSid});
    session.locals = {logger: log};
    log.info({from: session.from, to: session.to}, 'new incoming call: /gptlive');

    const apiKey = process.env.GPTLIVE_API_KEY;
    const model = process.env.GPTLIVE_MODEL || DEFAULT_MODEL;
    const delegationMode = process.env.GPTLIVE_DELEGATION_MODE || 'responses';
    const delegationModel = process.env.GPTLIVE_DELEGATION_MODEL || DEFAULT_DELEGATION_MODEL;
    const voice = process.env.GPTLIVE_VOICE || DEFAULT_VOICE;

    if (!apiKey) {
      log.error('GPTLIVE_API_KEY is not set — cannot start a GPT Live session');
      session
        .say({text: 'The GPT Live API key is not configured on this server. Goodbye.'})
        .hangup()
        .send();
      return;
    }

    /* 'responses' — the model runs a Responses API turn that can call functions.
     *   The nested `responses` object is REQUIRED and its `model` is mandatory;
     *   tools go at delegation.responses.tools (NOT delegation.tools — the
     *   server rejects that with "Missing required parameter:
     *   'delegation.responses'"). Function calls arrive on toolHook. This is
     *   also the only mode in which jambonz's built-in handoff/hangup tools work.
     *
     * 'client' — the model asks THIS APP for free-form text context instead,
     *   emitting delegation.created with item.target === 'client'. We answer
     *   with a delegation.context.append. No function calling exists here. */
    const delegation = 'client' === delegationMode
      ? {type: 'client'}
      : {
        type: 'responses',
        responses: {
          model: delegationModel,
          tools: [weatherTool]
        }
      };

    session
      .on('close', (code, reason) => log.info({code, reason}, 'session closed'))
      .on('error', (err) => log.error({err}, 'session error'))

      /* Raw GPT Live server events. turn.done is the readable "who said what";
       * everything else goes to debug so the default output stays legible. */
      .on('/gptlive-event', (evt) => {
        const {type} = evt;

        /* Answer a client-targeted delegation: the model is asking us for
         * context in prose. One input_text part, max 500 tokens, quoting the
         * delegation item's id. */
        if ('delegation.created' === type && evt.item && 'client' === evt.item.target) {
          log.info({item: evt.item}, 'client delegation — supplying context');
          session.updateLlm({
            type: 'delegation.context.append',
            delegation_item_id: evt.item.id,
            content: [{
              type: 'input_text',
              text: 'The caller is a long-standing customer on the Unlimited plan, ' +
                'in good standing, and has already accepted the terms.'
            }]
          });
          return;
        }

        if ('turn.done' === type && evt.turn) {
          log.info({role: evt.turn.role, transcript: evt.turn.transcript}, 'turn');
        }
        else if ('error' === type) {
          log.error({error: evt.error}, 'GPT Live error');
        }
        else {
          log.debug({evt}, `gptlive event: ${type}`);
        }
      })

      /* Tool calls (only fire in 'responses' mode). */
      .on('/gptlive-tool', async(evt) => {
        const {tool_call_id, name, args} = evt;
        log.info({name, args}, 'tool call');

        /* GPT Live wants its OWN envelope — delegation.function_call_output.create,
         * NOT the Realtime API's conversation.item.create — echoing the call_id.
         * There is no follow-on response.create; the server resumes the
         * delegation itself. */
        const respond = (output) => session.sendToolOutput(tool_call_id, {
          type: 'delegation.function_call_output.create',
          item: {
            type: 'function_call_output',
            call_id: tool_call_id,
            output
          }
        });

        if ('get_weather' !== name) return respond(`Unknown tool: ${name}`);

        try {
          const result = await lookupWeather(args.location, args.scale);
          log.info({result}, 'weather lookup');
          respond(result);
        } catch (err) {
          log.error({err}, 'weather lookup failed');
          respond('Sorry, the weather service is unavailable right now.');
        }
      })

      .on('/gptlive-action', (evt) => {
        log.info({evt}, 'llm session ended');
        session.reply();
      });

    session
      .s2s({
        vendor: 'gptlive',
        /* the model rides in the connection URL — do NOT repeat it in session_update */
        model,
        auth: {apiKey},
        llmOptions: {
          /* session_update ONLY — there is no response_create in this API.
           * Audio is fixed at 24 kHz mono PCM16, so nothing to negotiate. */
          session_update: {
            instructions: SYSTEM_PROMPT,
            audio: {output: {voice}},
            delegation
          }
        },
        toolHook: '/gptlive-tool',
        eventHook: '/gptlive-event',
        actionHook: '/gptlive-action'
      })
      .send();

    log.info({model, delegationMode, delegationModel, voice}, 'gptlive session started');
  });
};

module.exports = service;
