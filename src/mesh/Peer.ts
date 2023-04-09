export interface PeerData {
  host: string;
  port: string;
  id: string;
}

export default class Peer implements PeerData {
  private readonly _host: string;
  public readonly port: string;
  public id: string;

  constructor(host: string, port: string, id: string) {
    if (!host) {
      throw 'Peer > constructor > _host is required';
    }

    if (!port) {
      throw 'Peer > constructor > port is required';
    }

    this._host = host;
    this.port = port;
    this.id = id;
  }

  static getPeer(peer: Peer) {
    return new Peer(peer.host || peer._host, peer.port, peer.id);
  }

  getUrl() {
    // TODO: create an option to choose secure connection or not should be used
    return `http://${this._host}:${this.port}`;
  }

  get host() {
    return this._host;
  }
}
