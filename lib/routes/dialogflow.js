/*
 * Dialogflow CX test route.
 *
 * Points at a known-working CX agent (project drachtio-cpaas) so you can call
 * in and talk to the bot immediately. Everything is overridable by env so you
 * can swap in your own agent without editing code:
 *
 *   DIALOGFLOW_KEYFILE   path to the service-account JSON      (default: ~/Desktop/speech.json)
 *   DIALOGFLOW_PROJECT   GCP project id                        (default: from the key file)
 *   DIALOGFLOW_AGENT     CX agent id (uuid)                    (default: the drachtio-cpaas test agent)
 *   DIALOGFLOW_REGION    GCP region                            (default: us-central1)
 *   DIALOGFLOW_MODEL     es | cx | ces                         (default: cx)
 *   DIALOGFLOW_LANG      language code                         (default: en-US)
 *
 * NOTE on greeting: this CX agent's start page greets on the caller's FIRST
 * spoken turn — it has no named WELCOME event handler (sending welcomeEvent:
 * 'WELCOME' returns a Google "No handler is defined for the event" error). So
 * just call in and say "hello"; the bot replies. If YOUR agent has a welcome
 * event, set welcomeEvent below to its name instead.
 */
const path = require('path');

const DEFAULT_KEYFILE = path.join(require('os').homedir(), 'Desktop', 'speech.json');
const keyfile = process.env.DIALOGFLOW_KEYFILE || DEFAULT_KEYFILE;
const credentials = require(keyfile);

const dfConfig = {
  project: process.env.DIALOGFLOW_PROJECT || credentials.project_id,
  agent: process.env.DIALOGFLOW_AGENT || '80f82805-2b39-4e70-8420-df74df8a85b6',
  region: process.env.DIALOGFLOW_REGION || 'us-central1',
  model: process.env.DIALOGFLOW_MODEL || 'cx',
  lang: process.env.DIALOGFLOW_LANG || 'en-US'
};

const service = ({ logger, makeService }) => {
  const svc = makeService({ path: '/dialogflow' });

  svc.on('session:new', (session) => {
    session.locals = { logger: logger.child({ call_sid: session.callSid }) };
    const { logger: log } = session.locals;
    log.info({ from: session.from, to: session.to, dfConfig },
      `new dialogflow call: ${session.callSid}`);

    session
      .on('close', onClose.bind(null, session))
      .on('error', onError.bind(null, session))
      .on('/eventHook', onEventHook.bind(null, session))
      .on('/actionHook', onActionHook.bind(null, session));

    session
      .dialogflow({
        credentials,
        project: dfConfig.project,
        agent: dfConfig.agent,
        region: dfConfig.region,
        model: dfConfig.model,
        lang: dfConfig.lang,
        // Which events feature-server should POST to /eventHook. These are
        // the CX/ES event names the dialogflow task emits.
        events: ['intent', 'transcription', 'start-play', 'stop-play', 'dtmf', 'no-input'],
        eventHook: '/eventHook',
        actionHook: '/actionHook'
        // welcomeEvent: 'YOUR_WELCOME_EVENT'   // only if your agent defines one
      })
      .send();
  });
};

/*
 * eventHook — fires during the conversation. feature-server posts:
 *   { event: '<name>', data: { ... } }
 * where <name> is one of: intent, transcription, start-play, stop-play,
 * dtmf, no-input (CES adds session-output, tool-calls, interruption, etc).
 * Always call session.reply() so the dialog continues.
 */
const onEventHook = (session, evt) => {
  const { logger } = session.locals;
  const { event, data } = evt;

  switch (event) {
    case 'transcription': {
      // CX/ES transcription payloads vary; log the most useful fields.
      const transcript =
        data?.transcript ||
        data?.recognition_result?.transcript ||
        data?.queryResult?.transcript;
      logger.info({ transcript, data }, 'dialogflow: caller said');
      break;
    }
    case 'intent': {
      const name =
        data?.intent?.displayName ||
        data?.queryResult?.intent?.displayName ||
        data?.queryResult?.match?.intent?.displayName;
      logger.info({ intent: name, data }, 'dialogflow: intent matched');

      // Example: honor a custom-payload transfer from the agent.
      const messages =
        data?.queryResult?.responseMessages ||
        data?.intent?.fulfillmentMessages ||
        [];
      const transferMsg = messages.find((m) => m.payload?.transfer);
      if (transferMsg) {
        const { transfer } = transferMsg.payload;
        logger.info({ transfer }, 'dialogflow: transfer requested');
        session
          .dial({ target: [{ type: 'phone', number: transfer.number }] })
          .reply();
        return;
      }
      break;
    }
    case 'start-play':
      logger.info({ path: data?.path }, 'dialogflow: bot audio playback started');
      break;
    case 'stop-play':
      logger.info({ path: data?.path }, 'dialogflow: bot audio playback finished');
      break;
    case 'dtmf':
      logger.info({ dtmf: data }, 'dialogflow: dtmf received');
      break;
    case 'no-input':
      logger.info('dialogflow: no input from caller');
      break;
    default:
      logger.info({ event, data }, 'dialogflow: event');
  }

  session.reply();
};

/*
 * actionHook — fires once when the dialogflow session ends.
 * Payload: { dialogflowResult: '<reason>', ... }
 */
const onActionHook = (session, evt) => {
  const { logger } = session.locals;
  logger.info({ evt }, `dialogflow session ended: ${evt?.dialogflowResult || evt?.reason}`);

  session
    .hangup()
    .reply();
};

const onClose = (session, code, reason) => {
  const { logger } = session.locals;
  logger.info({ code, reason }, `dialogflow session ${session.callSid} closed`);
};

const onError = (session, err) => {
  const { logger } = session.locals;
  logger.error({ err }, `dialogflow session ${session.callSid} error`);
};

module.exports = service;
