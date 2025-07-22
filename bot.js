require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

const seedRoleMap = {
  carrot: '1397255905007112243',
  // add other seeds and their role IDs here, e.g.:
  // tomato: 'roleid123',
  // lettuce: 'roleid456',
};

// --- Express Server Setup ---
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
});

// --- Discord Bot Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  scheduleSeedCheck();
});

client.login(TOKEN);

async function fetchSeeds() {
  const url = 'https://gagstock.gleeze.com/grow-a-garden';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch GAGAPI: ${res.statusText}`);
  const json = await res.json();
  return json.data.seed?.items || [];
}

async function checkSeedsAndPingRoles() {
  try {
    const seeds = await fetchSeeds();
    if (!seeds.length) {
      console.log('⚠️ No seeds found in API response.');
      return;
    }

    const guilds = client.guilds.cache;
    if (guilds.size === 0) {
      console.error('❌ Bot is not in any guilds.');
      return;
    }

    let guild;
    for (const g of guilds.values()) {
      if (g.channels.cache.has(CHANNEL_ID)) {
        guild = g;
        break;
      }
    }
    if (!guild) {
      console.error('❌ No guild found with the specified channel ID.');
      return;
    }

    const channel = guild.channels.cache.get(CHANNEL_ID);
    if (!channel) {
      console.error('❌ Channel not found.');
      return;
    }

    // Build embed for seeds
    const embed = new EmbedBuilder()
      .setTitle('🌱 Available Seeds')
      .setColor(0x00ff00)
      .setTimestamp();

    // Prepare mentions string
    let mentionText = '';

    for (const seed of seeds) {
      const seedName = seed.name.toLowerCase();

      embed.addFields({
        name: seed.name,
        value: seed.description || 'No description available',
        inline: true,
      });

      const roleId = seedRoleMap[seedName];
      if (roleId) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          mentionText += `<@&${role.id}> `;
        } else {
          mentionText += `@ROLE_NOTFOUND(${seed.name}) `;
        }
      } else {
        mentionText += `@ROLE_NOTFOUND(${seed.name}) `;
      }
    }

    await channel.send({ content: mentionText.trim(), embeds: [embed] });

    console.log('✅ Sent seeds embed with role pings.');
  } catch (error) {
    console.error('❌ Error checking seeds:', error);
  }
}

function scheduleSeedCheck() {
  const now = DateTime.now();
  // Schedule next check on next 5 minute interval
  const nextCheck = now.plus({ minutes: 5 - (now.minute % 5) }).startOf('minute');
  const waitMs = nextCheck.diff(now).as('milliseconds');

  console.log(`⏰ Next seed check scheduled for ${nextCheck.toISOTime()} (in ${Math.round(waitMs)} ms)`);

  setTimeout(async () => {
    await checkSeedsAndPingRoles();
    scheduleSeedCheck();
  }, waitMs);
}
