export const Configuration = {

  paths: {
    images: './scans',                // Directory where scans should be saved (in "file" mode)
    logs: "./logs"                    // Directory where logfiles should be saved
  },

  operation: {
    mode: 'tcp'                     // Save scan locally (file) or stream them via network (tcp)
  },

  tcp: {
    address: "10.0.0.200",          // Address of the remote TCP socket server to stream images to
    port: "1234"                    // Port of the remote server
  },

  osc: {
    localAddress: '0.0.0.0',        // Local IP address to bind to for OSC
    localPort: 8000,                // Local port to listen on for OSC
    remoteAddress: '10.0.0.200',    // Remote IP address to send OSC to
    remotePort: 10000               // Remote port to send OSC on
  },

  devices: {

    // Whether to use a custom mapping for the channels assigned to each scanner. The value can be
    // null or one of the mappings from the /config/ScannerMappings.js file
    // mapping: "Atolla16PortBus1Port1Dynex7PortBus3Port1",
    // mapping: "Atolla16PortBus1Port1",
    // mapping: "Pi4",
    mapping: null,                // Name of the mapping to use or null

    resolution: 150,              // Scanning resolution (75, 100, 150, 300, 600, 1200, 2400, 4800)
    brightness: 25,               // Scanning brightness (-100...100)
    contrast: 25,                 // Scanning contrast (-100...100)
    lampOffScan: false,           // Whether to shut off lamp while scanning
    lampOffTime: 15,              // Delay after which the lamp is turned off (0...60 min.)
    x: 0,                         // Horizontal position to start the scan at (0...216.7mm)
    y: 0,                         // Vertical position to start the scan at (0...297.5mm)
    width: 216.07,                // Width of scan area (0...216.7mm)
    height: 297.5,                // Height of scan area (0...297.5mm)

  }

};
