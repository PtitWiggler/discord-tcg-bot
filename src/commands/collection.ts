import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../types.js';
import { prisma } from '../db/client.js';
import { buildCollectionPages, type CollectionSourceCard } from '../services/collection.service.js';

// Le collector de pagination reste actif un temps limité, puis les boutons sont
// désactivés (page figée). Le token d'interaction reste valide 15 min pour
// editReply() ; on choisit une durée plus courte, largement suffisante pour
// parcourir une collection sans laisser des boutons actifs indéfiniment.
const COLLECTOR_TIMEOUT_MS = 3 * 60 * 1000;

function buildEmbed(
  pageContent: string,
  pageIndex: number,
  totalPages: number,
  distinctCount: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📚 Ta collection')
    .setDescription(pageContent)
    .setColor(Colors.Blurple)
    .setFooter({
      text: `${distinctCount} carte(s) différente(s) · Page ${pageIndex + 1}/${totalPages}`,
    });
}

function buildButtons(
  pageIndex: number,
  totalPages: number,
  forceDisabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('collection_prev')
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(forceDisabled || pageIndex === 0),
    new ButtonBuilder()
      .setCustomId('collection_next')
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(forceDisabled || pageIndex === totalPages - 1),
  );
}

const collection: Command = {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('Affiche ta collection de cartes, groupée par rareté.'),

  execute: async (interaction) => {
    const discordId = interaction.user.id;

    const playerCards = (await prisma.playerCard.findMany({
      where: { playerId: discordId },
      include: { cardVariant: { include: { cardTemplate: true, rarity: true } } },
    })) as CollectionSourceCard[];

    if (playerCards.length === 0) {
      await interaction.reply({
        content:
          "📭 Ta collection est vide pour l'instant. Utilise `/loot` pour tirer ta première carte !",
        ephemeral: true,
      });
      return;
    }

    const pages = buildCollectionPages(playerCards);
    let pageIndex = 0;

    // `withResponse: true` : nécessaire pour récupérer le Message et y attacher un
    // collector sur une réponse éphémère (sans ça, le collector ne reçoit jamais les
    // clics — problème connu de discord.js sur les réponses éphémères non fetchées).
    const response = await interaction.reply({
      embeds: [buildEmbed(pages[pageIndex], pageIndex, pages.length, playerCards.length)],
      components: pages.length > 1 ? [buildButtons(pageIndex, pages.length)] : [],
      ephemeral: true,
      withResponse: true,
    });

    if (pages.length <= 1) return;

    const message = response.resource?.message;
    if (!message) {
      console.warn(
        '⚠️ Message de réponse introuvable, pagination /collection désactivée pour cette réponse.',
      );
      return;
    }

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COLLECTOR_TIMEOUT_MS,
      // Réponse éphémère : seul l'auteur peut de toute façon voir/cliquer ces boutons,
      // le filtre reste une garde défensive bon marché.
      filter: (buttonInteraction) => buttonInteraction.user.id === discordId,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.customId === 'collection_prev') {
        pageIndex = Math.max(0, pageIndex - 1);
      } else if (buttonInteraction.customId === 'collection_next') {
        pageIndex = Math.min(pages.length - 1, pageIndex + 1);
      }

      await buttonInteraction.update({
        embeds: [buildEmbed(pages[pageIndex], pageIndex, pages.length, playerCards.length)],
        components: [buildButtons(pageIndex, pages.length)],
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          components: [buildButtons(pageIndex, pages.length, true)],
        });
      } catch {
        // Message supprimé ou token expiré (>15 min) — sans impact, la pagination
        // avait de toute façon expiré côté utilisateur.
      }
    });
  },
};

export default collection;