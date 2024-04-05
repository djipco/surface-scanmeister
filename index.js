#!/usr/bin/node

// Import necessary builtin modules
import { existsSync } from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

// Get file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if the current working directory is the one where index.js resides. If not (such as when
// started from systemd) change it.
if (process.cwd() !== __dirname) {

  try {
    process.chdir(__dirname);
    console.log('Working directory successfully changed to: ' + process.cwd());
  } catch (err) {
    console.error(`\x1b[91m Could not change working directory: ${err} \x1b[0m`);
    process.exit(1);
  }

}

// Check if external modules have been installed by looking for the 'node_modules' folder. If it
// exists, start normally. If not, display error with instructions.
if (existsSync('./node_modules')) {

  const ScanMeister = (await import(`./src/ScanMeister.js`)).default;
  const scanmeister = new ScanMeister();
  scanmeister.start()
    .catch(async error => {
      console.error(`\x1b[91m ${error} \x1b[0m`);
      await scanmeister.quit(1);
    });

} else {

  console.error(
    `\x1b[91m Error: Modules have not been installed. ` +
    `To install them, use 'npm install' in a Terminal at root of project.\x1b[0m`
  );

}
