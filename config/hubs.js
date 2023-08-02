/**
 * Array describing how the physical ports on the device map to the software-reported ports
 */
const hubs = [
  {
    identifier: "045b:0209", // vendor:productId for Atolla hub
    ports: [
      {physical: 1,  portId: "3-3"},
      {physical: 2,  portId: "3-2"},
      {physical: 3,  portId: "3-1"},
      {physical: 4,  portId: "3-0"},
      {physical: 5,  portId: "2-3"},
      {physical: 6,  portId: "2-2"},
      {physical: 7,  portId: "2-1"},
      {physical: 8,  portId: "2-0"},
      {physical: 9,  portId: "1-3"},
      {physical: 10, portId: "1-2"},
      {physical: 11, portId: "1-1"},
      {physical: 12, portId: "1-0"},
      {physical: 13, portId: "0-3"},
      {physical: 14, portId: "0-2"},
      {physical: 15, portId: "0-1"},
      {physical: 16, portId: "0-0"},
    ]
  }
]

export {hubs};
