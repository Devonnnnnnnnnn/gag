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
  'extra1': 'ROLE_ID1',
  'extra2': 'ROLE_ID2',
  'extra3': 'ROLE_ID3',
  'extra4': 'ROLE_ID4',
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

// --- !reactionroles command + reaction role handling ---
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [command] = message.content.trim().split(/\s+/);

  if (command === `${PREFIX}reactionroles`) {
    if (!adminIDs.includes(message.author.id)) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    const guild = message.guild;
    const roles = Object.entries(ITEM_ROLE_IDS);

    // Prepare role names
    const roleNames = roles.map(([itemName, roleId]) => {
      const role = guild.roles.cache.get(roleId);
      return role ? role.name : 'Unknown Role';
    });

    // Format into 4 columns inside a code block with padding
    const columns = 4;
    const padLength = 20;
    const lines = [];
    for (let i = 0; i < roleNames.length; i += columns) {
      const row = roleNames.slice(i, i + columns);
      const paddedRow = row.map(name => name.padEnd(padLength, ' '));
      lines.push(paddedRow.join(''));
    }

    const embed = new EmbedBuilder()
      .setTitle('🌱 Grow a Garden Reaction Roles')
      .setDescription('React to this message to get/remove the corresponding role!\n\nReact again to remove the role.')
      .setColor(0x22bb33)
      .addFields({ name: 'Roles', value: '```\n' + lines.join('\n') + '\n```' })
      .setTimestamp();

    const sentMessage = await message.channel.send({ embeds: [embed] });

    // Emojis for each role (adjust emojis to fit your roles)
    const roleEmojis = [
      '🌷', '🌽', '💐', '🍉',
      '🎃', '🍎', '🎍', '🥥',
      '🌵', '🍈', '🥭', '🍇',
      '🍄', '🌶️', '🍫', '🌱',
      '🌺', '🍏', '🔥', '🌲',
      '🍀', '🍋', '🍓', '🍍'
    ];

    for (let i = 0; i < roles.length; i++) {
      const emoji = roleEmojis[i] || '❓';
      try {
        await sentMessage.react(emoji);
      } catch (err) {
        console.error('Failed to react:', err);
      }
    }

    // Reaction collector to handle role add/remove
    const filter = (reaction, user) => {
      return !user.bot && roleEmojis.includes(reaction.emoji.name);
    };

    const collector = sentMessage.createReactionCollector({ filter, dispose: true });

    collector.on('collect', async (reaction, user) => {
      try {
        const emojiIndex = roleEmojis.indexOf(reaction.emoji.name);
        if (emojiIndex === -1) return;

        const [, roleId] = roles[emojiIndex];
        const member = await guild.members.fetch(user.id);

        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId);
          console.log(`Added role ${roleId} to ${user.tag}`);
        }
      } catch (error) {
        console.error('Error adding role:', error);
      }
    });

    collector.on('remove', async (reaction, user) => {
      try {
        const emojiIndex = roleEmojis.indexOf(reaction.emoji.name);
        if (emojiIndex === -1) return;

        const [, roleId] = roles[emojiIndex];
        const member = await guild.members.fetch(user.id);

        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);
          console.log(`Removed role ${roleId} from ${user.tag}`);
        }
      } catch (error) {
        console.error('Error removing role:', error);
      }
    });
  }
});

// --- !listemojis command from your original code ---
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

// Helper to chunk long messages
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
