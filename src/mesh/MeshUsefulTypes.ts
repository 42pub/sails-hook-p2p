import Peer from "./Peer";
import {Socket as ServerSocket} from "socket.io/dist/socket";
import {Socket as ClientSocket} from "socket.io-client";
import KnownPeers from "./KnownPeers";

export interface CustomEvent {
  name: string;
  cb: (...any) => any;
}

export interface MeshOptions {
  showLog: boolean;
  password?: string;
  maxReconnect?: number;
  host: string;
  port: string;
  certificate?: string;
  privateKey?: string;
  knownPeers?: Peer[];
}

export interface Clients {
  [x: string]: ServerSocket | ClientSocket
}

export interface Listener {
  fn: (...args: any) => void;
  once: boolean;
}

export interface Listeners {
  [x: string]: Listener[]
}

export interface Info {
  password?: string;
  knownPeers: KnownPeers;
  self: Peer;
}

export type MeshState = 'lonely' | 'connection' | 'joined';

export type AnyFunc = (...args: any) => any;
