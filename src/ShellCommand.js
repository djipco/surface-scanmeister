export class ShellCommand {

  static format(command, args = []) {
    return [command, ...args].map(arg => {
      if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) return arg;
      return "'" + arg.replaceAll("'", "'\\''") + "'";
    }).join(" ");
  }

}
