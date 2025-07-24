require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');

// === ENV ===
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

// === Gear Emoji Map ===
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

// === Sleep Utility ===
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// === Express Server ===
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
});

// === Discord Client Setup ===
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

// === Fetch Seed Data ===
async function fetchSeeds() {
  const url = 'https://gagstock.gleeze.com/grow-a-garden';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch GAGAPI: ${res.statusText}`);
  const json = await res.json();
  return json.data || {};
}

// === Main Logic ===
async function checkSeedsAndPingRoles() {
  try {
    console.log('⏳ Waiting 5 seconds before fetching seeds...');
    await sleep(5000); // <<–– DELAY HERE

    const data = await fetchSeeds();
    if (!data.seed?.items && !data.gear?.items) {
      console.log('⚠️ No seeds or gear found in API response.');
      return;
    }

    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('❌ Bot is not in any guilds.');
      return;
    }

    const channel = guild.channels.cache.get(CHANNEL_ID);
    if (!channel) {
      console.error('❌ Channel not found.');
      return;
    }

    const seeds = data.seed?.items || [];
    const gear = data.gear?.items || [];

    const seedLines = seeds.map(seed => {
      const emojiName = seed.name.toLowerCase().replace(/\s+/g, '_');
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
      return `${emoji ? `${emoji} ` : ''}${seed.name} x${seed.quantity}`;
    });

    const seedField = {
      name: 'SEEDS STOCK',
      value: seedLines.join('\n') || 'No seeds available',
      inline: false,
    };

let gearText = '';
for (const g of gear) {
  const emojiName = g.name.toLowerCase().replace(/\s+/g, '_'); // turn "Watering Can" into "watering_can"
  const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
  gearText += `${emoji ? `${emoji} ` : ''}${g.name} x${g.quantity}\n`;
} 
    
    const embed = new EmbedBuilder()
      .setTitle('🌱 Grow a Garden Stock')
      .setColor(0x22bb33)
      .addFields(
        seedField,
        { name: 'GEAR STOCK', value: gearText || 'No gear available', inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log('✅ Sent seeds and gear embed.');
  } catch (error) {
    console.error('❌ Error checking seeds:', error.message, error.stack);
  }
}

// === Schedule Seed Check ===
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
