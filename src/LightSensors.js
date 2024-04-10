// Application imports
import {logError, logInfo, logWarn} from "./Logger.js";
import {EventEmitter} from "../node_modules/djipevents/dist/esm/djipevents.esm.min.js";

import {SerialPort} from 'serialport';
import {ReadlineParser} from '@serialport/parser-readline';


export class LightSensors extends EventEmitter {

  #callbacks = {};
  #parser;
  #port;
  #values = [];

  constructor() {
    super();
  }

  #onData(data) {
    this.#values = data.toString().split(",").map(value => parseFloat(value));
    this.emit("data", this.#values);
  }

  get values() {
    return this.#values;
  }

  async start() {

    // // const ports = await SerialPort.list();
    // // logInfo(ports);
    // // const arduinoPort = ports.find(port => port.manufacturer?.includes('Arduino'));
    // // return arduinoPort ? arduinoPort.path : null;

    // Set up serial connection and line parser
    try {
      this.#port = new SerialPort('/dev/ttyACM0', {baudRate: 115200});
      this.#parser = this.#port.pipe(new ReadlineParser({delimiter: '\n'}));
    } catch (e) {
      logError(e);
    }

    Listen for 'data' event
    this.#callbacks.onData = this.#onData.bind(this);
    this.#parser.on('data', this.#callbacks.onData);

  }

  quit() {
    this.#parser.off('data', this.#callbacks.onData);
    this.#callbacks.onData = undefined;
  }

}
