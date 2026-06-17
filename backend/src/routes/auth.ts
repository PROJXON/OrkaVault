/**
 * Auth Routes — Registration, Login, Google OAuth, Logout, Me
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  requireAuth,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  AuthenticatedRequest,
  JwtPayload,
} from "../middleware/auth";
import { notifyAdmins, notifyUser } from "../services/notifications";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const prisma = new PrismaClient();
const router = Router();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const { name, email, password, department, startDate, googleId, avatarUrl } = req.body;
  if (!name || !email || !password || !department || !startDate) {
    res
      .status(400)
      .json({
        error:
          "Name, email, password, department, and start date are required.",
      });
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "A user with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const isFirstUser = (await prisma.user.count()) === 0;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        department,
        startDate: new Date(startDate),
        role: isFirstUser ? "ADMIN" : "HOLDER",
        active: isFirstUser, // BUG 8: first user auto-active as ADMIN
        googleId,
        avatarUrl,
      },
    });

    if (!isFirstUser) {
      // Notify all admins about new registration
      notifyAdmins(
        "New User Registration",
        `${name} (${email}) has registered and is pending approval.`,
        "REGISTRATION_APPROVED",
      );
    }

    res.status(201).json({
      message: isFirstUser
        ? "Admin account created. You can log in immediately."
        : "Registration successful. Your account is pending admin approval.",
      userId: user.id,
      active: user.active,
    });
  } catch (error) {
    console.error("[Register]", error);
    res.status(500).json({ error: "Registration failed." });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    if (!user.active) {
      res
        .status(403)
        .json({ error: "Your account is pending admin approval." });
      return;
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[Login]", error);
    res.status(500).json({ error: "Login failed." });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "Refresh token required." });
    return;
  }
  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    if (!user || !user.active) {
      res.status(401).json({ error: "User not found or inactive." });
      return;
    }
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = generateAccessToken(payload);
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: "Invalid refresh token." });
  }
});

// POST /api/auth/google
router.post("/google", async (req: Request, res: Response) => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400).json({ error: "Google credential required." });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: "Invalid Google token payload." });
      return;
    }

    const { email, name, picture, sub: googleId } = payload;

    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // If user exists but doesn't have a googleId or avatarUrl, update them
      if (!user.googleId || (!user.avatarUrl && picture)) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            ...(picture && !user.avatarUrl && { avatarUrl: picture }),
          },
        });
      }

      if (!user.active) {
        res.status(403).json({ error: "Your account is pending admin approval." });
        return;
      }

      // Log them in
      const jwtPayload: JwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
      const accessToken = generateAccessToken(jwtPayload);
      const refreshToken = generateRefreshToken(jwtPayload);

      res.json({
        action: "login",
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
      return;
    } else {
      // User does not exist, return data to auto-fill registration
      res.json({
        action: "register",
        data: {
          name,
          email,
          avatarUrl: picture,
          googleId,
        },
      });
      return;
    }
  } catch (error) {
    console.error("[Google Auth]", error);
    res.status(500).json({ error: "Google authentication failed." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(req.user);
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  // Client-side: discard tokens. Server-side: stateless JWT, no action needed.
  res.json({ message: "Logged out successfully." });
});

// GET /api/auth/setup-status
router.get("/setup-status", async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ isFirstUser: userCount === 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to check setup status." });
  }
});

export default router;
