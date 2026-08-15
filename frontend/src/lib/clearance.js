// Tiers must match backend/src/services/clearance.ts exactly — no shared
// package between the two apps, so keep both lists in sync.
export const CLEARANCE_TIERS = [
  "Tier 1 - Standard",
  "Tier 2 - Elevated",
  "Tier 3 - Executive",
];

function tierRank(level) {
  if (!level) return 0;
  const idx = CLEARANCE_TIERS.indexOf(level);
  return idx === -1 ? 0 : idx + 1;
}

// Unset requiredLevel means no restriction. Unset userLevel ranks below
// every real tier, so an account with a requirement blocks anyone who
// hasn't been assigned a clearance yet.
export function meetsClearance(userLevel, requiredLevel) {
  if (!requiredLevel) return true;
  return tierRank(userLevel) >= tierRank(requiredLevel);
}
