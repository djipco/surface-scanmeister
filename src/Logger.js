import { createLogger, format, transports } from "winston";
import "winston-daily-rotate-file";


const drfTransport = new transports.DailyRotateFile({
  level: 'info',
  filename: 'scanmeister.%DATE%.log',
  dirname: "logs",
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '60d'
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.colorize(),
    format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
    format.errors({ stack: true }),
    format.splat(),
    format.printf(
      info => `${[info.timestamp]} ${info.level.toUpperCase()}: ${info.message}`,
    ),
    // format.json()
  ),
  transports: [
    drfTransport,
    new transports.Console({format: format.simple()})
  ]
});

const logInfo = logger.info;
const logWarn = logger.warn;
const logError = logger.error;

export {logInfo, logWarn, logError};


// logger.log
// // info: test message my string {}
// logger.log('info', 'test message %s', 'my string');
//
// // info: test message 123 {}
// logger.log('info', 'test message %d', 123);
