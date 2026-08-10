import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Collection,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

// Contrat que doit respecter chaque fichier de src/commands/
export interface Command {
  // SlashCommandBuilder seul ne suffit plus dès qu'une commande a des options
  // (ex. addStringOption) : discord.js retourne alors un type plus étroit
  // (SlashCommandOptionsOnlyBuilder) qui n'inclut plus les méthodes de sous-commandes.
  // Les trois variantes exposent toutes .name et .toJSON(), seuls membres utilisés
  // en dehors des fichiers de commandes (index.ts, deploy-commands.ts).
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  // Optionnel : uniquement pour les commandes ayant une option avec setAutocomplete(true)
  // (ex. /carte, Milestone 5). Les commandes existantes n'ont rien à changer.
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

// Extension du typage du Client discord.js pour supporter `client.commands`
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}