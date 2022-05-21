"use strict";
require("mocha");
var Sails = require("./fixture/node_modules/sails").Sails;
before(function (done) {
    this.timeout(50000);
    require("./fixture/app-export");
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
