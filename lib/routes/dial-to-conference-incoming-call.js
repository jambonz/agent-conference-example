const config = require('config');

const service = ({logger, client, makeService}) => {
  const svc = makeService({path: '/dial-to-conference'});

  svc.on('session:new', (session) => {
    session.locals = {logger: logger.child({call_sid: session.call_sid})};
    logger.info({session}, `new incoming call: ${session.call_sid}`);

    session
      .on('close', onClose.bind(null, session))
      .on('error', onError.bind(null, session))
      .on('/call_hook', callHook.bind(null, session))
      .on('/child_call_hook', callHook.bind(null, session))
      .on('/dtmfCapture', dtmfCapture.bind(null, session));

    session
      .pause({length: 1.5})
      .dial({
        callerId: config.get('from'),
        dtmfCapture: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'],
        dtmfHook: {
          url: '/dtmfCapture'
        },
        target: [
          config.get('b_party'),
        ]
      })
      .send();
  });
};

const callHook = (session, evt) => {
  const { logger } = session.locals;
  logger.info({ evt }, 'callHook');
  session
    .pause({length: 1.5})
    .conference({
      name: session.call_sid,
      beep: true,
      startConferenceOnEnter: true,
    })
    .reply();
};

const dtmfCapture = (session, evt) => {
  const { logger } = session.locals;
  logger.info({ evt }, 'dtmfCapture');
  session
    .reply();

  session.ws.send(JSON.stringify({
    type: 'command',
    command: 'redirect',
    data: {
      call_hook: '/call_hook',
      child_call_hook: '/child_call_hook'
    }
  }));

  // Make outbound call to orther parties to join the conference.
  config.get('participants').forEach((p, i) => {
    setTimeout(() => {
      session.ws.send(JSON.stringify({
        type: 'command',
        command: 'dial',
        data: {
          from: config.get('from'),
          to: p.target,
          call_hook: `wss://${config.get('app_base_url')}/dial-to-conference-outgoing-call`,
          call_status_hook: `https://${config.get('app_base_url')}/call-status`,
          speech_synthesis_vendor: 'google',
          speech_synthesis_language: 'en-US',
          speech_synthesis_voice: 'en-US-Wavenet-A',
          speech_recognizer_vendor: 'google',
          speech_recognizer_language: 'en-US',
          tag: {
            conference_name: session.call_sid,
            idx: i
          }
        }
      }));
    }, p.delay * 1000);
  });
};

const onClose = (session, code, reason) => {
  const {logger} = session.locals;
  logger.info({session, code, reason}, `session ${session.call_sid} closed`);
};

const onError = (session, err) => {
  const {logger} = session.locals;
  logger.info({err}, `session ${session.call_sid} received error`);
};

module.exports = service;
