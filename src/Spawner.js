import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";
import {spawn} from "child_process";

export class Spawner extends EventEmitter {

  #process;
  #buffer = "";
  #callbacks = {};

  constructor() {
    super();
  }

  execute(command, parameters = [], options = {}) {

    // Save user-defined callbacks
    this.#callbacks.onProcessUserSuccess = options.sucessCallback;
    this.#callbacks.onProcessUserError = options.errorCallback;
    this.#callbacks.onProcessUserStderr = options.stderrCallback;

    // Execute command
    this.#process = spawn(command, parameters, options);

    // Add error handlers
    this.#callbacks.onProcessError = this.#onProcessError.bind(this);
    this.#process.once('error', this.#callbacks.onProcessError);
    this.#process.stdout.once('error', this.#callbacks.onProcessError);


    // this.#process.stderr.once('data', this.#callbacks.onProcessError);

    // TO FINALIZE !!!!!!
    this.#process.stderr.on('data', data => {
      this.#callbacks.onProcessUserStderr(data.toString());
    });

    // Data handler
    this.#callbacks.onProcessData = this.#onProcessData.bind(this);
    this.#process.stdout.on('data', this.#callbacks.onProcessData);

    // Completion handler
    this.#callbacks.onProcessEnd = this.#onProcessEnd.bind(this);
    this.#process.stdout.once('end', this.#callbacks.onProcessEnd);

  }

  #onProcessError(error) {
    if (typeof this.#callbacks.onProcessUserError === 'function') {
      this.#callbacks.onProcessUserError();
    }
    this.#removeAllListeners();
    this.emit("error", Buffer.from(error, "utf-8"));
    this.#process = null;
    this.#buffer = "";
  }

  #onProcessData(data) {
    this.#buffer += data.toString()
  }

  #onProcessEnd() {
    if (typeof this.#callbacks.onProcessUserSuccess === 'function') {
      this.#callbacks.onProcessUserSuccess(this.#buffer);
    }
    this.emit("complete", this.#buffer);
    this.#removeAllListeners();
    this.#buffer = "";
    this.#process = null;
  }

  #removeAllListeners() {

    this.#callbacks.onProcessUserSuccess = null;
    this.#callbacks.onProcessUserError = null;

    this.#process.off('error', this.#callbacks.onProcessError);
    this.#process.stdout.off('error', this.#callbacks.onProcessError);
    this.#process.stderr.off('data', this.#callbacks.onProcessError);
    this.#callbacks.onProcessError = null;

    this.#process.stdout.off('data', this.#callbacks.onProcessData);
    this.#callbacks.onProcessData = null;

    this.#process.stdout.off('end', this.#callbacks.onProcessEnd);
    this.#callbacks.onProcessEnd = null;

  }

  destroy() {
    this.#removeAllListeners();
    this.removeListener();
  }

}
