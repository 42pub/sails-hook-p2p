export interface PeerData {
  host: string;
  port: string;
  id: string;
}

export default class Peer implements PeerData {
  private _host: string;
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

  getUrl() {
    return `https://${this._host}:${this.port}`;
  }

  get host() {
    return this._host;
  }

  set host(host: string) {
    this._host = host;
  }
}

