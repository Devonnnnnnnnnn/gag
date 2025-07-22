require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { DateTime } = require('luxon');

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Map seed names to role IDs
const seedRoleMap = {
  carrot: '1397255905007112243',
};

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

    // Find guild containing the target channel
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

    // Look for carrot seed
    const carrotSeed = seeds.find(s => s.name.toLowerCase() === 'carrot');
    if (!carrotSeed) {
      console.log('ℹ️ Carrot seed not currently available, skipping ping.');
      return;
    }

    // Check role and prepare mention
    const roleId = seedRoleMap.carrot;
    const role = guild.roles.cache.get(roleId);
    const mention = role ? `<@&${role.id}>` : '@NOTFOUND';

    await channel.send(`🌱 Carrot seed is now available! ${mention}`);
    console.log('✅ Sent carrot seed ping.');
  } catch (error) {
    console.error('❌ Error checking seeds:', error);
  }
}

function scheduleSeedCheck() {
  const now = DateTime.now();
  // Next time at the next multiple of 5 minutes (e.g. 12:10, 12:15, 12:20, etc)
  const nextCheck = now.plus({ minutes: 5 - (now.minute % 5) }).startOf('minute');
  const waitMs = nextCheck.diff(now).as('milliseconds');

  console.log(`⏰ Next seed check scheduled for ${nextCheck.toISOTime()} (in ${Math.round(waitMs)} ms)`);

  setTimeout(async () => {
    await checkSeedsAndPingRoles();
    scheduleSeedCheck();
  }, waitMs);
}
