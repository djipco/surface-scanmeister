import { createLogger, format, transports } from "winston";
import "winston-daily-rotate-file";


const transport = new transports.DailyRotateFile({
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
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.splat(),
    // format.json()
  ),
  defaultMeta: { service: 'scanmeister' },
  transports: [
    transport,
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
