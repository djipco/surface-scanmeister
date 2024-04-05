#!/usr/bin/node


import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(__dirname);

// try {
//   process.chdir(__dirname);
//   console.log('New directory: ' + process.cwd());
// } catch (err) {
//   console.error('chdir: ' + err);
// }


// Import necessary builtin modules
import { existsSync } from 'fs';

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
