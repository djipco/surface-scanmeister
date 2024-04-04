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
    this.#callbacks.onProcessDataUser = options.dataCallback;

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

    if (typeof this.#callbacks.onProcessStderrUser === 'function') {
      this.#callbacks.onProcessStderrUser(data.toString().trim());
    }

    this.removeAllListeners();
    this.emit("stderr", data.toString().trim() + this.getDetails());

  }

  getDetails() {
    return `${this.#command} // ${this.#parameters} // ${this.#options}`;
  }

  #onProcessError(error) {

    console.log("onProcessError");

    if (typeof this.#callbacks.onProcessErrorUser === 'function') {
      this.#callbacks.onProcessErrorUser(error);
    }

    this.removeAllListeners();
    this.emit("error", error.message);

    this.#process = null;
    this.#buffer = "";
  }

  #onProcessData(data) {
    this.#buffer += data.toString();

    if (typeof this.#callbacks.onProcessDataUser === 'function') {
      this.#callbacks.onProcessDataUser(data.toString().trim());
    }

    this.emit("data", data.toString().trim());

  }

  #onProcessEnd() {

    if (typeof this.#callbacks.onProcessSuccessUser === 'function') {
      this.#callbacks.onProcessSuccessUser(this.#buffer);
    }
    this.emit("complete", this.#buffer);
    this.removeAllListeners();
    this.#buffer = "";
    this.#process = null;
  }

  removeAllListeners() {

    this.removeListener();

    if (this.#process) {
      this.#process.removeAllListeners();
      if (this.#process.stdout) this.#process.stdout.removeAllListeners();
    }

    // Remove reference to user callbacks
    this.#callbacks.onProcessSuccessUser = null;
    this.#callbacks.onProcessErrorUser = null;
    this.#callbacks.onProcessStderrUser = null;
    this.#callbacks.onProcessError = null;
    this.#callbacks.onProcessData = null;
    this.#callbacks.onProcessStderr = null
    this.#callbacks.onProcessEnd = null;
    this.#callbacks.onProcessDataUser = null;

  }

  async destroy() {

    this.removeAllListeners();

    // Kill 'scanimage' process if present
    if (this.#process) {
      setTimeout(() => this.#process.kill('SIGKILL'), 500); // Forceful kill
      this.#process.kill('SIGTERM'); // Graceful kill
      await new Promise(resolve => this.#process.on('exit', () => resolve));
    }

  }

}
