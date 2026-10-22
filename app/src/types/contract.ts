export type FlatTypeCounts = Record<string, number>;

export interface BlockIndexProperties {
  id: string;
  blk_no: string;
  street: string; // abbreviated (tooltip)
  street_full: string; // abbreviations expanded (search)
  postal: string;
  town: string;
  year_completed: number; // coloring and filtering; mirrors the detail shard
  max_floor_lvl: number; // coloring and filtering; mirrors the detail shard
  // Filtering: the keys of the shard's unit counts, in display order (lib/flat-types.ts).
  sold_types: string[];
  rental_types: string[]; // empty, not absent, when the shard has no rental counts
  station_distance: number; // whole metres; coloring; mirrors the shard's nearest_station
}

export interface BlockFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lon, lat]
  properties: BlockIndexProperties;
}

export interface IndexFeatureCollection {
  type: "FeatureCollection";
  features: BlockFeature[];
}

export interface BlockDetail {
  blk_no: string;
  street: string;
  street_full: string;
  postal: string;
  town: string;
  year_completed: number;
  max_floor_lvl: number;
  total_dwelling_units: number;
  sold_units_by_type: FlatTypeCounts;
  rental_units_by_type?: FlatTypeCounts;
  nearest_station: NearestStation;
}

export interface NearestStation {
  id: string;
  name: string;
  codes: string[]; // open-line codes, e.g. ["NS24", "NE6", "CC1"]
  exit: string; // the nearest exit's name; pairs with id to find it in stations.geojson
  distance: number; // whole metres, straight line to that exit
}

export interface StationProperties {
  kind: "station";
  id: string;
  name: string;
  codes: string[];
}

export interface ExitProperties {
  kind: "exit";
  station: string; // the station's id
  exit: string; // not unique within a station: an exit can have several entrances
}

export interface StationFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lon, lat]
  properties: StationProperties | ExitProperties;
}

export interface StationFeatureCollection {
  type: "FeatureCollection";
  features: StationFeature[];
}

export interface DataMeta {
  data_accessed: string; // YYYY-MM-DD, Singapore time, of the last successful pipeline run
}

export interface Town {
  town: string;
  town_slug: string;
  town_code: string;
}
