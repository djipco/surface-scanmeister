export class ToolCli {

  static parseCommonArguments(args, options = {}) {
    const parsedOptions = {
      file: options.defaultFile,
      replace: false
    };
    const positional = [];

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--file") {
        index += 1;
        if (!args[index]) throw new Error("--file requires a path");
        parsedOptions.file = args[index];
      } else if (arg.startsWith("--file=")) {
        parsedOptions.file = arg.slice("--file=".length);
      } else if (arg === "--replace" && options.allowReplace) {
        parsedOptions.replace = true;
      } else if (arg === "--help" || arg === "-h") {
        parsedOptions.help = true;
      } else {
        positional.push(arg);
      }
    }

    return {options: parsedOptions, positional};
  }

  static async readHidden(prompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Password prompt requires an interactive terminal");
    }

    return new Promise((resolve, reject) => {
      const stdin = process.stdin;
      const stdout = process.stdout;
      let value = "";

      const cleanup = () => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
      };

      const onData = data => {
        const text = data.toString("utf8");

        for (const character of text) {
          if (character === "\u0003") {
            cleanup();
            stdout.write("\n");
            reject(new Error("Cancelled"));
            return;
          }

          if (character === "\r" || character === "\n") {
            cleanup();
            stdout.write("\n");
            resolve(value);
            return;
          }

          if (character === "\b" || character === "\u007f") {
            value = value.slice(0, -1);
            continue;
          }

          value += character;
        }
      };

      stdout.write(prompt);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
    });
  }

  static fail(error) {
    console.error(`Error: ${error.message || error}`);
    process.exit(1);
  }

}
