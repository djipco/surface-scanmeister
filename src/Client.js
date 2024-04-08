import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

export default class Client extends EventEmitter {

  constructor(socket) {

    super();

    this.callbacks = {};
    this.channel = undefined;
    this.scanSpawner = undefined;
    this.socket = socket;

    this.callbacks.onSocketClose = this.#onSocketClose.bind(this);
    this.socket.on("close", this.callbacks.onSocketClose);

  }

  get id() {
    return `${this.socket.remoteAddress}:${this.socket.remotePort}`;
  }

  async #onSocketClose() {
    this.destroy();
  }

  async destroy() {

    if (this.socket) this.socket.close();

    if (this.callbacks.onSocketClose) {
      this.socket.off("close", this.callbacks.onSocketClose);
      this.callbacks.onSocketClose = undefined;
    }

    if (this.scanSpawner) await this.scanSpawner.destroy();

    this.callbacks = {};
    this.channel = undefined;
    this.scanning = false;
    this.scanSpawner = undefined;
    this.socket = undefined;

    this.emit("destroy");

  }

}


