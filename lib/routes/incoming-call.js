const config = require('config');


const welcomeText = `<speak>
<prosody volume="loud">Hi there,</prosody> and welcome to jambones! 
This is Conference Application Demo.
</speak>`;

const enqueueWaitText =  'Your call is important to us, Please wait for a moment.';
const callMap = new Map();

const service = ({logger, client, makeService}) => {
  const svc = makeService({path: '/conference'});

  svc.on('session:new', (session) => {
    session.locals = {logger: logger.child({call_sid: session.call_sid})};
    logger.info({session}, `new incoming call: ${session.call_sid}`);

    session
      .on('close', onClose.bind(null, session))
      .on('error', onError.bind(null, session))
      .on('/enqueue-wait', onEnqueueWait.bind(null, session));

    callMap.set(session.call_sid, session);

    // Put incoming call to Queue
    session
      .pause({length: 1.5})
      .say({text: welcomeText})
      .enqueue({
        name: 'support',
        waitHook: '/enqueue-wait'
      })
      .send();

    // Make outbound call to targets
    config.get('participants').forEach((p, i) => {
      setTimeout(() => {
        client.calls.create({
          from: config.get('from'),
          to: p.target,
          call_hook: `wss://${config.get('app_base_url')}/outgoing-call`,
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
        });
      }, p.delay * 1000);
    });
  });
};

const onEnqueueWait = (session, evt) => {
  const {logger} = session.locals;
  logger.info({evt}, 'onEnqueueWait');
  session
    .say({text: enqueueWaitText})
    .pause({length: 25})
    .reply();
};

const onClose = (session, code, reason) => {
  const {logger} = session.locals;
  logger.info({session, code, reason}, `session ${session.call_sid} closed`);
  callMap.delete(session.call_sid);
};

const onError = (session, err) => {
  const {logger} = session.locals;
  logger.info({err}, `session ${session.call_sid} received error`);
  callMap.delete(session.call_sid);
};

module.exports = {
  service,
  callMap
};
