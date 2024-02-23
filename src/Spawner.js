import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {spawn} from "child_process";

export class Spawner extends EventEmitter {

  #process;
  #buffer = "";
  #callbacks = {};
  #command;
  #parameters
  #options

  constructor() {
    super();
  }

  execute(command, parameters = [], options = {}) {

    this.#command = command;
    this.#parameters = parameters;
    this.#options = options;

    // Save user-defined callbacks
    this.#callbacks.onProcessSuccessUser = options.sucessCallback;
    this.#callbacks.onProcessErrorUser = options.errorCallback;
    this.#callbacks.onProcessStderrUser = options.stderrCallback;

    // Execute command and store resulting process object
    this.#command = command;
    this.#parameters = parameters;
    this.#options = options;
    this.#process = spawn(command, parameters, options);

    // Add error handlers
    this.#callbacks.onProcessError = this.#onProcessError.bind(this);
    this.#process.once('error', this.#callbacks.onProcessError);
    this.#process.stdout.once('error', this.#callbacks.onProcessError);

    // Add data handlers
    this.#callbacks.onProcessData = this.#onProcessData.bind(this);
    this.#process.stdout.on('data', this.#callbacks.onProcessData);
    this.#callbacks.onProcessStderr = this.#onProcessStderr.bind(this);
    this.#process.stderr.on('data', this.#callbacks.onProcessStderr);

    // Add completion handler
    this.#callbacks.onProcessEnd = this.#onProcessEnd.bind(this);
    this.#process.stdout.once('end', this.#callbacks.onProcessEnd);

  }

  pipe(destination, source = "stdout") {

    if (source === "stdout") {
      this.#process.stdout.pipe(destination);
    } else if (source === "stderr") {
      this.#process.stderr.pipe(destination);
    }

  }

  #onProcessStderr(data) {

    console.log("onProcessStderr", data);

    if (typeof this.#callbacks.onProcessStderrUser === 'function') {
      this.#callbacks.onProcessStderrUser(data.toString().trim());
    }

    this.emit("stderr", data.toString().trim() + this.getDetails());

  }

  getDetails() {
    return `${this.#command} // ${this.#parameters} // ${this.#options}`;
  }

  #onProcessError(error) {

    console.log("onProcessError", error);

    if (typeof this.#callbacks.onProcessErrorUser === 'function') {
      this.#callbacks.onProcessErrorUser();
    }

    this.#removeAllListeners();
    this.emit("error", error.message);

    this.#process = null;
    this.#buffer = "";
  }

  #onProcessData(data) {
    this.#buffer += data.toString()
  }

  #onProcessEnd(abc) {

    console.log("onProcessEnd", abc);

    if (typeof this.#callbacks.onProcessSuccessUser === 'function') {
      this.#callbacks.onProcessSuccessUser(this.#buffer);
    }
    this.emit("complete", this.#buffer);
    this.#removeAllListeners();
    this.#buffer = "";
    this.#process = null;
  }

  #removeAllListeners() {

    // Remove reference to user callbacks
    this.#callbacks.onProcessSuccessUser = null;
    this.#callbacks.onProcessErrorUser = null;
    this.#callbacks.onProcessStderrUser = null;

    this.#process.off('error', this.#callbacks.onProcessError);
    this.#process.stdout.off('error', this.#callbacks.onProcessError);
    this.#callbacks.onProcessError = null;

    this.#process.stdout.off('data', this.#callbacks.onProcessData);
    this.#callbacks.onProcessData = null;

    this.#process.stderr.off('data', this.#callbacks.onProcessStderr);
    this.#callbacks.onProcessStderr = null

    this.#process.stdout.off('end', this.#callbacks.onProcessEnd);
    this.#callbacks.onProcessEnd = null;

  }

  destroy() {
    this.#removeAllListeners();
    this.removeListener();
  }

}
