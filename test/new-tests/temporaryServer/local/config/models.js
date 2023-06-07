module.exports.models = {
   migrate: 'drop',
   attributes: {
      createdAt: { type: 'number', autoCreatedAt: true, },
      updatedAt: { type: 'number', autoUpdatedAt: true, }
    },

};
