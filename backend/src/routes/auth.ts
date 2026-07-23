/**
 * Auth Routes — Registration, Login, Google OAuth, Logout, Me
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { webcrypto } from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
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
        role: isFirstUser ? "ADMIN" : "USER",
        active: isFirstUser, // BUG 8: first user auto-active as ADMIN
        googleId: googleId || null, // "" (plain signup) must not collide on the @unique constraint
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

    if (user.mfaEnabled) {
      const challenge = webcrypto.randomUUID();
      const JWT_SECRET =
        process.env.JWT_SECRET ||
        "orkavault_local_development_jwt_secret_key_64_characters_long_12345";
      const tempToken = jwt.sign(
        { userId: user.id, purpose: "mfa_verification", challenge },
        JWT_SECRET,
        { expiresIn: "5m" }
      );
      res.json({
        mfaRequired: true,
        tempToken,
        challenge,
      });
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

      if (user.mfaEnabled) {
        const challenge = webcrypto.randomUUID();
        const JWT_SECRET =
          process.env.JWT_SECRET ||
          "orkavault_local_development_jwt_secret_key_64_characters_long_12345";
        const tempToken = jwt.sign(
          { userId: user.id, purpose: "mfa_verification", challenge },
          JWT_SECRET,
          { expiresIn: "5m" }
        );
        res.json({
          action: "login",
          mfaRequired: true,
          tempToken,
          challenge,
        });
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

// POST /api/auth/mfa/setup
router.post("/mfa/setup", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const secret = generateSecret();
    const otpauth = generateURI({ secret, label: req.user!.email, issuer: "OrkaVault" });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { mfaSecret: secret },
    });

    res.json({ secret, otpauth });
  } catch (error) {
    console.error("[MFA Setup]", error);
    res.status(500).json({ error: "Failed to initiate MFA setup." });
  }
});

// POST /api/auth/mfa/enable
router.post("/mfa/enable", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: "Verification code is required." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user || !user.mfaSecret) {
      res.status(400).json({ error: "MFA setup has not been initiated." });
      return;
    }

    const verified = verifySync({
      token: code,
      secret: user.mfaSecret,
    }).valid;

    if (!verified) {
      res.status(400).json({ error: "Invalid verification code." });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true },
    });

    res.json({ message: "MFA enabled successfully." });
  } catch (error) {
    console.error("[MFA Enable]", error);
    res.status(500).json({ error: "Failed to enable MFA." });
  }
});

// POST /api/auth/mfa/disable
router.post("/mfa/disable", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: "Verification code is required." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user || !user.mfaSecret || !user.mfaEnabled) {
      res.status(400).json({ error: "MFA is not enabled." });
      return;
    }

    const verified = verifySync({
      token: code,
      secret: user.mfaSecret,
    }).valid;

    if (!verified) {
      res.status(400).json({ error: "Invalid verification code." });
      return;
    }

    await prisma.$transaction([
      prisma.mfaDevice.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false, mfaSecret: null },
      }),
    ]);

    res.json({ message: "MFA disabled successfully." });
  } catch (error) {
    console.error("[MFA Disable]", error);
    res.status(500).json({ error: "Failed to disable MFA." });
  }
});

// POST /api/auth/mfa/verify
router.post("/mfa/verify", async (req: Request, res: Response) => {
  const { tempToken, totpCode, signature, mfaDeviceId, deviceName, publicKey } = req.body;

  if (!tempToken) {
    res.status(400).json({ error: "Temporary MFA token is required." });
    return;
  }

  try {
    const JWT_SECRET =
      process.env.JWT_SECRET ||
      "orkavault_local_development_jwt_secret_key_64_characters_long_12345";
    
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch (err) {
      res.status(401).json({ error: "Invalid or expired temporary MFA token." });
      return;
    }

    if (!decoded || decoded.purpose !== "mfa_verification") {
      res.status(401).json({ error: "Invalid token purpose." });
      return;
    }

    const { userId, challenge } = decoded;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { mfaDevices: true },
    });

    if (!user || !user.active) {
      res.status(401).json({ error: "User not found or deactivated." });
      return;
    }

    if (signature) {
      if (!mfaDeviceId) {
        res.status(400).json({ error: "Device ID is required for signature verification." });
        return;
      }

      const device = user.mfaDevices.find((d) => d.id === mfaDeviceId);
      if (!device) {
        res.status(401).json({ error: "Device not registered." });
        return;
      }

      let isValid = false;
      try {
        const jwk = JSON.parse(device.publicKey);
        const importedKey = await webcrypto.subtle.importKey(
          "jwk",
          jwk,
          { name: "ECDSA", namedCurve: "P-256" },
          true,
          ["verify"]
        );

        const signatureBuffer = Buffer.from(signature, "hex");
        const challengeBuffer = Buffer.from(challenge);

        isValid = await webcrypto.subtle.verify(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          importedKey,
          signatureBuffer,
          challengeBuffer
        );
      } catch (cryptoError) {
        console.error("[MFA Verify] Cryptographic error:", cryptoError);
      }

      if (!isValid) {
        res.status(401).json({ error: "Device cryptographic verification failed." });
        return;
      }

      await prisma.mfaDevice.update({
        where: { id: mfaDeviceId },
        data: { lastUsedAt: new Date() },
      });

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
      return;
    } else if (totpCode) {
      if (!user.mfaSecret) {
        res.status(400).json({ error: "MFA not configured." });
        return;
      }

      const verified = verifySync({
        token: totpCode,
        secret: user.mfaSecret,
      }).valid;

      if (!verified) {
        res.status(401).json({ error: "Invalid verification code." });
        return;
      }

      let responseDeviceId: string | undefined = undefined;

      if (deviceName && publicKey) {
        const newDevice = await prisma.mfaDevice.create({
          data: {
            userId: user.id,
            name: deviceName,
            publicKey: JSON.stringify(publicKey),
          },
        });
        responseDeviceId = newDevice.id;
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
        mfaDeviceId: responseDeviceId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
      return;
    } else {
      res.status(400).json({ error: "Either verification code or device signature is required." });
      return;
    }
  } catch (error) {
    console.error("[MFA Verify Route]", error);
    res.status(500).json({ error: "MFA verification failed." });
  }
});

// GET /api/auth/mfa/devices
router.get("/mfa/devices", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const devices = await prisma.mfaDevice.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(devices);
  } catch (error) {
    console.error("[MFA Devices List]", error);
    res.status(500).json({ error: "Failed to list MFA devices." });
  }
});

// DELETE /api/auth/mfa/devices/:id
router.delete("/mfa/devices/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const device = await prisma.mfaDevice.findUnique({
      where: { id },
    });

    if (!device || device.userId !== req.user!.id) {
      res.status(404).json({ error: "Device not found." });
      return;
    }

    const deviceCount = await prisma.mfaDevice.count({
      where: { userId: req.user!.id }
    });

    if (deviceCount <= 1) {
      res.status(400).json({ error: "You need to set up a new MFA device before deleting the last one left." });
      return;
    }

    await prisma.mfaDevice.delete({
      where: { id },
    });

    res.json({ message: "Device successfully revoked." });
  } catch (error) {
    console.error("[MFA Device Delete]", error);
    res.status(500).json({ error: "Failed to revoke device." });
  }
});

export default router;
