import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';

const ping: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Vérifie que le bot répond correctement.'),

  execute: async (interaction) => {
    const sentAt = Date.now();
    await interaction.reply('🏓 Pong...');
    const roundTripLatency = Date.now() - sentAt;
    const wsPing = interaction.client.ws.ping;
    const wsLabel = wsPing === -1 ? 'calcul en cours...' : `${wsPing}ms`;

    await interaction.editReply(
      `🏓 Pong ! Latence : ${roundTripLatency}ms | WebSocket : ${wsLabel}`,
    );
  },
};

export default ping;