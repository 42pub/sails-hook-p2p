"use strict";
require("mocha");

var childProcess = require("child_process");
var path = require("path");



// Start peer1
var peer1 = childProcess.fork(path.join(__dirname,  "fixtures/peer1", "app.js"));
peer1.on("exit", function (code, signal) {
    console.log("Exited peer1", {code: code, signal: signal});
});
peer1.on("error", console.error.bind(console));



// Start peer2
var peer2 = childProcess.fork(path.join(__dirname,  "fixtures/peer2", "app.js"));
peer2.on("exit", function (code, signal) {
    console.log("Exited peer2", {code: code, signal: signal});
});
peer2.on("error", console.error.bind(console));



var Sails = require("./fixtures/local/node_modules/sails").Sails;
before(function (done) {
    this.timeout(60000);
    require("./fixtures/local/app-export");
    Sails().lift({}, function (err, _sails) {
        if (err)
            return done(err);
        global.sails = _sails;
        return done();
    });
});
after(function (done) {
    if (global.sails) {
        return global.sails.lower(function (err) {
            if (err) {
                done();
            }
            done();
        });
    }
    done();
});

process.on('exit', function () {
    peer1.kill('SIGINT');
    peer2.kill('SIGINT');
});

global.sleep = function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
