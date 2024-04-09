import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

export default class Client extends EventEmitter {

  constructor(socket, options = {}) {

    super();

    this.callbacks = {};
    this.channel = options.channel;     // defined only when a scan is ongoing
    this.socket = socket;

    this.callbacks.onSocketClose = this.#onSocketClose.bind(this);
    this.socket.once("close", this.callbacks.onSocketClose);

  }

  get id() {
    return `${this.socket.remoteAddress}:${this.socket.remotePort}`;
  }

  get scanning() {
    return Number.isInteger(this.channel);
  }

  async #onSocketClose() {
    // this.destroy();
  }

  async destroy() {

    // Remove all listeners from the client
    this.removeListener();

    if (this.callbacks.onSocketClose) {
      this.socket.off("close", this.callbacks.onSocketClose);
      this.callbacks.onSocketClose = undefined;
    }

    if (this.socket) this.socket.destroy();

    // if (this.scanSpawner) await this.scanSpawner.destroy();

    this.callbacks = {};
    this.channel = undefined;
    // this.scanSpawner = undefined;
    // this.socket = undefined;
    //
    // this.emit("destroy");

  }

}


