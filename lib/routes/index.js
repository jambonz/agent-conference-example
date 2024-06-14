module.exports = ({logger, client, makeService}) => {
  const { service, callMap } = require('./incoming-call');
  service({logger, client, makeService});
  require('./outgoing-call')({logger, callMap, makeService});
  require('./dial-to-conference-incoming-call')({logger, client, makeService});
  require('./dial-to-conference-outgoing-call')({logger, client, makeService});
};

