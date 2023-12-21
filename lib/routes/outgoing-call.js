const service = ({logger, callMap, makeService}) => {
  const svc = makeService({path: '/outgoing-call'});

  svc.on('session:new', (session) => {
    session.locals = {logger: logger.child({call_sid: session.call_sid})};
    logger.info({session}, `new outgoing call: ${session.call_sid}`);

    session
      .on('close', onClose.bind(null, session))
      .on('error', onError.bind(null, session))
      .on('/confWait', confWait.bind(null, session));

    session
      .conference({
        name: session.customerData.conference_name,
        beep: true,
        startConferenceOnEnter: false,
        waitHook: '/confWait'
      })
      .send();
  });

  const confWait = (session, evt) => {
    const {logger} = session.locals;
    logger.info(evt);

    if (callMap.has(session.customerData.conference_name)) {
      const incomingSession = callMap.get(session.customerData.conference_name);
      if (!incomingSession.isJoinedConference) {
        incomingSession.isJoinedConference = true;
        incomingSession
          .conference({
            name: session.customerData.conference_name,
            beep: true,
            startConferenceOnEnter: true
          })
          .send();
      }
    } else {
      session.hangup().send();
    }
  };

  const onClose = (session, code, reason) => {
    const {logger} = session.locals;
    logger.info({session, code, reason}, `session ${session.call_sid} closed`);
  };

  const onError = (session, err) => {
    const {logger} = session.locals;
    logger.info({err}, `session ${session.call_sid} received error`);
  };
};

module.exports = service;
