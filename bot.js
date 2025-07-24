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

// Map item names (lowercase) to role IDs
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
  'giant pinecone': '1397905644027248742'
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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
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
      const emojiName = g.name.toLowerCase().replace(/\s+/g, '_');
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
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

// --- Command Handler ---
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

  // Reaction roles command
  if (command === `${PREFIX}reactionroles`) {
    if (!adminIDs.includes(message.author.id)) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    const guild = message.guild;

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle('React to get roles')
      .setDescription('React to the emojis below to get or remove the corresponding role.')
      .setColor(0x00AAFF);

    // Add fields with role names
    for (const [itemName, roleId] of Object.entries(ITEM_ROLE_IDS)) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        embed.addFields({ name: role.name, value: itemName, inline: true });
      }
    }

    const sentMessage = await message.channel.send({ embeds: [embed] });

    // Add reactions: try to use matching custom emojis if available, else fallback to letters
    // We'll try to get custom emoji matching itemName with underscores
    for (const itemName of Object.keys(ITEM_ROLE_IDS)) {
      const emojiName = itemName.toLowerCase().replace(/\s+/g, '_');
      const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emojiName);
      try {
        if (emoji) {
          await sentMessage.react(emoji);
        } else {
          // fallback: first letter regional indicator if possible
          const firstChar = itemName[0].toLowerCase();
          const regionalIndicator = String.fromCodePoint(firstChar.charCodeAt(0) - 97 + 0x1F1E6);
          await sentMessage.react(regionalIndicator);
        }
      } catch (e) {
        console.warn(`Failed to react with emoji for ${itemName}:`, e);
      }
    }

    // Store message ID and guild ID so you can handle reaction adds/removes later (not implemented here)
    // You can store these in a database or memory if you want persistent reaction roles.
  }
});

// --- Reaction Role Handler ---
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (!reaction.message.guild) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  // Only handle reactions on the reactionroles message (for now, we'll check channel and embed title)
  if (!reaction.message.embeds.length) return;
  const embed = reaction.message.embeds[0];
  if (embed.title !== 'React to get roles') return;

  // Map emoji to role
  let roleId = null;

  // Try to match custom emoji name or regional indicator to role
  if (reaction.emoji.id) {
    // Custom emoji
    const emojiName = reaction.emoji.name.toLowerCase();
    // Find matching item name with underscores replaced spaces
    for (const [itemName, rId] of Object.entries(ITEM_ROLE_IDS)) {
      if (emojiName === itemName.toLowerCase().replace(/\s+/g, '_')) {
        roleId = rId;
        break;
      }
    }
  } else {
    // Unicode emoji (likely regional indicator)
    // Try to map regional indicator back to first letter of item name
    // e.g. 🇦 = a, 🇧 = b etc
    const codePoint = reaction.emoji.name.codePointAt(0);
    if (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF) {
      const char = String.fromCharCode(codePoint - 0x1F1E6 + 97);
      // find first item name starting with that char
      for (const [itemName, rId] of Object.entries(ITEM_ROLE_IDS)) {
        if (itemName.toLowerCase().startsWith(char)) {
          roleId = rId;
          break;
        }
      }
    }
  }

  if (!roleId) return;

  const role = guild.roles.cache.get(roleId);
  if (!role) return;

  if (member.roles.cache.has(roleId)) return;

  try {
    await member.roles.add(role);
    console.log(`✅ Added role ${role.name} to user ${user.tag}`);
  } catch (e) {
    console.error('❌ Failed to add role:', e);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (!reaction.message.guild) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  if (!reaction.message.embeds.length) return;
  const embed = reaction.message.embeds[0];
  if (embed.title !== 'React to get roles') return;

  let roleId = null;

  if (reaction.emoji.id) {
    const emojiName = reaction.emoji.name.toLowerCase();
    for (const [itemName, rId] of Object.entries(ITEM_ROLE_IDS)) {
      if (emojiName === itemName.toLowerCase().replace(/\s+/g, '_')) {
        roleId = rId;
        break;
      }
    }
  } else {
    const codePoint = reaction.emoji.name.codePointAt(0);
    if (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF) {
      const char = String.fromCharCode(codePoint - 0x1F1E6 + 97);
      for (const [itemName, rId] of Object.entries(ITEM_ROLE_IDS)) {
        if (itemName.toLowerCase().startsWith(char)) {
          roleId = rId;
          break;
        }
      }
    }
  }

  if (!roleId) return;

  const role = guild.roles.cache.get(roleId);
  if (!role) return;

  if (!member.roles.cache.has(roleId)) return;

  try {
    await member.roles.remove(role);
    console.log(`✅ Removed role ${role.name} from user ${user.tag}`);
  } catch (e) {
    console.error('❌ Failed to remove role:', e);
  }
});

// --- Utility ---
function chunkByCharacterLimit(lines, limit) {
  const chunks = [];
  let chunk = '';

  for (const line of lines) {
    if ((chunk + line + '\n').length > limit) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += line + '\n';
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
