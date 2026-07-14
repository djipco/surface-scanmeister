import {spawn} from "child_process";

import {Configuration as config} from "../config/Configuration.js";
import {ShellCommand} from "./ShellCommand.js";

export class ProcessRunner {

  #bufferStdout = false;
  #callbacks = {};
  #command;
  #handlers = {};
  #parameters = [];
  #process;
  #spawnOptions = {};
  #stdoutBuffer = "";

  execute(command, parameters = [], options = {}) {
    const {
      bufferStdout = false,
      closeCallback,
      dataCallback,
      errorCallback,
      stderrCallback,
      successCallback,
      ...spawnOptions
    } = options;

    this.#bufferStdout = bufferStdout;
    this.#command = command;
    this.#handlers = {
      close: closeCallback,
      data: dataCallback,
      error: errorCallback,
      stderr: stderrCallback,
      success: successCallback
    };
    this.#parameters = parameters;
    this.#spawnOptions = spawnOptions;
    this.#stdoutBuffer = "";

    this.#process = spawn(command, parameters, spawnOptions);
    this.#addProcessListeners();
  }

  get pid() {
    return this.#process?.pid;
  }

  pipe(destination, source = "stdout") {
    const stream = source === "stderr" ? this.#process?.stderr : this.#process?.stdout;
    if (!stream) throw new Error(`Cannot pipe ${source}; process is not running.`);
    stream.pipe(destination);
  }

  getDetails() {
    return ShellCommand.formatForDisplay(this.#command, this.#parameters);
  }

  async destroy() {
    const childProcess = this.#process;
    if (!childProcess) return;

    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      this.#cleanup();
      return;
    }

    await new Promise(resolve => {
      let forceKillTimeout;

      const onExit = () => {
        clearTimeout(forceKillTimeout);
        resolve();
      };

      this.#removeProcessListeners();
      childProcess.once('exit', onExit);
      childProcess.kill('SIGTERM');

      forceKillTimeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
        resolve();
      }, config.process.killTimeout);
    });

    this.#cleanup();
  }

  #addProcessListeners() {
    this.#callbacks.onProcessClose = this.#onProcessClose.bind(this);
    this.#callbacks.onProcessError = this.#onProcessError.bind(this);
    this.#callbacks.onProcessStderr = this.#onProcessStderr.bind(this);
    this.#callbacks.onProcessStdout = this.#onProcessStdout.bind(this);

    this.#process.once('error', this.#callbacks.onProcessError);
    this.#process.once('close', this.#callbacks.onProcessClose);

    if (this.#process.stdout) {
      this.#process.stdout.once('error', this.#callbacks.onProcessError);
      if (this.#bufferStdout || typeof this.#handlers.data === 'function') {
        this.#process.stdout.on('data', this.#callbacks.onProcessStdout);
      }
    }

    if (this.#process.stderr) {
      this.#process.stderr.on('data', this.#callbacks.onProcessStderr);
    }
  }

  #onProcessStderr(data) {
    const message = data.toString().trim();
    if (typeof this.#handlers.stderr === 'function') {
      this.#handlers.stderr(message);
    }
  }

  #onProcessError(error) {
    if (typeof this.#handlers.error === 'function') {
      this.#handlers.error(error);
    }

    this.#cleanup();
  }

  #onProcessStdout(data) {
    if (this.#bufferStdout) {
      this.#stdoutBuffer += data.toString();
    }

    if (typeof this.#handlers.data === 'function') {
      this.#handlers.data(data.toString().trim());
    }
  }

  #onProcessClose(code, signal) {
    if (code === 0 && typeof this.#handlers.success === 'function') {
      this.#handlers.success(this.#bufferStdout ? this.#stdoutBuffer : undefined);
    } else if (code !== 0 && typeof this.#handlers.error === 'function') {
      this.#handlers.error(
        new Error(`${this.getDetails()} exited with code ${code ?? "none"} and signal ${signal ?? "none"}`)
      );
    }

    if (typeof this.#handlers.close === 'function') {
      this.#handlers.close({code, signal});
    }

    this.#cleanup();
  }

  #cleanup() {
    this.#removeProcessListeners();
    this.#bufferStdout = false;
    this.#handlers = {};
    this.#process = undefined;
    this.#spawnOptions = {};
    this.#stdoutBuffer = "";
  }

  #removeProcessListeners() {
    if (!this.#process) return;

    this.#process.removeAllListeners();
    this.#process.stdout?.removeAllListeners();
    this.#process.stderr?.removeAllListeners();
    this.#callbacks = {};
  }

}
