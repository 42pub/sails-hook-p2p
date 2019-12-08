const p2p = require('p2p');
const util = require('util');
const uuid = require('uuid/v4');

const conf = sails.config.p2p;

module.exports = function (sails) {
  return async function (cb) {
    if (!conf)
      return cb();

    if (!conf.peers)
      return cb();

    const peer = p2p.peer({
      host: 'localhost',
      port: sails.config.port + 1,
      wellKnownPeers: conf.peers,
      serviceInterval: '3s'
    });

    const lastUpdate = new Date().getTime() - (conf.lastUpdate || 24 * 60 * 60 * 1000);
    // sails.log.info('LAST UPDATE', lastUpdate);

    let endpoints = {};

    peer.on('environment::*', successorOrPredecessor => {
      // sails.log.verbose('PEER', successorOrPredecessor);
      if (successorOrPredecessor) {
        peer.wellKnownPeers.add({
          host: successorOrPredecessor.host,
          port: successorOrPredecessor.port
        });
        endpoints[successorOrPredecessor.id] = {
          host: successorOrPredecessor.host,
          port: successorOrPredecessor.port
        };
      }
    });

    let upToDate = {[peer.self.id]: new Date().getTime()};

    peer.on('status::joined', async () => {
      sails.log.verbose('JOINED');
      // sails.log.info('ENDPOINTS', endpoints);

      // sails.log.info('EMIT ABOUT MY MODELS');
      await emitAboutModels(peer, lastUpdate, (thisPeer, peer, name, args) => emitAll(thisPeer, name, args));

      const response = await emitAll(peer, 'info', {id: peer.self.id, upToDate: upToDate[peer.self.id]});
      const otherUpToDates = {};
      response.map(i => otherUpToDates[i.id] = i.upToDate);
      // sails.log.info('infoGet', otherUpToDates);
      upToDate = Object.assign(upToDate, otherUpToDates);

      const older = Math.min.apply(null, Object.values(upToDate));
      // sails.log.info(upToDate, older);
      let peerId = peer.self.id;
      for (let i in upToDate) {
        if (upToDate.hasOwnProperty(i)) {
          if (upToDate[i] === older) {
            peerId = i;
            break;
          }
        }
      }
      // sails.log.verbose('PEER_ID', peer.self.id, peerId);
      if (peerId !== peer.self.id) {
        await emit(peer, endpoints[peerId], 'getData', peer.self.id);
      }
    });

    sails.after('hook:moduleloader:loaded', function () {
      patchModels(peer);
      setupModelsListeners(peer);
      setupListeners(peer, upToDate, lastUpdate, endpoints);
    });

    sails.after('hook:orm:loaded', function () {
      migrate(conf.migrate);
    });

    cb();
  }
};

async function emitAll(thisPeer, name, args) {
  const peers = thisPeer.wellKnownPeers.get().filter(peer => peer.host !== thisPeer.self.host || peer.port !== thisPeer.self.port);
  return Promise.all(peers.map(peer => emit(thisPeer, peer, name, args)));
}

async function emit(thisPeer, peer, name, args = {}) {
  if (typeof args != "object")
    args = {args};
  return await util.promisify(thisPeer.remote(peer).run)('handle/' + name, args);
}

function setupModelsListeners(peer) {
  const models = sails.models;
  let modelsForGrab = getModelsForAction('grab');
  for (let modelName of Object.keys(models)) {
    if (!modelsForGrab.length || modelsForGrab.includes(modelName)) {
      peer.handle[modelName + '.afterCreate'] = async function (values, cb)   {
        sails.log.verbose('remoteAfterCreate', values);
        const record = await models[modelName].findOne(values.p2pid);
        if (!record)
          await models[modelName].create(values);
        cb();
      };

      peer.handle[modelName + '.afterUpdate'] = function (values, cb) {
        sails.log.verbose('remoteAfterUpdate', values);
        models[modelName].update(values.p2pid, values).exec(err => {
          if (err) sails.log.error(err);
          cb();
        });
      };

      peer.handle[modelName + '.afterDestroy'] = function (p2pid, cb) {
        sails.log.verbose('remoteAfterDestroy', id);
        models[modelName].destroy(p2pid).exec(err => {
          if (err) sails.log.error(err);
          cb();
        });
      };
    }
  }
}

function setupListeners(peer, upToDate, lastUpdate, endpoints) {
  peer.handle.info = function (info, cb) {
    // sails.log.verbose('infoSend', info);
    upToDate[info.id] = info.upToDate;
    cb(null, {id: peer.self.id, upToDate: upToDate[peer.self.id]});
  };

  peer.handle.getData = async function (args, cb) {
    const peerId = args.args;
    // sails.log.info('EMIT REMOTE ABOUT MODELS');
    await emitAboutModels(peer, lastUpdate, (thisPeer, peer, name, args) => emit(thisPeer, peer, name, args), endpoints[peerId]);
    cb();
  };
}

function patchModels(peer) {
  const models = sails.models;
  let modelsPublic = getModelsForAction('public');
  for (let modelName of Object.keys(models)) {
    if (!modelsPublic.length || modelsPublic.includes(modelName)) {
      let model = models[modelName];

      model.attributes.peerIdEmitFrom = {type: 'string', defaultsTo: peer.self.id};
      model.attributes.p2pId = {type: 'string'};

      function patch(model, action, func) {
        model[action] = (previousAction =>
          async function (values, cb) {
            try {
              await func(values);
            } catch (e) {}

            if (typeof previousAction === 'function') {
              previousAction(values, cb);
            } else {
              cb();
            }
          })(model[action]);
      }

      patch(model, 'beforeCreate', function (values) {
        values.p2pid = uuid();
      });

      patch(model, 'afterCreate', async function (values) {
        if (values.peerIdEmitFrom === peer.self.id)
          await emitAll(peer, modelName + '.afterCreate', values);
      });

      patch(model, 'afterUpdate', async function (values) {
        if (values.peerIdEmitFrom === peer.self.id)
          await emitAll(peer, modelName + '.afterUpdate', values);
      });

      patch(model, 'afterDestroy', async function (values) {
        if (values.peerIdEmitFrom === peer.self.id)
          await emitAll(peer, modelName + '.afterDestroy', values.p2pid);
      });
    }
  }
}

async function emitAboutModels(thisPeer, lastUpdate, emitFunc, peer) {
  const models = sails.models;
  for (let modelName in models) {
    if (models.hasOwnProperty(modelName)) {
      const createdModels = await models[modelName].find({createdAt: {'>': new Date(lastUpdate)}});
      // sails.log.info('created', createdModels);
      for (let um of createdModels) {
        await emitFunc(thisPeer, peer, modelName + '.afterCreate', um);
      }

      let updatedModels = await models[modelName].find({updatedAt: {'>': new Date(lastUpdate)}});
      updatedModels = updatedModels.filter(i => !createdModels.includes(i));
      // sails.log.info('updated', updatedModels);
      for (let um of updatedModels) {
        await emitFunc(thisPeer, peer, modelName + '.afterUpdate', um);
      }
    }
  }
}

async function migrate(migrate) {
  const models = sails.models;
  for (let modelName of Object.keys(models)) {
    let model = models[modelName];
    if (migrate) {
      try {
        const findModels = await model.find();
        for (let findModel of findModels) {
          if (!findModel.p2pid) {
            findModel.p2pid = uuid();
            try {
              await findModel.save();
            } catch (e) {
              sails.log.error('Cannot save model', e);
            }
          }
        }
      } catch (e) {
        sails.log.error('Migration error', e);
      }
    }
  }
}

function getModelsForAction(action) {
  let models = [];
  if (conf.models) {
    if (Array.isArray(conf.models) && conf.models.length) {
      models = conf.models;
    }
    if (conf.models[action] && Array.isArray(conf.models[action])) {
      models = conf.models.public;
    }
  }
  return models;
}
