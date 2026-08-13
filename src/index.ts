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

/**
 * Arrêt propre sur SIGINT/SIGTERM (ex. `pm2 stop`, `pm2 restart`, redémarrage VPS) :
 * ferme la connexion Prisma et détruit le client Discord avant de quitter, plutôt
 * que de couper brutalement des requêtes en cours.
 */
function registerShutdown(client: Client): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n🛑 Signal ${signal} reçu, arrêt en cours...`);
    client.destroy();
    // Import dynamique plutôt que top-level : le module est déjà chargé/caché à ce
    // stade (importé par les commandes au démarrage), donc sans coût réel, mais ça
    // évite d'instancier PrismaClient dès l'évaluation de index.js, avant même
    // l'enregistrement des handlers d'erreur ci-dessous.
    const { prisma } = await import('./db/client.js');
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Sans listener 'error', une erreur réseau émise par le client (perte de connexion
  // Gateway, etc.) ferait planter le process au lieu de simplement logger — discord.js
  // gère déjà la reconnexion automatique en interne, ce listener sert uniquement à
  // ne pas crasher sur l'émission de l'event lui-même.
  client.on('error', (error) => {
    console.error('❌ Erreur du client Discord :', error);
  });

  client.commands = await loadCommands();

  client.once('ready', onReady);
  client.on('interactionCreate', onInteractionCreate);

  registerShutdown(client);

  await client.login(process.env.DISCORD_TOKEN);
}

// Filet de sécurité process-level : logue et quitte proprement plutôt que de laisser
// Node planter silencieusement ou tourner dans un état indéterminé. PM2 redémarre
// automatiquement le process derrière (voir ecosystem.config.cjs), avec une protection
// anti-crash-loop (min_uptime/max_restarts) si le problème est structurel.
process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejetée non gérée :', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exception non interceptée :', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Erreur fatale au démarrage du bot :', error);
  process.exit(1);
});