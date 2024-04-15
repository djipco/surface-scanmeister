#!/usr/bin/node

// @todo get the sensor's read_lux() function working. Issue here:
//    https://github.com/adafruit/Adafruit_CircuitPython_VL6180X/issues
// @todo fix problem with last bytes being outputted late from scanimage. Issue here:
//    https://gitlab.com/sane-project/backends/-/issues/737

// At this stage, we only import necessary builtin modules because we first need to check if the
// external modules have been installed.
import { existsSync } from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

// Check if the current working directory is the one where ScanMeister.js resides. If not (such as
// when started from systemd),s change it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.cwd() !== __dirname) {

  try {
    process.chdir(__dirname);
    console.log('Working directory changed to: ' + process.cwd());
  } catch (err) {
    console.error(`\x1b[91m Could not change working directory: ${err} \x1b[0m`);
    process.exit(1);
  }

}

// Check if external modules have been installed by looking for the 'node_modules' folder. If it
// exists, start normally. If not, display error with instructions.
if (existsSync('./node_modules')) {

  const App = (await import(`./src/App.js`)).default;
  const app = new App();
  app.start()
    .catch(async error => {
      console.error(`\x1b[91m ${error} \x1b[0m`);
      await app.quit(1);
    });

} else {

  console.error(
    `\x1b[91m Error: Modules have not been installed. ` +
    `To install them, use 'npm install' in a Terminal at root of project.\x1b[0m`
  );
  process.exit(1);

}
