require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const PREFIX = '!';

const adminIDs = [
  "826494218355605534",
  "1385377368108961884",
  "1231292898469740655",
];

// Map item names (lowercase) to role IDs (replace with your real IDs)
const ITEM_ROLE_IDS = {
  'orange tulip': '1397255905007112243',
  'corn': '1397819643514589295',
  'daffodil': '1397820120935432314',
  'watermelon': '1397820277316124744',
  'pumpkin': '1397820494421688360',
  'apple': '1397899740271742976',
  'bamboo': '1397899905124536320',
  'coconut': '1397900093360963635',
  'cactus': '1397900426027859978',
  'dragon fruit': '1397900661319925894',
  'mango': '1397901168436445306',
  'grape': '1397901612114247762',
  'mushroom': '1397901797355421747',
  'pepper': '1397902096946434058',
  'cacao': '1397902195898450021',
  'beanstalk': '1397902504125272155',
  'ember lily': '1397902752306167809',
  'sugar apple': '1397903125943291934',
  'burning bud': '1397902752306167809',
  'giant pinecone': '1397905644027248742',

  // New Gear Shop items (keys only, placeholder role IDs)
  'watering can': '1397913821846175864',
  'trowel': '1397914064306442320',
  'recall wrench': '1397914193474359306',
  'basic sprinkler': '1397914304728273049',
  'advanced sprinkler': '1397914427873034382',
  'medium toy': '1397914725999841392',
  'medium treat': '1397914731922325545',
  'godly sprinkler': '1397914588636250152',
  'magnifying glass': '1397915215827308574',
  'tanning mirror': '1397915712760057906',
  'master sprinkler': '1397915857769730058',
  'cleaning spray': '1397915979522117713',
  'favorite tool': '1397916270493569124',
  'harvest tool': '1397916329583050783',
  'friendship pot': '1397916575524192358',
  'level up lollipop': '1397916660870156328',
};


const excludedSeeds = ['carrot', 'blueberry', 'strawberry', 'tomato'];
const excludedGear = ['watering can', 'recall wrench', 'trowel', 'cleaning spray', 'favorite tool', 'harvest tool'];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- Express Server ---
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
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
  return `${emoji ? `<:${emoji.name}:${emoji.id}> ` : ''}${seed.name} **x${seed.quantity}**`;
}); 

    // Prepare gear text with emojis
    let gearText = '';
    for (const g of gear) {
      const emojiName = g.name.toLowerCase().replace(/\s+/g, '_');
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
      gearText += `${emoji ? `<:${emoji.name}:${emoji.id}>` : ''} ${g.name} **x${g.quantity}**\n`;
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
  const nextCheck = now
    .plus({ minutes: 5 - (now.minute % 5) }) // round up to next 5-minute mark
    .startOf('minute')
    .plus({ seconds: 10 }); // add 5 seconds delay

  const waitMs = nextCheck.diff(now).as('milliseconds');

  console.log(`⏰ Next seed check scheduled for ${nextCheck.toISOTime()} (in ${Math.round(waitMs)} ms)`);

  setTimeout(async () => {
    await checkSeedsAndPingRoles();
    scheduleSeedCheck(); // recursively schedule next run
  }, waitMs);
}
