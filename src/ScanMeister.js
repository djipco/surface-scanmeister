import {spawn} from 'child_process'

class ScanMeister {

  constructor() {
    this.devices = [];
  }

  async init() {
    this.devices = await this.getDevices();
  }

  async getDevices() {

    return new Promise((resolve, reject) => {

        // Resulting string buffer
        let buffer = '';

        // Format for device list
        const format = '{"name":"%d", "vendor":"%v", "model":"%m", "type":"%t", "index":"%i"} %n'

        // Spawn scanimage process to retrieve list
        let scanimage = spawn(
            'scanimage',
            ['--formatted-device-list=' + format]
        );

        // Error handler
        scanimage.stdout.once('error', reject);

        // Data handler
        scanimage.stdout.on('data', chunk => buffer += chunk.toString());

        // End handler
        scanimage.stdout.once('end', () => {
            if (buffer) {
                return resolve(buffer.split('\n').filter(Boolean).map(line => JSON.parse(line)));
            } else {
                return resolve([]);
            }
        });

    });

  }

  scan(device, options = {}) {

    // Get file format
    const format = options.format || 'png';

    // Start building args array
    let args = ['--format=' + format];

    if (this.device) {
        args.push('--device-name=' + this.device.name);
    }

    let scanimage = spawn('scanimage', args);
    return scanimage.stdout;
    
  }

}

// Export singleton instance class. The 'constructor' is nulled so that it cannot be used to 
// instantiate a new object or extend it. However, it is not freezed so it remains extensible 
// (properties can be added at will).
const sm = new ScanMeister();
sm.constructor = null;
export {sm as ScanMeister};


// const options = {
//   format: 'png',
//   resolution: '150dpi'
// };


// const device = {
// name: 'genesys:libusb:001:016',
// //index: '2'
// }