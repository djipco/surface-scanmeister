import { format } from "date-fns";

export function getTimeStampString() {
  return format(new Date(), "[yyyy-MM-dd'T'HH:mm:ss]")
}
export function logError(text) {
  // console.error(getTimeStampString(), text);

  console.error(getTimeStampString(), '\x1b[91m' + text + '\x1b[0m');
}

export function logWarn(text) {
  // console.warn(getTimeStampString(), text);
  console.error(getTimeStampString(), '\x1b[93m' + text + '\x1b[0m');
}

export function logInfo(text) {
  console.info(getTimeStampString(), text);
}
