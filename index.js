'use strict';

module.exports = function (sails) {
  return {
    initialize: require('./dist/initialize').default(sails)
  };
};
