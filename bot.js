require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

// Map seed and gear names to their emojis and optionally role IDs
const seedRoleMap = {
  carrot: '1397255905007112243', // example role ID
  cactus: 'roleIdForCactus',
  strawberry: 'roleIdForStrawberry',
  'orange tulip': 'roleIdForOrangeTulip',
  tomato: 'roleIdForTomato',
  blueberry: 'roleIdForBlueberry',
};

const seedEmojiMap = {
  carrot: '🥕',
  cactus: '🌵',
  strawberry: '🍓',
  'orange tulip': '🌷',
  tomato: '🍅',
  blueberry: '🫐',
};

const gearEmojiMap = {
  'cleaning spray': '🧴',
  trowel: '🛠️',
  'harvest tool': '🪓',
  'basic sprinkler': '💧',
  'recall wrench': '🔧',
  'favorite tool': '❤️',
  'watering can': '🪣',
  'magnifying glass': '🔍',
  'godly sprinkler': '🌱',
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

client.login(TOKN);

async function fetchSeeds() {
  const url = 'https://gagstock.gleeze.com/grow-a-garden';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch GAGAPI: ${res.statusText}`);
  const json = await res.json();
  return json.data || {};
}

async function checkSeedsAndPingRoles() {
  try {
    const data = await fetchSeeds();
    if (!data.seed?.items && !data.gear?.items) {
      console.log('⚠️ No seeds or gear found in API response.');
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

    // Separate seeds and gear
    const seeds = data.seed?.items || [];
    const gear = data.gear?.items || [];

    // Build description for seeds and gear, formatted like the screenshot
    let seedsText = '';
    for (const seed of seeds) {
      const name = seed.name.toLowerCase();
      const emoji = seedEmojiMap[name] || '';
      seedsText += `${emoji} ${seed.name} x${seed.quantity}\n`;
    }

    let gearText = '';
    for (const g of gear) {
      const name = g.name.toLowerCase();
      const emoji = gearEmojiMap[name] || '';
      gearText += `${emoji} ${g.name} x${g.quantity}\n`;
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle('🌱 Grow a Garden Stock')
      .setColor(0x22bb33)
      .addFields(
        { name: 'SEEDS STOCK', value: seedsText || 'No seeds available', inline: false },
        { name: 'GEAR STOCK', value: gearText || 'No gear available', inline: false },
      )
      .setTimestamp();

    // Prepare mention text for roles (optional)
    let mentionText = '';
    for (const seed of seeds) {
      const seedName = seed.name.toLowerCase();
      const roleId = seedRoleMap[seedName];
      if (roleId) {
        const role = guild.roles.cache.get(roleId);
        if (role) mentionText += `<@&${role.id}> `;
        else mentionText += `@ROLE_NOTFOUND(${seed.name}) `;
      } else {
        mentionText += `@ROLE_NOTFOUND(${seed.name}) `;
      }
    }

    // Send message with embed and role mentions
    await channel.send({ content: mentionText.trim(), embeds: [embed] });

    console.log('✅ Sent seeds and gear embed with role pings.');
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
