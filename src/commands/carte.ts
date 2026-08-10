import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  type ColorResolvable,
} from 'discord.js';
import type { Command } from '../types.js';
import { prisma } from '../db/client.js';
import { generateCardImage } from '../services/image.service.js';
import { isFullart } from '../services/rarity-content.service.js';
import { buildAutocompleteChoices, type OwnedCardSource } from '../services/card-lookup.service.js';

const carte: Command = {
  data: new SlashCommandBuilder()
    .setName('carte')
    .setDescription('Affiche en détail une carte de ta collection.')
    .addStringOption((option) =>
      option
        .setName('nom')
        .setDescription('Nom de la carte à afficher')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  autocomplete: async (interaction) => {
    const discordId = interaction.user.id;
    const focusedValue = interaction.options.getFocused();

    const playerCards = (await prisma.playerCard.findMany({
      where: { playerId: discordId },
      include: { cardVariant: { include: { cardTemplate: true, rarity: true } } },
    })) as OwnedCardSource[];

    await interaction.respond(buildAutocompleteChoices(playerCards, focusedValue));
  },

  execute: async (interaction) => {
    const discordId = interaction.user.id;
    const rawValue = interaction.options.getString('nom', true);
    const variantId = Number(rawValue);

    // L'autocomplete n'empêche pas Discord d'envoyer un texte libre non sélectionné
    // dans la liste (comportement connu de l'API) : on valide donc systématiquement
    // que la valeur reçue correspond bien à une variante réellement possédée.
    const notFoundMessage = {
      content:
        '❌ Carte introuvable dans ta collection. Retape le nom et choisis une suggestion dans la liste, ou utilise `/collection` pour voir ce que tu possèdes.',
      ephemeral: true,
    };

    if (!Number.isInteger(variantId)) {
      await interaction.reply(notFoundMessage);
      return;
    }

    const playerCard = await prisma.playerCard.findUnique({
      where: { playerId_cardVariantId: { playerId: discordId, cardVariantId: variantId } },
      include: { cardVariant: { include: { cardTemplate: true, rarity: true } } },
    });

    if (!playerCard) {
      await interaction.reply(notFoundMessage);
      return;
    }

    // Génération d'image potentiellement lente (canvas + police, surtout au premier
    // appel du process) : même pattern que /loot pour éviter le timeout d'ack Discord.
    await interaction.deferReply({ ephemeral: true });

    const { cardVariant, quantity } = playerCard;
    const { cardTemplate, rarity } = cardVariant;

    const imageBuffer = await generateCardImage({
      cardName: cardTemplate.name,
      rarityName: rarity.name,
      colorHex: rarity.colorHex,
      imageFile: cardVariant.imageFile,
      fullart: isFullart(rarity.name),
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'card.png' });
    const embed = new EmbedBuilder()
      .setColor(rarity.colorHex as ColorResolvable)
      .setTitle(cardTemplate.name)
      .setDescription(cardTemplate.flavorText)
      .setImage('attachment://card.png')
      .setFooter({
        text:
          quantity > 1
            ? `Rareté : ${rarity.name} · Possédée x${quantity}`
            : `Rareté : ${rarity.name}`,
      });

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  },
};

export default carte;