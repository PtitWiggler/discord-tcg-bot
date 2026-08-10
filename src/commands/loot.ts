import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  type ColorResolvable,
} from 'discord.js';
import type { Command } from '../types.js';
import { prisma } from '../db/client.js';
import { getLastParisMidnight, getNextResetAt } from '../services/cooldown.service.js';
import { rollLoot } from '../services/loot.service.js';
import { generateCardImage } from '../services/image.service.js';
import { isFullart } from '../services/rarity-content.service.js';

type LootOutcome =
  | { onCooldown: true }
  | {
      onCooldown: false;
      rarityName: string;
      colorHex: string;
      cardName: string;
      flavorText: string | null;
      imageFile: string;
      quantity: number;
    };

const loot: Command = {
  data: new SlashCommandBuilder()
    .setName('loot')
    .setDescription('Tire une carte aléatoire (une fois par jour).'),

  execute: async (interaction) => {
    const discordId = interaction.user.id;
    const now = new Date();
    const lastMidnight = getLastParisMidnight(now);

    // Contenu de référence pour le tirage — lu hors transaction (lecture seule).
    const [rarities, templates] = await Promise.all([
      prisma.rarity.findMany(),
      prisma.cardTemplate.findMany(),
    ]);

    if (rarities.length === 0 || templates.length === 0) {
      await interaction.reply({
        content:
          "❌ Aucune carte ou rareté n'est configurée pour le moment. Contacte un administrateur.",
        ephemeral: true,
      });
      return;
    }

    // Cooldown (vérification + écriture) et attribution de la carte regroupés dans une
    // transaction unique : ferme la race condition d'un double clic rapide sur /loot
    // (deux exécutions concurrentes ne peuvent pas toutes les deux "gagner" le cooldown).
    const outcome: LootOutcome = await prisma.$transaction(async (tx) => {
      await tx.player.upsert({ where: { discordId }, update: {}, create: { discordId } });

      const claim = await tx.player.updateMany({
        where: { discordId, OR: [{ lastLootAt: null }, { lastLootAt: { lt: lastMidnight } }] },
        data: { lastLootAt: now },
      });

      if (claim.count === 0) {
        return { onCooldown: true };
      }

      const { rarity, template } = rollLoot(rarities, templates);

      const variant = await tx.cardVariant.findUniqueOrThrow({
        where: { cardTemplateId_rarityId: { cardTemplateId: template.id, rarityId: rarity.id } },
      });

      const playerCard = await tx.playerCard.upsert({
        where: { playerId_cardVariantId: { playerId: discordId, cardVariantId: variant.id } },
        update: { quantity: { increment: 1 } },
        create: { playerId: discordId, cardVariantId: variant.id },
      });

      return {
        onCooldown: false,
        rarityName: rarity.name,
        colorHex: rarity.colorHex,
        cardName: template.name,
        flavorText: template.flavorText,
        imageFile: variant.imageFile,
        quantity: playerCard.quantity,
      };
    });

    if (outcome.onCooldown) {
      const resetTimestamp = Math.floor(getNextResetAt(now).getTime() / 1000);
      await interaction.reply({
        content: `⏳ Tu as déjà loot aujourd'hui ! Reviens <t:${resetTimestamp}:R> (<t:${resetTimestamp}:t>).`,
        ephemeral: true,
      });
      return;
    }

    // Génération d'image potentiellement > 3s (canvas + police, surtout au premier appel
    // du process) : on défère la réponse pour éviter le timeout d'ack Discord.
    await interaction.deferReply();

    const imageBuffer = await generateCardImage({
      cardName: outcome.cardName,
      rarityName: outcome.rarityName,
      colorHex: outcome.colorHex,
      imageFile: outcome.imageFile,
      fullart: isFullart(outcome.rarityName),
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'card.png' });
    const embed = new EmbedBuilder()
      .setColor(outcome.colorHex as ColorResolvable)
      .setTitle(outcome.cardName)
      .setDescription(outcome.flavorText)
      .setImage('attachment://card.png')
      .setFooter({
        text:
          outcome.quantity > 1
            ? `Rareté : ${outcome.rarityName} · Doublon (x${outcome.quantity})`
            : `Rareté : ${outcome.rarityName} · Nouvelle carte !`,
      });

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  },
};

export default loot;