require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with latency info'),
].map(cmd => cmd.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();

  if (!guild) {
    console.log('❌ Bot is not in any guilds!');
    return;
  }

  console.log(`Registering commands for guild: ${guild.name} (${guild.id})`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, guild.id),
      { body: commands }
    );
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    const apiLatency = Math.round(client.ws.ping);
    const msgLatency = Date.now() - interaction.createdTimestamp;
    await interaction.reply(`🏓 Pong!\nAPI Latency: ${apiLatency}ms\nMessage Latency: ${msgLatency}ms`);
  }
});

client.login(TOKEN);
