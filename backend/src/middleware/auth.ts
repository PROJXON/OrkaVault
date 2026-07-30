/**
 * Authentication & Authorization Middleware
 *
 * RULE 4: Role middleware on every API route.
 * BUG 3 Defense: Every authenticated route re-fetches user.active from DB.
 * RULE 7: JWT tokens expire in 8 hours. Refresh tokens expire in 7 days.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma, Role } from "../lib/prismaClient";


// No insecure hardcoded fallback: a deployment that forgets to set either
// of these would otherwise sign/verify tokens with a secret that's public
// in this source tree, letting anyone forge a valid access or refresh
// token for any userId. Fail loudly at startup instead.
const rawJwtSecret = process.env.JWT_SECRET;
const rawJwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

if (!rawJwtSecret || !rawJwtRefreshSecret) {
  throw new Error(
    "JWT_SECRET and JWT_REFRESH_SECRET must both be set in the environment. " +
      "Copy backend/.env.example to .env and fill in strong random values for both " +
      "— refusing to start with an insecure default secret.",
  );
}

export const JWT_SECRET: string = rawJwtSecret;
const JWT_REFRESH_SECRET: string = rawJwtRefreshSecret;

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: Role;
    active: boolean;
    notificationsOn: boolean;
    googleId: string | null;
    startDate: Date;
    endDate: Date | null;
    avatarUrl: string | null;
    favorites: string[];
    managedCollections: any[];
    clearanceLevel: string | null;
    mfaEnabled: boolean;
  };
}

/**
 * Generate an access token (8-hour expiry).
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

/**
 * Generate a refresh token (7-day expiry).
 */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

/**
 * Verify an access token.
 */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Verify a refresh token.
 */
export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
}

/**
 * Authentication middleware.
 * Extracts JWT from Authorization header, validates it,
 * then re-fetches the user from the database to ensure they are still active.
 *
 * BUG 3 DEFENSE: Never trust the JWT's active claim — always re-check DB.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res
        .status(401)
        .json({ error: "Authentication required. Provide a Bearer token." });
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: JwtPayload;

    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      res.status(401).json({ error: "Invalid or expired token." });
      return;
    }

    // Reject MFA-challenge tokens here. /api/auth/login and /api/auth/google
    // sign a short-lived tempToken (userId + purpose: "mfa_verification")
    // with this same JWT_SECRET so /api/auth/mfa/verify can validate it —
    // but a real access token (see JwtPayload) never carries a `purpose`
    // claim. Without this check, a tempToken passes verifyAccessToken like
    // any other valid token and would grant full API access before the
    // second factor is ever provided.
    if ((decoded as JwtPayload & { purpose?: string }).purpose) {
      res.status(401).json({ error: "Invalid or expired token." });
      return;
    }

    // BUG 3: Re-fetch user from DB to check active status
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { managedCollections: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found." });
      return;
    }

    if (!user.active) {
      res.status(403).json({
        error:
          "Your account is pending admin approval or has been deactivated.",
      });
      return;
    }

    // Attach fresh user data to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      notificationsOn: user.notificationsOn,
      googleId: user.googleId,
      startDate: user.startDate,
      endDate: user.endDate,
      avatarUrl: user.avatarUrl,
      favorites: user.favorites,
      managedCollections: user.managedCollections,
      clearanceLevel: user.clearanceLevel,
      mfaEnabled: user.mfaEnabled,
    };

    // If user does not have MFA enabled, restrict them to MFA setup and basic profile endpoints
    const allowedUrls = [
      "/api/auth/me",
      "/api/auth/mfa/setup",
      "/api/auth/mfa/enable",
      "/api/auth/logout",
      "/api/profile/me",
      "/api/departments"
    ];

    const cleanUrl = req.originalUrl.split("?")[0];
    if (!user.mfaEnabled && !allowedUrls.includes(cleanUrl)) {
      res.status(403).json({
        error: "Two-Factor Authentication (MFA) setup is required before you can access this resource.",
        mfaSetupRequired: true,
      });
      return;
    }

    next();
  } catch (error) {
    console.error("[Auth] Middleware error:", error);
    res.status(500).json({ error: "Authentication service error." });
  }
}

/**
 * Role authorization middleware factory.
 * Usage: requireRole('ADMIN'), requireRole('MANAGER', 'ADMIN')
 *
 * RULE 4: Never trust the frontend to enforce permissions.
 */
export function requireRole(...roles: Role[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res
        .status(403)
        .json({ error: `Forbidden. Required role: ${roles.join(" or ")}.` });
      return;
    }

    next();
  };
}

/**
 * Collection-scoping check for Manager-reachable routes that act on an
 * Account (reveal, approve/deny, health re-check, etc).
 *
 * ADMIN is unrestricted. MANAGER is limited to accounts whose
 * `collectionId` is one of their assigned `managedCollections` — an
 * account with no collection assigned is out of scope for every manager
 * (only ADMIN can act on unassigned accounts). Any other role is denied;
 * callers are expected to have already handled USER-role logic (e.g.
 * AccessGrant checks) separately.
 */
export function isAccountInManagerScope(
  user: AuthenticatedRequest["user"],
  accountCollectionId: string | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role !== "MANAGER") return false;
  if (!accountCollectionId) return false;
  return user.managedCollections.some((c: any) => c.id === accountCollectionId);
}
