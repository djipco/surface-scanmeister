import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

export default class Client extends EventEmitter {

  #callbacks = {};

  constructor(socket, options = {}) {

    super();

    this.channel = options.channel;     // defined only when a scan is ongoing
    this.socket = socket;

    this.#callbacks.onSocketClose = this.#onSocketClose.bind(this);
    this.socket.once("close", this.#callbacks.onSocketClose);

  }

  get id() {
    if (this.socket) {
      return `${this.socket.remoteAddress}:${this.socket.remotePort}`;
    } else {
      return undefined;
    }
  }

  get scanning() {
    return Number.isInteger(this.channel);
  }

  async #onSocketClose() {
    this.destroy();
  }

  async destroy() {

    // Remove all listeners from the Client object
    this.removeListener();

    if (this.#callbacks.onSocketClose) {
      this.socket.off("close", this.#callbacks.onSocketClose);
      this.#callbacks.onSocketClose = undefined;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = undefined;
    }

    this.#callbacks = {};
    this.channel = undefined;

  }

}
