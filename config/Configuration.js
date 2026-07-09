export const Configuration = {

  paths: {
    logs: "./logs",             // Directory where logfiles will be saved (in rotation)
    scans: "./scans"            // Directory where scanned images will be saved
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
      port: 10000               // Remote port to send OSC to
    },
  },

  devices: {

    // Whether to use a custom mapping for the channels assigned to each scanner. The value can be
    // 'null' or one of the mappings from the /config/ScannerMappings.js file
    mapping: null,                // Name of the mapping to use or null
    // mapping: "Atolla16PortBus1Port1Dynex7PortBus3Port1",
    // mapping: "Atolla16PortBus1Port1",
    // mapping: "Pi4",

    lampOffScan: false,           // Whether to shut off lamp while scanning
    lampOffTime: 15,              // Delay after which the lamp is turned off (0...60 min.)

  }

};
