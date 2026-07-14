export const Configuration = {

  paths: {
    logs: "./logs",             // Directory where logfiles will be saved (in rotation)
    scans: "./scans",           // Directory where scanned images will be saved
    authUsers: "/etc/scanmeister/users",
    httpsKey: "/etc/scanmeister/certs/server.key",
    httpsCert: "/etc/scanmeister/certs/server.crt"
  },

  network: {
    https_server: {
      address: "0.0.0.0",       // IP address the HTTPS server will listen on
      port: 443,                // Port the HTTPS server will listen on
    },
    http_server: {
      address: "0.0.0.0",       // IP address the HTTP redirect server will listen on
      port: 80,                 // Port the HTTP redirect server will listen on
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

  scan: {
    command: "scanimage",
    // Above 600dpi, the web client's page can become very memory hungry. For reference, at 1200dpi
    // a large scan can yield a PNM file hundreds of MB in size.
    resolutions: [75, 100, 150, 300, 600, 1200, 2400, 4800],
    maxWidth: 5000,
    maxHeight: 216,
    brightness: {
      min: -100,
      max: 100
    },
    contrast: {
      min: -100,
      max: 100
    },
    format: "pnm",
    mode: "Color",
    depth: 8,
    lampOffScan: false,           // Whether to shut off lamp while scanning
    lampOffTime: 15,              // Delay after which the lamp is turned off (0...60 min.)
    expirationTime: -1,
    recoveryDelay: 4000,
    fallbackBufferSize: 16,
    bufferBaseResolution: 75,
    bufferBaseSize: 8
  },

  diagnostics: {
    scanImageVersionTimeout: 5000,
    systemStatusInterval: 1000
  },

  process: {
    killTimeout: 10000
  },

  auth: {
    hashBytes: 64,
    minimumPasswordLength: 8,
    saltBytes: 16
  },

  logging: {
    level: "debug",
    fileLevel: "debug",
    datePattern: "YYYY-MM-DD",
    timestampFormat: "YYYY-MM-DD HH:mm:ss.SSS",
    maxSize: "20m",
    maxFiles: "60d",
    zippedArchive: true
  },

  devices: {

    // Whether to use a custom mapping for the channels assigned to each scanner. The value can be
    // 'null' or one of the mappings from the /config/ScannerMappings.js file
    mapping: null,                // Name of the mapping to use or null
    // mapping: "Atolla16PortBus1Port1Dynex7PortBus3Port1",
    // mapping: "Atolla16PortBus1Port1",
    // mapping: "Pi4",

  }

};
