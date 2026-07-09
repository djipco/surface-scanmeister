#!/usr/bin/env node

// At this stage, we only import necessary builtin modules because we first need to check if the
// external modules have been installed.
import { existsSync } from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

// Add handlers for unhandled exceptions and rejections.
process.on("uncaughtException", error => {
  console.error(`Uncaught exception: ${error.stack || error}`);
  process.exit(1);
});

process.on("unhandledRejection", reason => {
  console.error(`Unhandled rejection: ${reason?.stack || reason}`);
  process.exit(1);
});

// Check if the current working directory is the one where ScanMeister.js resides. If not, change
// it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.cwd() !== __dirname) {

  try {
    process.chdir(__dirname);
    console.log('Working directory changed to: ' + process.cwd());
  } catch (err) {
    console.error(`Could not change working directory: ${err}`);
    process.exit(1);
  }

}

// Check if external modules have been installed by looking for the 'node_modules' folder. If it
// exists, start normally. If not, display an error with instructions.
if (!existsSync('./node_modules')) {
  console.error(
    `Error: Node modules have not been installed. ` +
    `To install them, use 'npm install' in a Terminal at the root of the project.`
  );
  process.exit(1);
}

// Instantiate and start applicatio
const App = (await import(`./src/App.js`)).default;
const app = new App();

try {
  await app.start();
} catch (error) {
  console.error(error);
  await app.quit(1);
}
