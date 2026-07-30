/**
 * Inbound chat-platform integrations — lets a Manager/Admin approve or
 * deny an AccessRequest directly from the Approve/Deny buttons on a
 * Discord or Google Chat alert (see services/webhookAlerts.ts for the
 * outbound side, docs/discord-google-chat-alerts-bot.md for the design).
 *
 * Both routes are unauthenticated in the Express/JWT sense (there's no
 * OrkaVault session on an inbound chat-platform request) — instead each
 * platform's own signed-request mechanism is the authentication boundary:
 *   Discord: Ed25519 signature over the raw body (verifyDiscordSignature)
 *   Google Chat: a Google-issued bearer ID token naming the invoking user
 * Neither is optional; a request that fails verification is rejected
 * before any business logic runs.
 */
import { Router, Request, Response } from "express";
import { prisma, Role } from "../lib/prismaClient";
import { OAuth2Client } from "google-auth-library";
import { verifyDiscordSignature } from "../services/discordSignature";
import { createLinkCode, consumeLinkCode } from "../services/discordLink";
import { approveAccessRequest, denyAccessRequest, RequestActionError, RequestActor } from "../services/accessRequests";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const gchatAuthClient = new OAuth2Client();

// ─── Discord ────────────────────────────────────────────────────────────

const DISCORD_PING = 1;
const DISCORD_APPLICATION_COMMAND = 2;
const DISCORD_MESSAGE_COMPONENT = 3;
const DISCORD_PONG = 1;
const DISCORD_CHANNEL_MESSAGE_WITH_SOURCE = 4;
const DISCORD_UPDATE_MESSAGE = 7;
const EPHEMERAL = 1 << 6;

async function resolveActorByDiscordId(discordUserId: string): Promise<RequestActor | { error: string } | null> {
  const user = await prisma.user.findUnique({
    where: { discordUserId },
    include: { managedCollections: true },
  });
  if (!user) return null;
  if (user.role !== "MANAGER" && user.role !== "ADMIN") {
    return { error: "Your linked OrkaVault account doesn't have permission to approve or deny requests." };
  }
  return { id: user.id, role: user.role, managedCollections: user.managedCollections };
}

router.post("/discord/interactions", async (req: Request, res: Response) => {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const signature = req.header("X-Signature-Ed25519");
  const timestamp = req.header("X-Signature-Timestamp");
  const rawBody = req.body as Buffer; // mounted with express.raw() ahead of express.json() in index.ts

  if (!publicKey || !signature || !timestamp || !Buffer.isBuffer(rawBody)) {
    res.status(401).json({ error: "Invalid request." });
    return;
  }
  if (!verifyDiscordSignature(publicKey, signature, timestamp, rawBody)) {
    res.status(401).json({ error: "Invalid request signature." });
    return;
  }

  let interaction: any;
  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Malformed body." });
    return;
  }

  if (interaction.type === DISCORD_PING) {
    res.json({ type: DISCORD_PONG });
    return;
  }

  const discordUserId: string | undefined = interaction.member?.user?.id || interaction.user?.id;

  // ── /orkavault link <code> ──
  if (interaction.type === DISCORD_APPLICATION_COMMAND) {
    const sub = interaction.data?.options?.[0];
    if (interaction.data?.name === "orkavault" && sub?.name === "link" && discordUserId) {
      const code = sub.options?.find((o: any) => o.name === "code")?.value;
      const userId = code ? consumeLinkCode(code) : null;
      if (!userId) {
        res.json({
          type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "That code is invalid or expired. Generate a new one from Profile > Link Discord.", flags: EPHEMERAL },
        });
        return;
      }
      try {
        await prisma.user.update({ where: { id: userId }, data: { discordUserId } });
        res.json({
          type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "✅ Discord account linked to your OrkaVault account.", flags: EPHEMERAL },
        });
      } catch {
        res.json({
          type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "This Discord account is already linked to another OrkaVault user.", flags: EPHEMERAL },
        });
      }
      return;
    }
    res.json({ type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE, data: { content: "Unknown command.", flags: EPHEMERAL } });
    return;
  }

  // ── Approve/Deny buttons ──
  if (interaction.type === DISCORD_MESSAGE_COMPONENT) {
    const customId: string = interaction.data?.custom_id || "";
    const [action, requestId] = customId.split(":");
    if ((action !== "approve" && action !== "deny") || !requestId || !discordUserId) {
      res.json({ type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE, data: { content: "Unrecognized action.", flags: EPHEMERAL } });
      return;
    }

    const actor = await resolveActorByDiscordId(discordUserId);
    if (!actor) {
      res.json({
        type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "You haven't linked an OrkaVault account. Run `/orkavault link <code>` (get a code from Profile > Link Discord).", flags: EPHEMERAL },
      });
      return;
    }
    if ("error" in actor) {
      res.json({ type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE, data: { content: actor.error, flags: EPHEMERAL } });
      return;
    }

    try {
      const result =
        action === "approve"
          ? await approveAccessRequest(actor, requestId, req.ip, "discord")
          : await denyAccessRequest(actor, requestId, "Denied via Discord", req.ip, "discord");
      const verb = action === "approve" ? "Approved" : "Denied";
      res.json({
        type: DISCORD_UPDATE_MESSAGE,
        data: {
          embeds: interaction.message?.embeds || [],
          content: `${verb} — ${result.accountName} / ${result.requesterName} (by <@${discordUserId}>)`,
          components: [],
        },
      });
    } catch (error: any) {
      const message = error instanceof RequestActionError ? error.message : "Failed to process this action.";
      res.json({ type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `⚠️ ${message}`, flags: EPHEMERAL } });
    }
    return;
  }

  res.status(400).json({ error: "Unhandled interaction type." });
});



// ─── Profile-initiated linking ─────────────────────────────────────────

// POST /api/integrations/discord/link-code — generate a one-time code the
// user then submits in Discord via /orkavault link <code> [ALL]
router.post("/discord/link-code", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const code = createLinkCode(req.user!.id);
  res.json({ code, expiresInSeconds: 600 });
});

export default router;
