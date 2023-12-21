const RestEntity = require('./rest-entity');

class Calls extends RestEntity {
  constructor(accountSid, apiKey, opts) {
    super('Calls', accountSid, apiKey, opts);
    this.enabledOperations = [
      RestEntity.create,
      RestEntity.retrieve,
      RestEntity.list,
      RestEntity.update,
      RestEntity.delete
    ];
  }
}

module.exports = Calls;
