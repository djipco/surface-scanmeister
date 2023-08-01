/**
 * Array describing how the physical ports on the device map to the software-reported ports
 */
const hubs = [
  {
    model: "Atolla",
    ports: [
      {physical: 1, parent: 11, number: 3},
      {physical: 2, parent: 11, number: 2},
      {physical: 3, parent: 11, number: 1},
      {physical: 4, parent: 11, number: 0},
      {physical: 5, parent: 10, number: 3},
      {physical: 6, parent: 10, number: 2},
      {physical: 7, parent: 10, number: 1},
      {physical: 8, parent: 10, number: 0},
      {physical: 9, parent: 9, number: 3},
      {physical: 10, parent: 9, number: 2},
      {physical: 11, parent: 9, number: 1},
      {physical: 12, parent: 9, number: 0},
      {physical: 13, parent: 8, number: 3},
      {physical: 14, parent: 8, number: 2},
      {physical: 15, parent: 8, number: 1},
      {physical: 16, parent: 8, number: 0},
    ]
  }
]

export {hubs};
