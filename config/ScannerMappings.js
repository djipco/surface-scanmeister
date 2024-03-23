/**
 * By default, scanners are ordered by bus nubmer followed by port hierarchy. They are then assigned
 * a channel starting at 1 and incrementing. If, for whatever reason a scanner is not present, all
 * following scanners will move down to fill the hole. This might not be wanted, hence this file.
 *
 * If a mapping is specified in the config, it will override the automatic channel assignments. A
 * mapping is named using the bus number followed by the port hierarchy, separated by hyphens:
 *
 *    "3-2-4-4": 1 means assign channel 1 to device on bus 3 and port hierarchy 2-4-4
 */

export const ScannerMappings = {

  Pi4: {
    "1-1-1": 1,
    "1-1-2": 2,
    "1-1-3": 3,
    "1-1-4": 4
  },

  Pi5: {
    "1-1": 1,
    "1-2": 2,
    "3-1": 3,
    "3-2": 4
  },

  Atolla16PortBus1Port1: {
    "1-1-4-4": 1,
    "1-1-4-3": 2,
    "1-1-4-2": 3,
    "1-1-4-1": 4,
    "1-1-3-4": 5,
    "1-1-3-3": 6,
    "1-1-3-2": 7,
    "1-1-3-1": 8,
    "1-1-2-4": 9,
    "1-1-2-3": 10,
    "1-1-2-2": 11,
    "1-1-2-1": 12,
    "1-1-1-4": 13,
    "1-1-1-3": 14,
    "1-1-1-2": 15,
    "1-1-1-1": 16
  },

  Atolla16PortBus1Port1Dynex7PortBus3Port1: {
    "1-1-4-4": 1,
    "1-1-4-3": 2,
    "1-1-4-2": 3,
    "1-1-4-1": 4,
    "1-1-3-4": 5,
    "1-1-3-3": 6,
    "1-1-3-2": 7,
    "1-1-3-1": 8,
    "1-1-2-4": 9,
    "1-1-2-3": 10,
    "1-1-2-2": 11,
    "1-1-2-1": 12,
    "1-1-1-4": 13,
    "1-1-1-3": 14,
    "1-1-1-2": 15,
    "1-1-1-1": 16,
    "3-1-1": 17,
    "3-1-2": 18,
    "3-1-3": 19,
  }

};
