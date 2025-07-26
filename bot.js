require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const { DateTime } = require('luxon');

// ENV + Constants
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const PREFIX = '!';

const adminIDs = [
  "826494218355605534",
  "1385377368108961884",
  "1231292898469740655",
];

// Role Mapping
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

// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Express Server
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`🌐 Express server running on port ${PORT}`));

// Login + Startup
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  scheduleSeedCheck();
});

client.login(TOKEN);

// Fetch Seeds from API
async function fetchSeeds() {
  const res = await fetch('https://gagstock.gleeze.com/grow-a-garden');
  if (!res.ok) throw new Error(`Failed to fetch API: ${res.statusText}`);
  const json = await res.json();
  return json.data || {};
}

// Ping Roles Based on Stock
async function checkSeedsAndPingRoles() {
  try {
    const data = await fetchSeeds();
    const seeds = data.seed?.items || [];
    const gear = data.gear?.items || [];

    const guild = client.guilds.cache.first();
    const channel = guild?.channels.cache.get(CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return console.error('❌ Channel not found or invalid.');

    const seedLines = seeds.map(seed => {
      const emojiName = seed.name.toLowerCase().replace(/\s+/g, '_');
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
      return `${emoji ? `<:${emoji.name}:${emoji.id}> ` : ''}${seed.name} **x${seed.quantity}**`;
    });

    const gearText = gear.map(g => {
      const emojiName = g.name.toLowerCase().replace(/\s+/g, '_');
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
      return `${emoji ? `<:${emoji.name}:${emoji.id}>` : ''} ${g.name} **x${g.quantity}**`;
    }).join('\n');

    const rolesToPing = new Set();

    [...seeds, ...gear].forEach(item => {
      const isExcluded = excludedSeeds.includes(item.name.toLowerCase()) || excludedGear.includes(item.name.toLowerCase());
      if (!isExcluded) {
        const roleId = ITEM_ROLE_IDS[item.name.toLowerCase()];
        if (roleId) rolesToPing.add(roleId);
      }
    });

    const validRoles = Array.from(rolesToPing)
      .map(id => guild.roles.cache.get(id))
      .filter(role => role?.mentionable);

    const pingString = validRoles.length ? validRoles.map(role => `<@&${role.id}>`).join(' ') : '';

    const embed = new EmbedBuilder()
      .setTitle('🌱 Grow a Garden Stock')
      .setColor(0x22bb33)
      .addFields(
        { name: 'SEEDS STOCK', value: seedLines.join('\n') || 'No seeds available', inline: false },
        { name: 'GEAR STOCK', value: gearText || 'No gear available', inline: false }
      )
      .setTimestamp();

    await channel.send({ content: pingString || null, embeds: [embed] });
    console.log(`✅ Stock update sent${pingString ? ' with role pings' : ''}`);
  } catch (err) {
    console.error('❌ Error in checkSeedsAndPingRoles:', err);
  }
}

// Schedule Every 5 Minutes
function scheduleSeedCheck() {
  const now = DateTime.now();
  const next = now.plus({ minutes: 5 - (now.minute % 5) }).startOf('minute').plus({ seconds: 10 });
  const wait = next.diff(now).as('milliseconds');
  console.log(`⏰ Next check at ${next.toISOTime()}`);

  setTimeout(async () => {
    await checkSeedsAndPingRoles();
    scheduleSeedCheck();
  }, wait);
}

// Command Handler
client.on('messageCreate', async message => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;
  const [command] = message.content.slice(PREFIX.length).trim().split(/\s+/);

  if (command === 'reactionroles' && adminIDs.includes(message.author.id)) {
    await handleReactionRoles(message);
  }
});

// Handle Reaction Roles Command
async function handleReactionRoles(message) {
  const guild = message.guild;
  const roleLines = [];

  for (const [itemName, roleId] of Object.entries(ITEM_ROLE_IDS)) {
    const role = guild.roles.cache.get(roleId);
    const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === itemName.replace(/\s+/g, '_'));
    if (!role || !emoji) continue;
    roleLines.push(`${emoji} — <@&${roleId}>`);
  }

  const header = "React to this message to get roles for items:\n\n";
  const maxChunkSize = 2000;

  let currentMessage = header;
  let sentMessages = [];

  for (const line of roleLines) {
    if ((currentMessage + line + '\n').length > maxChunkSize) {
      const sent = await message.channel.send(currentMessage);
      sentMessages.push(sent);
      currentMessage = line + '\n';
    } else {
      currentMessage += line + '\n';
    }
  }

  if (currentMessage.length > 0) {
    const sent = await message.channel.send(currentMessage);
    sentMessages.push(sent);
  }

  // React to all messages with emojis
  for (const sentMsg of sentMessages) {
    for (const itemName of Object.keys(ITEM_ROLE_IDS)) {
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === itemName.replace(/\s+/g, '_'));
      if (emoji) {
        try {
          await sentMsg.react(emoji);
        } catch (e) {
          console.error(`⚠️ Could not react with ${emoji.name}:`, e.message);
        }
      }
    }
  }
}

// Reaction Add / Remove
client.on('messageReactionAdd', async (reaction, user) => handleReaction(reaction, user, 'add'));
client.on('messageReactionRemove', async (reaction, user) => handleReaction(reaction, user, 'remove'));

async function handleReaction(reaction, user, action) {
  if (user.bot || !reaction.message.guild) return;

  const emojiName = reaction.emoji.name.toLowerCase();
  const itemName = Object.keys(ITEM_ROLE_IDS).find(name => name.replace(/\s+/g, '_') === emojiName);
  const roleId = ITEM_ROLE_IDS[itemName];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  if (action === 'add' && !member.roles.cache.has(roleId)) {
    await member.roles.add(roleId).catch(console.error);
  }
  if (action === 'remove' && member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId).catch(console.error);
  }
}
