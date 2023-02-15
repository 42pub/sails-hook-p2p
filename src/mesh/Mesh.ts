import http from 'http';
import https from 'https';
import uuid from 'uuid/v4';
import { Server, Socket as ServerSocket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';

import Peer from "./Peer";
import KnownPeers from "./KnownPeers";
import Logger from "../Logger";

interface CustomEvent {
  name: string;
  cb: (...any) => any;
}

interface MeshOptions {
  showLog: boolean;
  password?: string;
  maxReconnect?: number;
  host: string;
  port: string;
  certificate?: string;
  privateKey?: string;
  knownPeers?: Peer[];
}

interface Clients {
  [x: string]: ServerSocket | ClientSocket
}

interface Listener {
  fn: (...args: any) => void;
  once: boolean;
}

interface Listeners {
  [x: string]: Listener[]
}

interface Info {
  password?: string;
  knownPeers: KnownPeers;
  self: Peer;
}

type MeshState = 'lonely' | 'connection' | 'joined';

type AnyFunc = (...args: any) => any;

export default class Mesh {
  private readonly showLog: boolean;
  public readonly self: Peer;
  private readonly knownPeers: KnownPeers;
  private readonly password: string;
  private readonly listeners: Listeners;
  private readonly customEvents: CustomEvent[];
  private readonly maxReconnect: number;
  private readonly server: https.Server | http.Server;
  public readonly clients: Clients;
  private state: MeshState;
  private onConnectionElements: Peer[];
  private serverSocket: Server;
  private logger: Logger;

  public constructor(options: MeshOptions) {
    if (!options) {
      throw 'Peer > constructor > Mesh options is required';
    }

    this.showLog = options.showLog || false;
    this.logger = new Logger('Mesh', this.showLog);
    this.password = options.password;
    this.maxReconnect = options.maxReconnect || 3;

    this.state = 'lonely';
    this.listeners = {};
    this.customEvents = [];
    this.onConnectionElements = [];
    this.self = new Peer(options.host, options.port, uuid());
    this.knownPeers = new KnownPeers(this.self);

    this.logger.info('MY ID', this.self.id);

    if (options.certificate && options.privateKey) {
      this.server = https.createServer({
        key: options.privateKey,
        cert: options.certificate
      });
    } else {
      this.server = http.createServer();
    }

    this.serverSocket = new Server(this.server);

    const otherPeers = options.knownPeers || [] as Peer[];

    this.server.listen(this.self.port, () => {
      this.logger.info('Server started on port', this.self.port);
    });

    this.clients = {};
    if (otherPeers.length) {
      this.connectNewPeers(otherPeers);
    }

    this.setupServerListeners();
  }

  private setupServerListeners() {
    this.serverSocket.on('connection', socket => {

      this.logger.info('on server connection');

      // setup default events
      socket.emit('get info', (info: Info) => {
        this.logger.info('get info cb');

        if (this.password) {
          if (!info.password || info.password !== this.password) {
            return socket.disconnect(true);
          }
        }

        if (this.state !== 'connection') {
          this.newState('connection');
        }

        this.logger.info('server connect new clients', info.knownPeers);

        let newPeer = info.self;

        if (!newPeer.host || newPeer.host === "localhost") {
          let remoteAddress = socket.client.conn.remoteAddress.split(':');
          newPeer.host = remoteAddress[remoteAddress.length - 1]; // TODO: check is it needed
        }

        this.knownPeers.add(newPeer);
        this.connectNewPeers(info.knownPeers.peers);

        this.clients[info.self.id] = socket;
        this.logger.info('server connect new clients', Object.keys(this.clients));

        socket.emit('send peers', {
          peers: this.knownPeers.peers,
          self: this.self
        });
      });

      socket.on('joined', () => {
        this.onConnectionElements.pop();

        this.logger.info('on joined', this.onConnectionElements.length);

        if (this.onConnectionElements.length && this.state !== 'joined') {
          this.newState('joined');
        }
      });

      socket.on('disconnect', () => {
        const key = this.getKeyByValue(this.clients, socket);
        delete this.clients[key];

        this.logger.info('client', key, 'was disconnected, clients left', Object.keys(this.clients));
      });

      //  custom events
      for (let on of this.customEvents) {
        this.logger.info('add listener', on.name);
        socket.on(on.name, on.cb);
      }
    });
  }

  private setupClientListeners(client: ClientSocket, peer: Peer) {
    let counter = 0;

    client.on('get info', (cb: (info: Info) => void) => {
      // reset counter if ok
      counter = 0;

      this.logger.info('on get info');

      return cb({
        password: this.password,
        knownPeers: this.knownPeers,
        self: this.self
      });
    });

    client.on('send peers', (info: Info) => {
      this.logger.info('connect new peers', info);

      if (!peer.id) {
        peer.id = info.self.id; // TODO: check is it needed
      }

      this.clients[peer.id] = client;

      this.logger.info('connect new peer', Object.keys(this.clients));

      for (let on of this.customEvents) {
        this.logger.info('add listener', on.name);

        client.on(on.name, on.cb);
      }

      this.newState('joined');
      client.emit('joined');
    });

    client.on('disconnect', (reason: string) => {
      if (reason === 'ping timeout' || reason === 'io server disconnect') {
        if (counter < this.maxReconnect) {
          counter++;
          return client.connect();
        }
      }

      const key = this.getKeyByValue(this.clients, client);
      delete this.clients[key];

      this.logger.info('client', key, 'was disconnected, clients left', Object.keys(this.clients));
    });
  }

  private connectNewPeers(newPeers: Peer[]) {
    newPeers = this.knownPeers.add(newPeers);
    this.onConnectionElements.push(...newPeers);

    for (let peer of newPeers) {
      this.logger.info('connectNewPeers > try to connect to', peer.getUrl());

      const connect = io(peer.getUrl());
      this.setupClientListeners(connect, peer);
    }
  }

  public emitRemote(name: string, peer: string | Peer, ...args: any[]) {
    if (!name) {
      throw 'name is required';
    }

    if (!peer) {
      throw 'peer is required';
    }

    const peerId = typeof peer === 'string' ? peer : peer.id;

    this.logger.info('emitRemote', name, peerId);

    this.clients[peerId].emit(name, ...args);
  }

  public emitRemoteAll(name: string, ...args) {
    this.logger.info('emitAll', name, Object.keys(this.clients));

    for (let id in this.clients) {
      this.emitRemote(name, id, ...args);
    }
  }

  public onRemote(name: string, cb: AnyFunc) {
    this.customEvents.push({name, cb});

    for (let id in this.clients) {
      this.logger.info('set event listener', name, 'for', id);
      this.clients[id].on(name, cb);
    }
  }

  public emit(name: string, ...args: any[]) {
    this.logger.info('emit', name);
    const listener = this.listeners[name];

    if (!listener) {
      return;
    }

    for (let listenerElement of listener) {
      listenerElement.fn.apply(null, args);

      if (listenerElement.once) {
        listener.splice(listener.indexOf(listenerElement), 1);
      }
    }
  }

  public on(name: string, fn: AnyFunc) {
    this._on(name, fn, false);
  }

  public once(name: string, fn: AnyFunc) {
    this._on(name, fn, true);
  }

  private _on(name: string, fn: AnyFunc, once: boolean) {
    const listener = this.listeners[name];
    const obj: Listener = {fn, once};

    if (!listener) {
      this.listeners[name] = [obj];
    } else {
      listener.push(obj);
    }
  }

  private newState(state: MeshState): void {
    this.logger.info("new state", state);

    if (state === this.state) {
      return;
    }

    this.emit('changeState', this.state, state);
    this.emit(state);

    this.state = state;
  }

  private getKeyByValue<T>(object: T, value: T[keyof T]) {
    return Object.keys(object).find(key => object[key] === value);
  }
}



