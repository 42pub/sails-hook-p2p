#!/usr/bin/env bash
TEST=$PWD
cd $TEST/fixtures/local && npm i
rm -rf $TEST/fixtures/peer1/node_modules rm -rf $TEST/fixtures/peer2/node_modules
cd $TEST/fixtures/peer1 && ln -s $TEST/fixtures/local/node_modules ./node_modules
cd $TEST/fixtures/peer2 && ln -s $TEST/fixtures/local/node_modules ./node_modules
