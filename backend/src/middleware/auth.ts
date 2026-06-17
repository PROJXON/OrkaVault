/**
 * Authentication & Authorization Middleware
 *
 * RULE 4: Role middleware on every API route.
 * BUG 3 Defense: Every authenticated route re-fetches user.active from DB.
 * RULE 7: JWT tokens expire in 8 hours. Refresh tokens expire in 7 days.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "orkavault_local_development_jwt_secret_key_64_characters_long_12345";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "orkavault_local_development_jwt_refresh_secret_key_64_characters_long";

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
    };

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
