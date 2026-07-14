export class ShellCommand {

  // This formats commands for display/logging only. Execute commands with argv arrays instead.
  static formatForDisplay(command, args = []) {
    return [command, ...args].map(value => ShellCommand.quote(value)).join(" ");
  }

  static quote(value) {
    const stringValue = String(value);
    if (/^[A-Za-z0-9_./:=+-]+$/.test(stringValue)) return stringValue;
    return "'" + stringValue.replaceAll("'", "'\\''") + "'";
  }

}
