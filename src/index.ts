import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { Command } from './types.js';
import { onReady } from './events/ready.js';
import { onInteractionCreate } from './events/interactionCreate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

async function loadCommands(): Promise<Collection<string, Command>> {
  const commands = new Collection<string, Command>();
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith(extension));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const commandModule = await import(pathToFileURL(filePath).href);
    const command: Command = commandModule.default;

    if (!command?.data || !command?.execute) {
      console.warn(`⚠️ ${file} n'exporte pas de Command valide par défaut, ignoré.`);
      continue;
    }

    commands.set(command.data.name, command);
    console.log(`  ↳ Commande chargée : /${command.data.name}`);
  }

  return commands;
}

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.commands = await loadCommands();

  client.once('ready', onReady);
  client.on('interactionCreate', onInteractionCreate);

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((error) => {
  console.error('Erreur fatale au démarrage du bot :', error);
  process.exit(1);
});