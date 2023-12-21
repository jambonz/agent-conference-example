const {createServer} = require('http');
const {createEndpoint} = require('@jambonz/node-client-ws');
const server = createServer();
const makeService = createEndpoint({server});
const logger = require('pino')({level: process.env.LOGLEVEL || 'info'});
const port = process.env.WS_PORT || 3000;
const config = require('config');
const jambonz = config.get('jambonz');
const client = require('@jambonz/node-client')(jambonz.account_sid, jambonz.account_token, {
  baseUrl: jambonz.base_url
});

require('./lib/routes')({logger, client, makeService});

server.listen(port, () => {
  logger.info(`jambonz websocket server listening at http://localhost:${port}`);
});
