/**
 * Password Health Scoring Service
 *
 * Computes a score out of 100 for a given password.
 * This function runs server-side only — never exposed to the frontend.
 */

export type HealthLabelType = "WEAK" | "MEDIUM" | "STRONG";

export interface HealthResult {
  score: number;
  label: HealthLabelType;
}

/**
 * Score a password on a 0-100 scale.
 *
 * Criteria:
 *   length >= 8   → +10
 *   length >= 12  → +10
 *   length >= 16  → +10
 *   has uppercase  → +15
 *   has lowercase  → +15
 *   has number     → +15
 *   has special    → +20
 *   length >= 20  → +5 (bonus)
 *   max = 100
 *
 * Labels:
 *   0–39   → WEAK   (triggers alert to admins + owner)
 *   40–69  → MEDIUM
 *   70–100 → STRONG
 */
export function scorePassword(password: string): HealthResult {
  let score = 0;

  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;

  if (/[A-Z]/.test(password)) score += 15;
  if (/[a-z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 20;

  if (password.length >= 20) score += 5;

  score = Math.min(score, 100);

  let label: HealthLabelType;
  if (score <= 39) {
    label = "WEAK";
  } else if (score <= 69) {
    label = "MEDIUM";
  } else {
    label = "STRONG";
  }

  return { score, label };
}
