import type {
  BlockDetail,
  IndexFeatureCollection,
  StationFeatureCollection,
  Town,
} from "../types/contract";

export const sampleTowns: Town[] = [
  { town: "ANG MO KIO", town_slug: "ang-mo-kio", town_code: "AMK" },
  { town: "BEDOK", town_slug: "bedok", town_code: "BD" },
];

export const sampleIndex: IndexFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.845, 1.362] },
      properties: {
        id: "123-ang-mo-kio-ave-3",
        blk_no: "123",
        street: "ANG MO KIO AVE 3",
        street_full: "ANG MO KIO AVENUE 3",
        postal: "560123",
        town: "ANG MO KIO",
        year_completed: 1978,
        max_floor_lvl: 12,
        sold_types: ["3room", "4room"],
        rental_types: ["1room"],
        station_distance: 350,
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.93, 1.326] },
      properties: {
        id: "1-bedok-nth-st-1",
        blk_no: "1",
        street: "BEDOK NTH ST 1",
        street_full: "BEDOK NORTH STREET 1",
        postal: "460001",
        town: "BEDOK",
        year_completed: 2015,
        max_floor_lvl: 30,
        sold_types: ["4room", "5room"],
        rental_types: [],
        station_distance: 820,
      },
    },
  ],
};

export const sampleShard: Record<string, BlockDetail> = {
  "123-ang-mo-kio-ave-3": {
    blk_no: "123",
    street: "ANG MO KIO AVE 3",
    street_full: "ANG MO KIO AVENUE 3",
    postal: "560123",
    town: "ANG MO KIO",
    year_completed: 1978,
    max_floor_lvl: 12,
    total_dwelling_units: 200,
    sold_units_by_type: { "3room": 40, "4room": 60 },
    rental_units_by_type: { "1room": 20 },
    nearest_station: {
      id: "ang-mo-kio",
      name: "Ang Mo Kio",
      codes: ["NS16"],
      exit: "Exit A",
      distance: 350,
    },
  },
};

// Ang Mo Kio's "Exit A" has two points (two entrances), as some real exits do.
export const sampleStations: StationFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.8497, 1.3696] },
      properties: { kind: "station", id: "ang-mo-kio", name: "Ang Mo Kio", codes: ["NS16"] },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.9299, 1.324] },
      properties: { kind: "station", id: "bedok", name: "Bedok", codes: ["EW5"] },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.8488, 1.3693] },
      properties: { kind: "exit", station: "ang-mo-kio", exit: "Exit A" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.8506, 1.3702] },
      properties: { kind: "exit", station: "ang-mo-kio", exit: "Exit A" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.8497, 1.3693] },
      properties: { kind: "exit", station: "ang-mo-kio", exit: "Exit B" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.9296, 1.3238] },
      properties: { kind: "exit", station: "bedok", exit: "Exit A" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.9302, 1.3242] },
      properties: { kind: "exit", station: "bedok", exit: "Exit B" },
    },
  ],
};
