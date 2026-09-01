import type { FlatTypeCounts } from "../types/contract";

export interface FlatTypeDef {
  key: string;
  label: string;
}

export const SOLD_FLAT_TYPES: FlatTypeDef[] = [
  { key: "1room", label: "1-Room" },
  { key: "2room", label: "2-Room" },
  { key: "3room", label: "3-Room" },
  { key: "4room", label: "4-Room" },
  { key: "5room", label: "5-Room" },
  { key: "exec", label: "Executive" },
  { key: "multigen", label: "Multi-Generation" },
  { key: "studio_apartment", label: "Studio Apartment" },
];

export const RENTAL_FLAT_TYPES: FlatTypeDef[] = [
  { key: "1room", label: "1-Room" },
  { key: "2room", label: "2-Room" },
  { key: "3room", label: "3-Room" },
  { key: "other_room", label: "Other" },
];

export function orderedUnits(
  counts: FlatTypeCounts | undefined,
  order: FlatTypeDef[],
): { label: string; count: number }[] {
  if (!counts) return [];
  return order
    .filter((t) => (counts[t.key] ?? 0) > 0)
    .map((t) => ({ label: t.label, count: counts[t.key] }));
}
