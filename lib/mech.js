const http = require('http');
const https = require('https');
const io = require('socket.io');
const client = require("socket.io-client");
const uuid = require('uuid/v4');

class Mesh {
  constructor(options) {
    if (!options) {
      throw 'Peer > constructor > Mesh options is required';
    }

    this.showLog = options.showLog;

    this.self = new Peer(options.host, options.port, uuid());
    if (this.showLog)
      console.log('MY ID', this.self.id);

    const otherPeers = options.knownPeers || [];
    this.knownPeers = new KnownPeers(this.self);

    this.password = options.password;
    this.state = 'lonely';
    this.listeners = {};
    this.onEvents = [];
    this.onConnectionElements = [];
    this.maxReconnect = options.maxReconnect || 3;

    let server;
    if (options.sertificate && options.privateKey) {
      server = https.createServer({
        key: options.privateKey,
        cert: options.certificate
      });
    } else {
      server = http.createServer();
    }

    this.server = server;
    this.serverSocket = io(this.server);

    server.listen(this.self.port, () => {
      if (this.showLog)
        console.log('Server started on port', this.self.port);
    });

    this.clients = {};
    if (otherPeers.length)
      this.connectNewPeers(otherPeers);

    this.setupServerListeners();
  }

  setupServerListeners() {
    this.serverSocket.on('connection', socket => {
      if (this.showLog)
        console.log('on server connection');
      socket.emit('get info', info => {
        if (this.showLog)
          console.log('get info cb');
        if (this.password) {
          if (!info.password || !info.password === this.password) {
            socket.disconnect(true);
          }
        }

        if (this.state !== 'connection') {
          this.newState('connection');
        }

        if (this.showLog)
          console.log('server connect new clients', info.knownPeers);
        this.knownPeers.add(info.self);
        this.connectNewPeers(info.knownPeers.peers);

        this.clients[info.self.id] = socket;
        if (this.showLog)
          console.log('server connect new clients', Object.keys(this.clients));

        socket.emit('send peers', {
          peers: this.knownPeers.getPeers(),
          self: this.self
        });
      });

      socket.on('joined', () => {
        this.onConnectionElements.pop();
        if (this.showLog)
          console.log('on joined', this.onConnectionElements.length);
        if (!this.onConnectionElements.length)
          this.newState('joined');
      });

      for (let on of this.onEvents) {
        if (this.showLog)
          console.log('add listener', on.name);
        socket.on(on.name, on.cb);
      }

      socket.on('disconnect', () => {
        const key = this.getKeyByValue(this.clients, socket);
        delete this.clients[key];
        if (this.showLog)
          console.log('client', key, 'was disconnected, clients left', Object.keys(this.clients));
      });
    });
  }

  setupClientListeners(client, peer) {
    client.on('get info', cb => {
      counter = 0;
      if (this.showLog)
        console.log('on get info');
      cb({
        password: this.password,
        knownPeers: this.knownPeers,
        self: this.self
      });
    });

    client.on('send peers', info => {
      if (this.showLog)
        console.log('connect new peers', info);

      if (!peer.id) {
        peer.id = info.self.id;
      }

      this.clients[peer.id] = client;
      if (this.showLog)
        console.log('connect new peer', Object.keys(this.clients));

      this.connectNewPeers(info.peers);

      for (let on of this.onEvents) {
        if (this.showLog)
          console.log('add listener', on.name);
        client.on(on.name, on.cb);
      }

      this.onConnectionElements.pop();
      if (!this.onConnectionElements.length) {
        this.newState('joined');
        client.emit('joined');
      }
    });

    let counter = 0;

    client.on('disconnect', reason => {
      if (reason === 'ping timeout' || reason === 'io server disconnect') {
        if (counter < this.maxReconnect) {
          counter++;
          return client.connect();
        }
      }
      const key = this.getKeyByValue(this.clients, client);
      delete this.clients[key];
      if (this.showLog)
        console.log('client', key, 'was disconnected, clients left', Object.keys(this.clients));
    });
  }

  connectNewPeers(newPeers) {
    newPeers = this.knownPeers.add(newPeers);
    this.onConnectionElements.push(...newPeers);

    for (let peer of newPeers) {
      if (this.showLog)
        console.log('Mesh > connectNewPeers > try to connect to', peer.getUrl());
      const connect = client.connect(peer.getUrl());
      this.setupClientListeners(connect, peer);
    }
  }

  emitRemote(name, peer, ...args) {
    if (!name)
      throw 'name is required';

    if (!peer)
      throw 'peer is required';

    let peerId;
    if (typeof peer === 'string')
      peerId = peer;

    if (typeof peer === 'object')
      peerId = peer.id;

    if (this.showLog)
      console.log('emitRemote', name, peerId);
    this.clients[peerId].emit(name, ...args);
  }

  emitRemoteAll(name, ...args) {
    if (this.showLog)
      console.log('emitAll', name, Object.keys(this.clients));
    for (let id in this.clients) {
      this.emitRemote(name, id, ...args);
    }
  }

  onRemote(name, cb) {
    this.onEvents.push({name, cb});
    for (let id in this.clients) {
      if (this.showLog)
        console.log('set event listener', name, 'for', id);
      this.clients[id].on(name, cb);
    }
  }

  emit(name, ...args) {
    if (this.showLog)
      console.log('emit', name);
    const listener = this.listeners[name];
    if (!listener)
      return;

    for (let listenerElement of listener) {
      listenerElement.fn.apply(null, args);
      if (listenerElement.once)
        listener.splice(listener.indexOf(listenerElement), 1);
    }
  }

  on(name, fn) {
    const listener = this.listeners[name];
    const obj = {fn, once: false};
    if (!listener) {
      this.listeners[name] = [obj];
    } else {
      listener.push(obj);
    }
  }

  once(name, fn) {
    const listener = this.listeners[name];
    const obj = {fn, once: true};
    if (!listener) {
      this.listeners[name] = [obj];
    } else {
      listener.push(obj);
    }
  }

  newState(state) {
    if (state === this.state)
      return;

    this.emit('changeState', this.state, state);
    this.emit(state);

    this.state = state;
  }

  getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
  }
}

class KnownPeers {
  constructor(knownPeers) {
    knownPeers = knownPeers || [];

    if (!Array.isArray(knownPeers))
      knownPeers = [knownPeers];

    this.peers = [];
    this.add(knownPeers);
  }

  getPeers() {
    return this.peers;
  }

  add(newPeers) {
    if (!newPeers)
      return [];

    if (!Array.isArray(newPeers))
      newPeers = [newPeers];

    const addedPeers = [];
    for (let peer of newPeers) {
      if (peer.host && peer.port) {
        if (!this.find(peer)) {
          if (!(peer instanceof Peer))
            peer = new Peer(peer.host, peer.port, peer.id);
          this.peers.push(peer);
          addedPeers.push(peer);
        }
      }
    }

    return addedPeers;
  }

  find(peer) {
    return this.peers.filter(p => p.host === peer.host && p.port === peer.port)[0];
  }
}

class Peer {
  constructor(host, port, id) {
    if (!host)
      throw 'Peer > constructor > host is required';
    if (!port)
      throw 'Peer > constructor > port is required';

    this.host = host;
    this.port = port;
    this.id = id;
  }

  getUrl() {
    return 'http://' + this.host + ':' + this.port;
  }
}

module.exports = Mesh;
