import type { Client } from 'discord.js';

export function onReady(client: Client<true>): void {
  console.log(`✅ Connecté en tant que ${client.user.tag} (${client.commands.size} commande(s) chargée(s))`);
}