export const Configuration = {

  paths: {
    images: './scans',                // Directory where scans should be saved (in "file" mode)
    logs: "./logs"                    // Directory where logfiles should be saved
  },

  operation: {
    mode: 'file'                    // Save scan locally (file) or send it via network (tcp)
  },

  tcp: {
    address: "10.0.0.200",          // Address of the remote TCP socket server
    port: "1234"                    // Port of the remote server
  },

  osc: {
    localAddress: '0.0.0.0',        // Local IP address to bind to for OSC
    localPort: 8000,                // Local port to listen on for OSC
    remoteAddress: '10.0.0.200',    // Remote IP address to send OSC to
    remotePort: 10000               // Remote port to send OSC to
  },

  devices: {

    // Whether to use a custom mapping for the channels assigned to each scanner. The value can be
    // null or one of the mappings from the /config/ScannerMappings.js file
    mapping: "Atolla16PortBus1Port1Dynex7PortBus3Port1", // Name of the mapping to use
    // mapping: "Atolla16PortBus1Port1",

    resolution: 150,                // [75, 100, 150, 300, 600, 1200, 2400, 4800]
    brightness: 25,                 // The scanning brightness (-100...100)
    contrast: 25,                   // The scanning contrast (-100...100)
    lampOffScan: false,             // Whether to close the lamp while scanning
    lampOffTime: 15,                // Number of min. after which the lamp is turned off (0...60)
    x: 0,                           // The x position to start the scan at (0...216.7mm)
    y: 0,                           // The y position to start the scan at (0...297.5mm)
    width: 216.07,                  // Width of scan area (0...216.7mm)
    height: 297.5,                  // Height of scan area (0...297.5mm)

  }

};
