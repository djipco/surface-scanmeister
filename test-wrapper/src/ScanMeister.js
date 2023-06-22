export class ScanMeister {

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
        let scanimage = processes.spawn(
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

    let scanimage = processes.spawn('scanimage', args);
    return scanimage.stdout;
    
  }

}


// const options = {
//   format: 'png',
//   resolution: '150dpi'
// };


// const device = {
// name: 'genesys:libusb:001:016',
// //index: '2'
// }