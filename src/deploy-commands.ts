import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import type { Command } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// tsx exécute directement les .ts ; une fois compilé (tsc → dist/), ce sont des .js.
const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

async function collectCommandsData() {
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith(extension));
  const commandsData = [];

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const commandModule = await import(pathToFileURL(filePath).href);
    const command: Command = commandModule.default;

    if (!command?.data) {
      console.warn(`⚠️ ${file} n'exporte pas de Command valide par défaut, ignoré.`);
      continue;
    }

    commandsData.push(command.data.toJSON());
  }

  return commandsData;
}

async function deployCommands() {
  const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

  if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    throw new Error("Variables d'environnement manquantes : vérifie ton fichier .env");
  }

  const commandsData = await collectCommandsData();
  const rest = new REST().setToken(DISCORD_TOKEN);

  console.log(`🚀 Déploiement de ${commandsData.length} commande(s) sur le serveur de test...`);

  await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), {
    body: commandsData,
  });

  console.log('✅ Commandes déployées avec succès.');
}

deployCommands().catch((error) => {
  console.error('❌ Erreur lors du déploiement des commandes :', error);
  process.exit(1);
});