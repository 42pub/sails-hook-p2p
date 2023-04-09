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
    fsExtra.copySync(directoryToCopy, distPath, {filter: src => path.resolve(src) !== nodeModulesDirectory});
  }

  if (!fsExtra.existsSync(path.join(distPath, 'node_modules'))) {
    await promisify(exec)('npm i', {cwd: distPath});
  }

  config.appPath = distPath;

  const app = new Sails();
  await promisify(app.lift)(config);

  return app;
}

module.exports = {
  sailsLift
}
