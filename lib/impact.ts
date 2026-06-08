// Environmental-impact model for the investor dashboard.
//
// A running scooter is assumed to cover a fixed distance every day it is on the
// road (from the day it was allotted to a rider). From that distance we derive
// the CO2 emissions avoided versus an equivalent petrol two-wheeler, and express
// that saving as an equivalent number of trees.
//
// All factors below are constants so they can be tuned in one place.

/** Distance a scooter is assumed to cover per running day (km). */
export const KM_PER_DAY = 90;

/**
 * CO2 avoided per km vs a petrol two-wheeler (kg/km).
 * Derivation: petrol emits ~2.31 kg CO2 per litre; a typical petrol scooter does
 * ~45 km/litre → 2.31 / 45 ≈ 0.0513 kg CO2 per km avoided by riding electric.
 */
export const CO2_PER_KM_KG = 0.0513;

/**
 * CO2 sequestered by one mature tree in a year (kg/tree/year).
 * Commonly cited figure (~48 lb/year ≈ 21.77 kg/year).
 */
export const CO2_PER_TREE_KG = 21.77;

export type Impact = {
  km: number;
  co2SavedKg: number;
  treesSaved: number;
};

/** Compute impact figures from the total number of running days across scooters. */
export function computeImpact(totalRunningDays: number): Impact {
  const days = Math.max(0, totalRunningDays);
  const km = days * KM_PER_DAY;
  const co2SavedKg = km * CO2_PER_KM_KG;
  const treesSaved = co2SavedKg / CO2_PER_TREE_KG;
  return { km, co2SavedKg, treesSaved };
}
