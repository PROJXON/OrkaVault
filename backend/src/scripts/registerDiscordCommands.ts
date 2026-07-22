/**
 * One-off: registers the `/orkavault link <code>` slash command with
 * Discord. Run manually after creating the Discord Application (see
 * docs/discord-google-chat-alerts-bot.md) — slash commands aren't picked
 * up automatically, Discord's REST API has to be told about them once.
 *
 * Usage: DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... npx ts-node src/scripts/registerDiscordCommands.ts
 *
 * Global commands can take up to an hour to propagate; that's a Discord
 * platform limitation, not something to work around here.
 */
async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  if (!token || !applicationId) {
    console.error("DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set.");
    process.exit(1);
  }

  const command = {
    name: "orkavault",
    description: "OrkaVault commands",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "link",
        description: "Link this Discord account to your OrkaVault account",
        options: [
          {
            type: 3, // STRING
            name: "code",
            description: "One-time code from Profile > Link Discord in OrkaVault",
            required: true,
          },
        ],
      },
    ],
  };

  const res = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command]),
  });

  if (!res.ok) {
    console.error(`Failed to register commands: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log("Registered /orkavault command with Discord.");
}

main();
