require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const fetch = require('node-fetch'); // if you don’t have it, install: npm i node-fetch@2

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;

const seedImageMap = {
  carrot: 'https://static.wikia.nocookie.net/growagarden/images/5/59/CarrotProduce.png',
  cactus: 'https://static.wikia.nocookie.net/growagarden/images/1/19/CactusProduceIcon.png/revision/latest/scale-to-width-down/268?cb=20250708022108',
  strawberry: 'https://static.wikia.nocookie.net/growagarden/images/6/6d/Strawberry.png/revision/latest/scale-to-width-down/268?cb=20250501001831',
  'orange tulip': 'https://static.wikia.nocookie.net/growagarden/images/4/4d/Orangetulip.png/revision/latest/scale-to-width-down/268?cb=20250422131408',
  tomato: 'https://static.wikia.nocookie.net/growagarden/images/9/9d/Tomato.png/revision/latest/scale-to-width-down/268?cb=20250501001240',
  blueberry: 'https://static.wikia.nocookie.net/growagarden/images/9/9e/Blueberry.png/revision/latest/scale-to-width-down/268?cb=20250504064726',
  corn: 'https://static.wikia.nocookie.net/growagarden/images/e/ee/CornCropsPic.png/revision/latest?cb=20250716123712',
  daffodil: 'https://static.wikia.nocookie.net/growagarden/images/3/31/Daffodilfruiticon.png/revision/latest/scale-to-width-down/267?cb=20250422223149',
  watermelon: 'https://static.wikia.nocookie.net/growagarden/images/3/31/Watermelonfruiticon.png/revision/latest/scale-to-width-down/267?cb=20250422203923',
  pumpkin: 'https://static.wikia.nocookie.net/growagarden/images/8/8b/Pumpkin_produce.png/revision/latest/scale-to-width-down/268?cb=20250708015448',
  apple: 'https://static.wikia.nocookie.net/growagarden/images/c/c3/Applefruiticon.png/revision/latest/scale-to-width-down/267?cb=20250423014534',
  bamboo: 'https://static.wikia.nocookie.net/growagarden/images/8/88/Bamboofruiticon.png/revision/latest?cb=20250422225330',
  coconut: 'https://static.wikia.nocookie.net/growagarden/images/4/46/Coconutfruiticon.png/revision/latest?cb=20250421045107',
  dragonfruit: 'https://static.wikia.nocookie.net/growagarden/images/f/f0/Dragon_Fruit_Produce.png/revision/latest/scale-to-width-down/268?cb=20250708022814',
  mango: 'https://static.wikia.nocookie.net/growagarden/images/8/81/Mango_produce.png/revision/latest/scale-to-width-down/267?cb=20250708014006',
  grape: 'https://static.wikia.nocookie.net/growagarden/images/9/98/Grape_Produce.png/revision/latest?cb=20250708020531',
  mushroom: 'https://static.wikia.nocookie.net/growagarden/images/3/3a/MushroomCropsPic.png/revision/latest/scale-to-width-down/268?cb=20250430134436',
  pepper: 'https://static.wikia.nocookie.net/growagarden/images/2/29/PepperCropsPic.png/revision/latest/scale-to-width-down/268?cb=20250503163931',
  cacao: 'https://static.wikia.nocookie.net/growagarden/images/f/f2/CacaoIcon.png/revision/latest/scale-to-width-down/268?cb=20250511025646',
  beanstalk: 'https://static.wikia.nocookie.net/growagarden/images/f/f9/BeanstalkIcon.png/revision/latest/scale-to-width-down/268?cb=20250711192652',
  emberlily: 'https://static.wikia.nocookie.net/growagarden/images/7/72/Ember_Lily_Produce.png/revision/latest?cb=20250711192911',
  sugarapple: 'https://static.wikia.nocookie.net/growagarden/images/a/a7/SugarAppleIcon.png/revision/latest/scale-to-width-down/268?cb=20250711193019',
  burningbud: 'https://static.wikia.nocookie.net/growagarden/images/2/27/Burning_Bud_Product.PNG/revision/latest/scale-to-width-down/268?cb=20250709003332',
  giantpinecone: 'https://static.wikia.nocookie.net/growagarden/images/e/e9/Giant_pinecone.png/revision/latest?cb=20250716123453',
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

    // Build fields with seed images and quantity
    const seedFields = seeds.map(seed => {
      const nameKey = seed.name.toLowerCase();
      const imageUrl = seedImageMap[nameKey] || null;
      // Use markdown to put image as "emoji" by linking a tiny invisible char with the image as name
      // Since Discord doesn't support images inline in text, we will display the image as a thumbnail for the whole embed or in field name with a markdown link
      // Here we just put the seed name and quantity, and will set the embed thumbnail to the first seed image as an example

      // To visually show images for each seed, we'll use the field name with the image URL in parentheses (not clickable image though)
      return {
        name: `${seed.name} x${seed.quantity}`,
        value: imageUrl ? `[‎](${imageUrl})` : 'No image',
        inline: true,
      };
    });

    // Gear text - keep emoji for simplicity
    let gearText = '';
    for (const g of gear) {
      const name = g.name.toLowerCase();
      const emoji = gearEmojiMap[name] || '';
      gearText += `${emoji} ${g.name} x${g.quantity}\n`;
    }

    // Embed creation
    const embed = new EmbedBuilder()
      .setTitle('🌱 Grow a Garden Stock')
      .setColor(0x22bb33)
      .addFields(
        { name: 'SEEDS STOCK', value: '\u200B', inline: false }, // Empty line for spacing
        ...seedFields,
        { name: 'GEAR STOCK', value: gearText || 'No gear available', inline: false }
      )
      .setTimestamp();

    // Set thumbnail to first seed image if available
    if (seeds.length > 0) {
      const firstSeedName = seeds[0].name.toLowerCase();
      const thumbUrl = seedImageMap[firstSeedName];
      if (thumbUrl) embed.setThumbnail(thumbUrl);
    }

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
