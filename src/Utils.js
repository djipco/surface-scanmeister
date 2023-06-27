import { format } from "date-fns";

export function getTimeStampString() {
  return format(new Date(), "[yyyy-MM-dd'T'HH:mm:ss]")
}
export function logError(text, omitTimestamp = false) {
  if (omitTimestamp) {
    console.error('\x1b[91m' + text + '\x1b[0m');
  } else {
    console.error(getTimeStampString(), '\x1b[91m' + text + '\x1b[0m');
  }
}

export function logWarn(text, omitTimestamp = false) {
  if (omitTimestamp) {
    console.warn('\x1b[93m' + text + '\x1b[0m');
  } else {
    console.warn(getTimeStampString(), '\x1b[93m' + text + '\x1b[0m');
  }
}

export function logInfo(text, omitTimestamp = false) {
  if (omitTimestamp) {
    console.info(text);
  } else {
    console.info(getTimeStampString(), text);
  }
}
