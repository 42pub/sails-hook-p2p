"use strict"

import Mesh from "./mesh/Mesh";
import Peer from "./mesh/Peer";

declare const sails: any;

const uuid = require('uuid/v4');
const fromEntries = require('object.fromentries');

let conf;

const modelsPublic = getModelsForAction('public');
const modelsGrab = getModelsForAction('grab');

interface Model {
  attributes: {
    [x: string]: {
      type: string,
      collection?: string;
      [x: string]: any;
    }
  }
  globalId: string;
}

interface NodeData {
  [x: string]: {
    upToDate: number,
    public: any[],
    grab: any[]
  }
}

interface Values {
  peerIdEmitFrom: string;
  p2pId: string;
}

export default function (sails) {
  return async function (cb) {
    conf = sails.config.p2p;

    // validate that configuration exists
    if (!conf) {
      return cb();
    }

    if (!conf.peers) {
      return cb();
    }

    // use polyfill if no Object.fromEntries
    if (!Object.fromEntries) {
      fromEntries.shim();
    }

    // create mesh configuration
    const p2pOpts = {
      host: conf.host || 'localhost',
      port: conf.port || parseInt(sails.config.port) + 1,
      knownPeers: conf.peers,
      showLog: conf.showLog,
      privateKey: conf.password,
      certificate: conf.certificate
    };

    // create mesh
    const mesh = new Mesh(p2pOpts);

    sails.hooks.p2p.mesh = mesh;

    initializeListeners(mesh);

    // return callback
    return cb();
  }
};

function initializeListeners(mesh: Mesh) {
  let joined = false;
  let ormStarted = false;

  let nodeData = {
    [mesh.self.id]: {
      upToDate: new Date().getTime(),
      public: modelsPublic,
      grab: modelsGrab
    }
  };

  const lastUpdate = new Date().getTime() - (conf.lastUpdate || 24 * 60 * 60 * 1000);
  sails.log.verbose('LAST UPDATE', lastUpdate);

  mesh.once('joined', async () => {
    sails.log.verbose('JOINED');

    joined = true;
    await getOthersInfo(mesh, nodeData, lastUpdate, true, ormStarted);
  });

  sails.after('hook:moduleloader:loaded', function () {
    patchModels(mesh);
    setupModelsListeners(mesh);
    setupListeners(mesh, nodeData, lastUpdate);
  });

  sails.after('hook:orm:loaded', async function () {
    decorateModels();

    ormStarted = true;
    await getOthersInfo(mesh, nodeData, lastUpdate, joined, ormStarted);

    const models = sails.models;
    for (let modelName of Object.keys(models)) {
      if (!modelsGrab.length || modelsGrab.includes(modelName)) {
        patchModelAttributes(models[modelName]);
      }
    }

    await migrate(conf.migrate);
  });
}

async function getOthersInfo(mesh: Mesh, nodeData: NodeData, lastUpdate: number, aFlag: boolean, bFlag: boolean): Promise<void> {
  if (aFlag && bFlag) {
    await emitAll(mesh, 'info', {
      id: mesh.self.id,
      data: nodeData[mesh.self.id]
    }, async (err: any, response: any[]) => {
      const otherUpToDates = {};

      response.forEach(i => otherUpToDates[i.id] = i.data);
      sails.log.verbose('infoGet', otherUpToDates);
      nodeData = Object.assign(nodeData, otherUpToDates);

      sails.log.verbose('EMIT ABOUT MY MODELS');
      await emitAboutModels(mesh, lastUpdate);

      const older = Math.min.apply(null, Object.values(nodeData).map(i => i.upToDate));
      sails.log.verbose('node data', nodeData, older);

      let peerId = mesh.self.id;
      for (let i in nodeData) {
        if (nodeData[i].upToDate === older) {
          peerId = i;
          break;
        }
      }

      sails.log.verbose('PEER_ID', mesh.self.id, peerId);

      if (peerId !== mesh.self.id) {
        await emit(mesh, peerId, 'getData', mesh.self.id);
      }
    });
  }
}

async function emitAll(thisMesh: Mesh, name: string, ...args: any): Promise<void> {
  if (typeof args[args.length - 1] === 'function') {
    const cb = args[args.length - 1];
    args = args.slice(0, args.length - 1);

    let counter = Object.keys(thisMesh.clients).length;
    sails.log.silly('counter set', counter);

    let response = [];

    args.push((err, res) => {
      counter--;
      sails.log.silly('counter', counter, err, res);

      if (err) {
        return response.push({
          error: err
        });
      }
      response.push(res);

      if (counter === 0) {
        cb(null, response);
      }
    });
  }

  thisMesh.emitRemoteAll(name, ...args);
}

async function emit(thisMesh: Mesh, peer: Peer | string, name: string, args: any = {}) {
  if (typeof args != "object") {
    args = {args};
  }

  sails.log.verbose('P2P emit', name, peer);
  return thisMesh.emitRemote(name, peer, args);
}

function setupModelsListeners(mesh: Mesh) {
  const models = sails.models;
  for (let modelName of Object.keys(models)) {
    if (!modelsGrab.length || modelsGrab.includes(modelName)) {
      const id = getIdField(sails.models[modelName]);

      mesh.onRemote(modelName + '.afterCreate', async function (values) {
        sails.log.verbose('remoteAfterCreate', values);

        const record = await models[modelName].findOne({p2pId: values.p2pId});
        if (!record) {
          await models[modelName].create(values).fetch();
        }
      });

      mesh.onRemote(modelName + '.afterUpdate', async function (values) {
        sails.log.verbose('remoteAfterUpdate', values);

        const myModel = await sails.models[modelName].findOne(values[id]);
        if (hashFromModel(myModel) !== hashFromModel(values)) {
          await models[modelName].update({p2pId: values.p2pId}, values).fetch();
        }
      });

      mesh.onRemote(modelName + '.afterDestroy', async function (p2pId) {
        sails.log.verbose('remoteAfterDestroy', id);
        await models[modelName].destroy(p2pId);
      });
    }
  }
}

function setupListeners(mesh: Mesh, nodeData: NodeData, lastUpdate: number) {
  mesh.onRemote('info', function (info, cb) {
    sails.log.verbose('infoSend', info);
    nodeData[info.id] = info.data;
    cb(null, {
      id: mesh.self.id,
      data: nodeData[mesh.self.id]
    });
  });

  mesh.onRemote('getData', async function (args) {
    const peerId = args.args;
    sails.log.verbose('EMIT REMOTE ABOUT MODELS');
    await emitAboutModels(mesh, lastUpdate, peerId);
  });
}

function patchModelAttributes(model: Model) {
  model.attributes.peerIdEmitFrom = {type: 'string'};
  model.attributes.p2pId = {type: 'string'};
}

function patchModels(mesh: Mesh): void {
  const models = sails.models;

  for (let modelName of Object.keys(models)) {
    if (!modelsPublic.length || modelsPublic.includes(modelName)) {
      let model = models[modelName];

      patchModelAttributes(model);

      const patch = (model: any, action: string, func: (values: Values) => void) => {
        model[action] = (previousAction =>
          async function (values, cb) {
            try {
              await func(values);
            } catch (e) {
              sails.log.error('>', modelName, ':', action, e);
            }

            if (typeof previousAction === 'function') {
              previousAction(values, cb);
            } else {
              cb();
            }
          })(model[action]);
      };

      patch(model, 'beforeCreate', function (values: Values) {
        if (!values.p2pId) {
          values.p2pId = uuid();
        }
      });

      patch(model, 'afterCreate', async function (values: Values) {
        if (values.peerIdEmitFrom === mesh.self.id) {
          const id = getIdField(model);
          let criteria = {};
          criteria[id] = values[id];

          // FindOne with population
          values = (await sails.models[modelName].findPopulate(criteria))[0];

          const associations = getAssociations(models[modelName]);

          values = Object.fromEntries(Object.entries(values)
            .map(([k, v]) => associations.includes(k) ? [k, v.map(i => i[id])] : [k, v])) as Values;
          await emitAll(mesh, modelName + '.afterCreate', values);
        }
      });

      patch(model, 'afterUpdate', async function (values: Values) {
        await emitAll(mesh, modelName + '.afterUpdate', values);
      });

      patch(model, 'afterDestroy', async function (values: Values) {
        if (values.peerIdEmitFrom === mesh.self.id) {
          await emitAll(mesh, modelName + '.afterDestroy', values.p2pId);
        }
      });
    }
  }
}

function getAssociations(model: Model) {
  return Object.entries(model.attributes).filter(([, type]) => type.collection).map(([name]) => name);
}

function getIdField(model: Model) {
  return sails.models[model.globalId.toLowerCase()].primaryKey;
}

function decorateModels() {
  function populateModelFields(actionName: string, newActionName: string, model: Model) {
    model[newActionName] = function (criteria) {
      return model[actionName].apply(this, {where: criteria}).populate(getAssociations(model));
    }
  }

  const models = sails.models;
  for (let modelName of Object.keys(models)) {
    if (!modelsPublic.length || modelsPublic.includes(modelName)) {
      let model = models[modelName];

      populateModelFields('find', 'findPopulate', model);
    }
  }
}

async function emitAboutModels(mesh: Mesh, lastUpdate: number, peerId?: string) {
  const models = sails.models;

  for (let modelName in models) {
    if (models.hasOwnProperty(modelName)) {
      if (!modelsPublic.length || modelsPublic.includes(modelName)) {
        const createdModels = await models[modelName].findPopulate({createdAt: {'>': new Date(lastUpdate)}});
        sails.log.silly('created', createdModels);

        for (let um of createdModels) {
          if (peerId) {
            await emit(mesh, peerId, modelName + '.afterCreate', um);
          } else {
            await emitAll(mesh, modelName + '.afterCreate', um);
          }
        }

        let updatedModels = await models[modelName].findPopulate({updatedAt: {'>': new Date(lastUpdate)}});
        updatedModels = updatedModels.filter(i => createdModels.filter(j => JSON.stringify(j) === JSON.stringify(i)).length === 0);
        sails.log.silly('updated', updatedModels);

        for (let um of updatedModels) {
          if (peerId) {
            await emit(mesh, peerId, modelName + '.afterUpdate', um);
          } else {
            await emitAll(mesh, modelName + '.afterUpdate', um);
          }
        }
      }
    }
  }
}

async function migrate(migrate: boolean) {
  if (migrate) {
    const models = sails.models;

    for (let modelName of Object.keys(models)) {
      let model = models[modelName];
      try {
        const findModels = await model.find();

        for (let findModel of findModels) {
          if (!findModel.p2pId) {
            findModel.p2pId = uuid();

            try {
              await findModel.save(); // TODO: sails1x
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

function getModelsForAction(action: string): any[] {
  let models = [];

  if (conf && conf.models) {
    if (Array.isArray(conf.models) && conf.models.length) {
      models = conf.models;
    }

    if (conf.models[action] && Array.isArray(conf.models[action])) {
      models = conf.models[action];
    }
  }
  return models;
}

function hashFromModel(instance: any) {
  const copy = {...instance};
  delete copy.createdAt;
  delete copy.updatedAt;
  const sorted = {};

  for (let key of Object.keys(copy).sort()) {
    sorted[key] = copy[key];
  }

  return JSON.stringify(sorted);
}
