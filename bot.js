require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const fetch = require('node-fetch'); // Install: npm i node-fetch@2

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

// Map of custom emojis for seeds
const customEmojiMap = {
  carrot: '<:carrot:1>',
  // Add more custom emojis here as needed:
  // tomato: '<:tomato:1234567890>',
  // strawberry: '<:strawberry:9876543210>',
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

client.login(TOKEN);

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

    const seeds = data.seed?.items || [];
    const gear = data.gear?.items || [];

    const seedFields = seeds.map(seed => {
      const nameKey = seed.name.toLowerCase();
      const emoji = customEmojiMap[nameKey] || '';
      return {
        name: `${emoji} ${seed.name} x${seed.quantity}`,
        value: '\u200B',
        inline: true,
      };
    });

    let gearText = '';
    for (const g of gear) {
      const name = g.name.toLowerCase();
      const emoji = gearEmojiMap[name] || '';
      gearText += `${emoji} ${g.name} x${g.quantity}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('🌱 Grow a Garden Stock')
      .setColor(0x22bb33)
      .addFields(
        { name: 'SEEDS STOCK', value: '\u200B', inline: false },
        ...seedFields,
        { name: 'GEAR STOCK', value: gearText || 'No gear available', inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log('✅ Sent seeds and gear embed.');
  } catch (error) {
    console.error('❌ Error checking seeds:', error);
  }
}

function scheduleSeedCheck() {
  const now = DateTime.now();
  const nextCheck = now.plus({ minutes: 5 - (now.minute % 5) }).startOf('minute');
  const waitMs = nextCheck.diff(now).as('milliseconds');

  console.log(`⏰ Next seed check scheduled for ${nextCheck.toISOTime()} (in ${Math.round(waitMs)} ms)`);

  setTimeout(async () => {
    await checkSeedsAndPingRoles();
    scheduleSeedCheck();
  }, waitMs);
}
