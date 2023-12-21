module.exports = ({logger, client, makeService}) => {
  const { service, callMap } = require('./incoming-call');
  service({logger, client, makeService});
  require('./outgoing-call')({logger, callMap, makeService});
};

