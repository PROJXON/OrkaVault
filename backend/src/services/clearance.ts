// Tiers must match the dropdown options in frontend/src/pages/Users.jsx
// (User.clearanceLevel) and Add/EditEntryModal.jsx (Account.requiredClearance)
// exactly — no shared package between the two apps, so keep both lists in sync.
export const CLEARANCE_TIERS = [
  "Tier 1 - Standard",
  "Tier 2 - Elevated",
  "Tier 3 - Executive",
];

function tierRank(level: string | null | undefined): number {
  if (!level) return 0;
  const idx = CLEARANCE_TIERS.indexOf(level);
  return idx === -1 ? 0 : idx + 1;
}

// Unset/unrecognized requiredClearance means no restriction. Unset
// userLevel ranks as 0 (below every real tier), so an account with a
// requirement blocks anyone who hasn't been assigned a clearance yet.
export function meetsClearance(
  userLevel: string | null | undefined,
  requiredLevel: string | null | undefined,
): boolean {
  if (!requiredLevel) return true;
  return tierRank(userLevel) >= tierRank(requiredLevel);
}
