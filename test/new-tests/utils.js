'use strict';

const path = require("path");
const fsExtra = require("fs-extra");
const { exec } = require('child_process');
const promisify = require("util").promisify;
const Sails = require('./temporaryServer/local/node_modules/sails').Sails;

async function sailsLift(directoryToCopy, name, config) {
  const distPath = path.join(path.dirname(directoryToCopy), name);

  const nodeModulesDirectory = path.join(directoryToCopy, '/node_modules');

  if (!fsExtra.existsSync(distPath)) {
    console.log('Copying of the server folder');
    fsExtra.copySync(directoryToCopy, distPath, {filter: src => path.resolve(src) !== nodeModulesDirectory});
    console.log('Server folder was copied');
  }

  if (!fsExtra.existsSync(path.join(distPath, 'node_modules'))) {
    console.log('Installing of the npm modules');
    await promisify(exec)('npm i', {cwd: distPath});
    console.log('npm modules was installed');
  }

  config.appPath = distPath;

  const app = new Sails();
  await promisify(app.lift)(config);

  return app;
}

module.exports = {
  sailsLift
}
