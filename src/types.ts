import type { ChatInputCommandInteraction, Collection, SlashCommandBuilder } from 'discord.js';

// Contrat que doit respecter chaque fichier de src/commands/
export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// Extension du typage du Client discord.js pour supporter `client.commands`
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}