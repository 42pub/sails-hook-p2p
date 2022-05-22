module.exports = {
  primaryKey: 'id',
  attributes: {
    id: {
      type: "number",
      autoIncrement: true
    },
    local: {
      type: 'boolean',
      defaultsTo: false
    },
    peer1: {
      type: 'boolean',
      defaultsTo: false
    },
    peer2: {
      type: 'boolean',
      defaultsTo: false
    }
  }

};
