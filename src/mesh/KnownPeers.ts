import Peer, {PeerData} from "./Peer";

export default class KnownPeers {
  public readonly peers: Peer[];

  constructor(knownPeers?: Peer | Peer[]) {
    knownPeers = knownPeers || [];

    this.peers = [];
    this.add(knownPeers);
  }

  public add(newPeers: Peer | Peer[] | PeerData | PeerData[]): Peer[] {
    if (!newPeers) {
      return [];
    }

    // process all into one data format
    let peers: Peer[];
    if (!Array.isArray(newPeers)) {
      peers = [KnownPeers.getPeer(newPeers)];
    } else {
      peers = newPeers.map(p => KnownPeers.getPeer(p));
    }

    const addedPeers = [];

    for (let peer of peers) {
      if (!this.find(peer)) {
        this.peers.push(peer);
        addedPeers.push(peer);
      }
    }

    return addedPeers;
  }

  private static getPeer(newPeers: Peer | PeerData) {
    if (newPeers instanceof Peer) {
      return newPeers;
    } else {
      return new Peer(newPeers.host, newPeers.port, newPeers.id);
    }
  }

  private find(peer: Peer): Peer {
    return this.peers.filter(p => p.host === peer.host && p.port === peer.port)[0];
  }
}
