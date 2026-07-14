import {createLogger, format, transports} from "winston";
import "winston-daily-rotate-file";
import {readFile} from 'fs/promises';

import {Configuration as config} from "../config/Configuration.js";
import {Permissions} from "./Permissions.js";

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

export class Logger {

  static #logger = Logger.#createLogger();

  static info(message, ...args) {
    Logger.#logger.info(message, ...args);
  }

  static warn(message, ...args) {
    Logger.#logger.warn(message, ...args);
  }

  static error(message, ...args) {
    Logger.#logger.error(message, ...args);
  }

  static #createLogger() {
    return createLogger({
      level: config.logging.level,
      format: format.combine(
        format.timestamp({format: config.logging.timestampFormat}),
        format.errors(),
        format.splat(),
        format.printf(({level, message, timestamp}) => {
          return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
      ),
      transports: Logger.#createTransports()
    });
  }

  static #createTransports() {
    const logDirectoryStatus = Permissions.ensureWritableDirectory("Logs", config.paths.logs);
    const activeTransports = [
      new transports.Console({
        format: format.combine(
          format.colorize({all: true, colors: {info: "white", warn: "yellow", error: "red"}}),
          format.printf(info => `${info.message}`)
        )
      })
    ];

    if (logDirectoryStatus.ok) {
      activeTransports.push(
        new transports.DailyRotateFile({
          level: config.logging.fileLevel,
          filename: `${pkg.name}.%DATE%.log`,
          dirname: config.paths.logs,
          datePattern: config.logging.datePattern,
          zippedArchive: config.logging.zippedArchive,
          maxSize: config.logging.maxSize,
          maxFiles: config.logging.maxFiles
        })
      );
    } else {
      console.error(Permissions.formatWritableDirectoryError(logDirectoryStatus));
    }

    return activeTransports;
  }

}
