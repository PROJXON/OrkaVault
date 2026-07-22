/**
 * Webhook Alerts Service
 *
 * Sends outbound, one-way notifications about access-request activity to
 * Discord and/or Google Chat via incoming webhook URLs configured as
 * OrganizationPolicy rows (DISCORD_WEBHOOK_URL, GCHAT_WEBHOOK_URL).
 *
 * Fire-and-forget, like notifications.ts: a chat platform outage must
 * never block the request/approve/deny handler that triggered the alert.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DISCORD_POLICY_NAME = "DISCORD_WEBHOOK_URL";
const GCHAT_POLICY_NAME = "GCHAT_WEBHOOK_URL";

export type ChatAlertEvent =
  | "ACCESS_REQUESTED"
  | "ACCESS_APPROVED"
  | "ACCESS_DENIED"
  | "WORKSPACE_SUSPICIOUS_LOGIN"
  | "WORKSPACE_NEW_OAUTH_APP"
  | "WORKSPACE_LOGIN_ALLOWLIST_VIOLATION";

export interface ChatAlertPayload {
  requesterName: string;
  accountName: string;
  requestTypeLabel?: string;
  reason?: string;
  /** Extra context (IP, app name, country) shown for Workspace alerts. */
  detail?: string;
  /** Overrides the default /approvals link, e.g. "/workspace-activity". */
  link?: string;
  /**
   * AccessRequest id — when present on an ACCESS_REQUESTED alert, the
   * message gets inline Approve/Deny buttons (routes/integrations.ts
   * handles the click). Requires the platform's inbound interaction
   * endpoint to be configured (DISCORD_PUBLIC_KEY / Chat app HTTP
   * endpoint) — see docs/discord-google-chat-alerts-bot.md. If that
   * setup hasn't been done, the buttons render but clicking them fails
   * on the platform's side; the alert itself still delivers either way.
   */
  requestId?: string;
}

const EVENT_COLOR: Record<ChatAlertEvent, number> = {
  ACCESS_REQUESTED: 0x3b82f6, // blue
  ACCESS_APPROVED: 0x22c55e, // green
  ACCESS_DENIED: 0xef4444, // red
  WORKSPACE_SUSPICIOUS_LOGIN: 0xef4444, // red
  WORKSPACE_NEW_OAUTH_APP: 0xf59e0b, // amber
  WORKSPACE_LOGIN_ALLOWLIST_VIOLATION: 0xef4444, // red
};

function alertLink(payload: ChatAlertPayload): string {
  const base = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${payload.link || "/approvals"}`;
}

function eventTitle(event: ChatAlertEvent): string {
  switch (event) {
    case "ACCESS_REQUESTED":
      return "New Access Request";
    case "ACCESS_APPROVED":
      return "Access Request Approved";
    case "ACCESS_DENIED":
      return "Access Request Denied";
    case "WORKSPACE_SUSPICIOUS_LOGIN":
      return "Suspicious Workspace Login";
    case "WORKSPACE_NEW_OAUTH_APP":
      return "New OAuth App Connected";
    case "WORKSPACE_LOGIN_ALLOWLIST_VIOLATION":
      return "Login Outside Allow-List";
  }
}

function eventDescription(event: ChatAlertEvent, payload: ChatAlertPayload): string {
  const { requesterName, accountName, requestTypeLabel, reason, detail } = payload;
  switch (event) {
    case "ACCESS_REQUESTED":
      return `${requesterName} requested ${requestTypeLabel || "access"} to "${accountName}".${
        reason ? `\n\n**Justification:** ${reason}` : ""
      }`;
    case "ACCESS_APPROVED":
      return `${requesterName}'s access request for "${accountName}" was approved.`;
    case "ACCESS_DENIED":
      return `${requesterName}'s access request for "${accountName}" was denied.${
        reason ? ` Reason: ${reason}` : ""
      }`;
    case "WORKSPACE_SUSPICIOUS_LOGIN":
      return `Google flagged a suspicious login for ${requesterName}${detail ? ` from ${detail}` : ""}.`;
    case "WORKSPACE_NEW_OAUTH_APP":
      return `${requesterName} connected a new OAuth app${accountName ? `: "${accountName}"` : ""}.`;
    case "WORKSPACE_LOGIN_ALLOWLIST_VIOLATION":
      return `${requesterName} logged in from outside the allow-list${detail ? ` (${detail})` : ""}.`;
  }
}

function discordApproveDenyComponents(event: ChatAlertEvent, payload: ChatAlertPayload) {
  if (event !== "ACCESS_REQUESTED" || !payload.requestId) return undefined;
  return [
    {
      type: 1, // action row
      components: [
        { type: 2, style: 3, label: "Approve", custom_id: `approve:${payload.requestId}` }, // green
        { type: 2, style: 4, label: "Deny", custom_id: `deny:${payload.requestId}` }, // red
      ],
    },
  ];
}

const channelIdCache = new Map<string, string>();

async function getChannelIdFromWebhook(webhookUrl: string): Promise<string | null> {
  if (channelIdCache.has(webhookUrl)) {
    return channelIdCache.get(webhookUrl)!;
  }
  try {
    const res = await fetch(webhookUrl);
    if (!res.ok) {
      console.error(`[WebhookAlerts] Failed to fetch webhook metadata: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { channel_id?: string };
    if (data.channel_id) {
      channelIdCache.set(webhookUrl, data.channel_id);
      return data.channel_id;
    }
  } catch (err) {
    console.error("[WebhookAlerts] Error resolving channel ID from webhook:", err);
  }
  return null;
}

async function sendDiscord(webhookUrl: string, event: ChatAlertEvent, payload: ChatAlertPayload): Promise<void> {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const body = {
      embeds: [
        {
          title: eventTitle(event),
          description: eventDescription(event, payload),
          color: EVENT_COLOR[event],
          url: alertLink(payload),
          timestamp: new Date().toISOString(),
        },
      ],
      components: discordApproveDenyComponents(event, payload),
    };

    if (botToken) {
      const channelId = await getChannelIdFromWebhook(webhookUrl);
      if (channelId) {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          return; // Successfully sent via Bot API!
        }
        console.error(`[WebhookAlerts] Discord Bot API responded ${res.status} ${await res.text()}. Falling back to webhook.`);
      }
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[WebhookAlerts] Discord webhook responded ${res.status}`);
    }
  } catch (error) {
    console.error("[WebhookAlerts] Discord send failed:", error);
  }
}

async function sendGoogleChat(webhookUrl: string, event: ChatAlertEvent, payload: ChatAlertPayload): Promise<void> {
  try {
    const buttons: any[] = [
      {
        text: payload.link ? "View Details" : "Open Approvals",
        onClick: { openLink: { url: alertLink(payload) } },
      },
    ];
    const body = {
      cardsV2: [
        {
          cardId: `orkavault-${event.toLowerCase()}-${Date.now()}`,
          card: {
            header: { title: eventTitle(event) },
            sections: [
              {
                widgets: [
                  { textParagraph: { text: eventDescription(event, payload) } },
                  { buttonList: { buttons } },
                ],
              },
            ],
          },
        },
      ],
    };
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[WebhookAlerts] Google Chat webhook responded ${res.status}`);
    }
  } catch (error) {
    console.error("[WebhookAlerts] Google Chat send failed:", error);
  }
}

/**
 * Send a chat alert to every configured, enabled webhook. Never throws —
 * a bad/missing webhook URL or a platform outage must not affect the
 * caller's request/approve/deny handling.
 */
export async function sendChatAlert(event: ChatAlertEvent, payload: ChatAlertPayload): Promise<void> {
  try {
    const [discordPolicy, gchatPolicy] = await Promise.all([
      prisma.organizationPolicy.findFirst({ where: { name: DISCORD_POLICY_NAME } }),
      prisma.organizationPolicy.findFirst({ where: { name: GCHAT_POLICY_NAME } }),
    ]);

    const sends: Promise<void>[] = [];
    if (discordPolicy?.enabled && discordPolicy.value) {
      sends.push(sendDiscord(discordPolicy.value, event, payload));
    }
    if (gchatPolicy?.enabled && gchatPolicy.value) {
      sends.push(sendGoogleChat(gchatPolicy.value, event, payload));
    }
    await Promise.allSettled(sends);
  } catch (error) {
    console.error("[WebhookAlerts] Failed to send chat alert:", error);
  }
}
