import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {spawn} from "child_process";

export class Spawner extends EventEmitter {

  #process;
  #buffer;
  #callbacks = {};

  constructor() {
    super();
  }

  execute(command, parameters = [], options = {}) {

    // Save user-defined callback
    this.#callbacks.onProcessEndUser = options.callback;

    // Execute command
    this.#process = spawn(command, parameters, options);

    // Add error handlers
    this.#callbacks.onProcessError = this.#onProcessError.bind(this);
    this.#process.once('error', this.#callbacks.onProcessError);
    this.#process.stdout.once('error', this.#callbacks.onProcessError);
    this.#process.stderr.once('data', this.#callbacks.onProcessError);

    // Data handler
    this.#callbacks.onProcessData = this.#onProcessData.bind(this);
    this.#process.stdout.on('data', this.#callbacks.onProcessData);

    // Completion handler
    this.#callbacks.onProcessEnd = this.#onProcessEnd.bind(this);
    this.#process.stdout.once('end', this.#callbacks.onProcessEnd);

  }

  #onProcessError(error) {
    this.removeAllListeners();
    this.#buffer = null;
    this.#process = null;
    this.emit("error", Buffer.from(error, "utf-8"));
  }

  #onProcessData(data) {
    this.#buffer += data.toString()
  }

  #onProcessEnd() {
    this.#callbacks.onProcessEndUser();
    this.emit("complete", this.#buffer);
    this.removeAllListeners();
    this.#buffer = null;
    this.#process = null;
  }

  removeAllListeners() {

    this.#callbacks.onProcessEndUser = null;

    this.#process.off('error', this.#callbacks.onProcessError);
    this.#process.stdout.off('error', this.#callbacks.onProcessError);
    this.#process.stderr.off('data', this.#callbacks.onProcessError);
    this.#callbacks.onProcessError = null;

    this.#process.stdout.off('data', this.#callbacks.onProcessData);
    this.#callbacks.onProcessData = null;

    this.#process.stdout.off('end', this.#callbacks.onProcessEnd);
    this.#callbacks.onProcessEnd = null;

  }

}
