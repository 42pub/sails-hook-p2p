import Peer from "./Peer";
import {Info} from "./MeshUsefulTypes";

export interface ClientToServerEvents {
  joined: () => void;
}

export interface ServerToClientEvents {
  getInfo: (cb: (info: Info) => void) => void;
  sendPeers: (data: SendPeersData) => void;
}

export interface SendPeersData {
  peers: Peer[];
  self: Peer;
}
