import { createLogger, format, transports } from "winston";
import "winston-daily-rotate-file";
import { readFile } from 'fs/promises';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
import {Configuration as config} from "../config/Configuration.js";
import fs from "fs-extra";

// Check if the directory to save logs in can be found
try {
  await fs.ensureDir(config.paths.logs);
} catch (err) {
  logWarn(
    `The directory to save logs in ('${config.paths.logs}') cannot be created. ` +
    `Using './' instead.`
  );
}

// Prepare daily rotate file transport
const drfTransport = new transports.DailyRotateFile({
  level: 'debug',
  filename: `${pkg.name}.%DATE%.log`,
  dirname: config.logs,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '60d'
});

// Create logger
const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp({format: 'YYYY-MM-DD HH:mm:ss.SSS'}),
    format.errors(),
    format.splat(),
    format.printf(({ level, message, timestamp }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    drfTransport,
    new transports.Console({
      format: format.combine(
        format.colorize({all: true, colors: {info: "white", warn: "yellow", error: "red"}}),
        format.printf(info => `${info.message}`),
      )
    })
  ]
});

// Export functions
const logInfo = logger.info;
const logWarn = logger.warn;
const logError = logger.error;
export {logInfo, logWarn, logError};
