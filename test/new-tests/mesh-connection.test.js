const path = require("path");
require('should');
const {sailsLift} = require("./utils");
const promisify = require('util').promisify;

const MAIN_PORT = 1338;

let mainApp;
let peer1;

describe('Mesh connection', function () {
  this.timeout(300000);

  before(async function () {
    try {
      mainApp = await sailsLift(path.join(__dirname, './temporaryServer/local'), 'mainApp', {
        port: MAIN_PORT,
        log: {
          level: 'info'
        },
        p2p: {
          test: 1,
          host:  "127.0.0.1",
          peers: [],
          migrate: true,
          models: {
            public: ['pub'],
            grab: ['pub']
          },
          showLog: true,
          lastUpdate: 3 * 24 * 60 * 60 * 1000, // 3 days
          password: 'test'
        }
      });

      peer1 = await sailsLift(path.join(__dirname, './temporaryServer/local'), 'peer1', {
        appPath: path.join(__dirname, './temporaryServer/local/'),
        port: 1340,
        log: {
          level: 'info'
        },
        p2p: {
          test: 2,
          host:  "127.0.0.1",
          peers: [
            {
              host: "127.0.0.1",
              port: MAIN_PORT + 1
            }
          ],
          migrate: true,
          models: {
            public: ['pub'],
            grab: ['pub']
          },
          showLog: true,
          lastUpdate: 3 * 24 * 60 * 60 * 1000, // 3 days
          password: 'test'
        }
      });
    } catch (e) {
      throw e;
    }
  });

  it('should wait some time to debug', async () => {
    await new Promise(res => setTimeout(res, 3000));

    let mainAppEventRaised = false;
    let peer1EventRaised = false;
    mainApp.hooks.p2p.mesh.onRemote('test', () => mainAppEventRaised = true);
    peer1.hooks.p2p.mesh.onRemote('test', () => peer1EventRaised = true);

    await new Promise(res => setTimeout(res, 1000));

    mainApp.hooks.p2p.mesh.emitRemoteAll('test', {});
    peer1.hooks.p2p.mesh.emitRemoteAll('test', {});

    await new Promise(res => setTimeout(res, 100));

    mainAppEventRaised.should.be.true();
    peer1EventRaised.should.be.true();
  });

  after(async () => {
    mainApp && await promisify(mainApp.lower)();
    peer1 && await promisify(peer1.lower)();
  })

});
