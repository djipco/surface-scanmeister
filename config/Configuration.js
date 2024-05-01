export const Configuration = {

  paths: {
    logs: "./logs"              // Directory where logfiles should be saved
  },

  network: {
    api_server: {
      address: "0.0.0.0",       // IP address the API server will listen on
      port: 5678,               // Port the API server will listen on (between 1024 and 65535)
    },
    files_server: {
      address: "0.0.0.0",       // IP address the server will listen on
      port: 8080,               // Port the server will listen on (between 1024 and 65535)
    },
    osc_server: {
      address: '0.0.0.0',       // Local IP address to bind to for OSC
      port: 8000,               // Local port to listen on for OSC
    },
    osc_client: {
      address: '10.0.0.200',    // Remote IP address to send OSC to
      port: 10000               // Remote port to send OSC on
    },
  },

  devices: {

    // Whether to use a custom mapping for the channels assigned to each scanner. The value can be
    // null or one of the mappings from the /config/ScannerMappings.js file
    // mapping: "Atolla16PortBus1Port1Dynex7PortBus3Port1",
    // mapping: "Atolla16PortBus1Port1",
    // mapping: "Pi4",
    mapping: null,                // Name of the mapping to use or null

    brightness: 25,               // Scanning brightness (-100...100)
    contrast: 25,                 // Scanning contrast (-100...100)
    lampOffScan: false,           // Whether to shut off lamp while scanning
    lampOffTime: 15,              // Delay after which the lamp is turned off (0...60 min.)
    // x: 0,                         // Horizontal position to start the scan at (0...216.7mm)
    // y: 0,                         // Vertical position to start the scan at (0...297.5mm)
    // width: 216.07,                // Width of scan area (0...216.7mm)
    // height: 297.5,                // Height of scan area (0...297.5mm)

  },

  sensors: {
    pins: [4],
    luminosityGain: 1             // [1, 1.25, 1.67, 2.5, 5, 10, 20, 40]
  }

};
