import type { BlockDetail, IndexFeatureCollection, Town } from "../types/contract";

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
        id: "123-ang-mo-kio-ave-3", blk_no: "123", street: "ANG MO KIO AVE 3",
        street_full: "ANG MO KIO AVENUE 3", postal: "560123", town: "ANG MO KIO",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.93, 1.326] },
      properties: {
        id: "1-bedok-nth-st-1", blk_no: "1", street: "BEDOK NTH ST 1",
        street_full: "BEDOK NORTH STREET 1", postal: "460001", town: "BEDOK",
      },
    },
  ],
};

export const sampleShard: Record<string, BlockDetail> = {
  "123-ang-mo-kio-ave-3": {
    blk_no: "123", street: "ANG MO KIO AVE 3", street_full: "ANG MO KIO AVENUE 3",
    postal: "560123", town: "ANG MO KIO", year_completed: 1978, max_floor_lvl: 12,
    total_dwelling_units: 200, sold_units_by_type: { "3room": 40, "4room": 60 },
    rental_units_by_type: { "1room": 20 },
  },
};
