require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // add this dependency if not installed
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const PREFIX = '!';

// Map item names (lowercase) to role IDs (replace with your real IDs)
const ITEM_ROLE_IDS = {
  'orange tulip': '1397255905007112243',
  'tomato': 'ROLE_ID_TOMATO',
  'corn': 'ROLE_ID_CORN',
  'basic sprinkler': 'ROLE_ID_BASIC_SPRINKLER',
  'godly sprinkler': 'ROLE_ID_GODLY_SPRINKLER',
  'magnifying glass': 'ROLE_ID_MAGNIFYING_GLASS',
  // Add your roles here
};

// Items always excluded from ping
const excludedSeeds = ['carrot', 'blueberry', 'strawberry', 'tomato'];
const excludedGear = ['watering can', 'recall wrench', 'trowel', 'cleaning spray', 'favorite tool', 'harvest tool'];

// --- Express Server ---
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
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

// --- Seed API Fetch ---
async function fetchSeeds() {
  const url = 'https://gagstock.gleeze.com/grow-a-garden';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch GAGAPI: ${res.statusText}`);
  const json = await res.json();
  return json.data || {};
}

// --- Main Seed Check + Embed Logic ---
async function checkSeedsAndPingRoles() {
  try {
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

    // Prepare seed list for embed with emojis
    const seedLines = seeds.map(seed => {
      const emojiName = seed.name.toLowerCase().replace(/\s+/g, '_');
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
      return `${emoji ? `<:${emoji.name}:${emoji.id}> ` : ''}${seed.name} x${seed.quantity}`;
    });

    // Prepare gear text with emojis
    let gearText = '';
    for (const g of gear) {
      const name = g.name.toLowerCase();
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === name);
      gearText += `${emoji ? `<:${emoji.name}:${emoji.id}>` : ''} ${g.name} x${g.quantity}\n`;
    }

    // Determine which seeds and gear to ping (exclude always present)
    const pingSeeds = seeds.filter(seed => !excludedSeeds.includes(seed.name.toLowerCase()));
    const pingGear = gear.filter(g => !excludedGear.includes(g.name.toLowerCase()));

    // Collect role IDs for current stock items (avoid duplicates)
    const rolesToPingSet = new Set();

    for (const seed of pingSeeds) {
      const roleId = ITEM_ROLE_IDS[seed.name.toLowerCase()];
      if (roleId) rolesToPingSet.add(roleId);
    }

    for (const g of pingGear) {
      const roleId = ITEM_ROLE_IDS[g.name.toLowerCase()];
      if (roleId) rolesToPingSet.add(roleId);
    }

    // Validate roles and check if mentionable
    const validRoles = Array.from(rolesToPingSet)
      .map(id => guild.roles.cache.get(id))
      .filter(role => role && role.mentionable);

    const pingString = validRoles.length > 0
      ? validRoles.map(role => `<@&${role.id}>`).join(' ')
      : '';

    const embed = new EmbedBuilder()
      .setTitle('🌱 Grow a Garden Stock')
      .setColor(0x22bb33)
      .addFields(
        { name: 'SEEDS STOCK', value: seedLines.join('\n') || 'No seeds available', inline: false },
        { name: 'GEAR STOCK', value: gearText || 'No gear available', inline: false }
      )
      .setTimestamp();

    if (pingString) {
      await channel.send({ content: pingString, embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }

    console.log(`✅ Sent embed${pingString ? ' with pings.' : '.'}`);
  } catch (error) {
    console.error('❌ Error checking seeds:', error);
  }
}

// --- Seed Check Scheduler ---
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

// --- !listemojis command ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (!message.content.startsWith(PREFIX)) return;
  const [command] = message.content.trim().split(/\s+/);

  if (command === `${PREFIX}listemojis`) {
    const emojis = message.guild.emojis.cache;

    if (emojis.size === 0) {
      return message.channel.send('❌ No custom emojis found in this server.');
    }

    const emojiLines = emojis.map(emoji => {
      const formatted = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
      const type = emoji.animated ? 'Animated' : 'Static';
      return `• ${emoji.name} → ${formatted} (ID: \`${emoji.id}\`, ${type})`;
    });

    // Split into chunks for Discord message limit (1900 chars)
    const chunks = chunkByCharacterLimit(emojiLines, 1900);

    for (const chunk of chunks) {
      await message.channel.send(`📙 **Custom Emojis:**\n${chunk}`);
    }
  }
});

// --- Helper to chunk long messages ---
function chunkByCharacterLimit(lines, maxChars = 1900) {
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxChars) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}
