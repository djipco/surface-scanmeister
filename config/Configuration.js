export const Configuration = {

  paths: {
    logs: "./logs"                  // Directory where logfiles should be saved
  },

  http: {
    port: 5678                      // Port must be between 1024 and 65535
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

  },

  sensors: {
    pins: [4],
    luminosityGain: 1             // [1, 1.25, 1.67, 2.5, 5, 10, 20, 40]
  }

};
