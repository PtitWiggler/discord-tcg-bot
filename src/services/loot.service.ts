import type { CardTemplate, Rarity } from '@prisma/client';

/**
 * Service de tirage pour /loot (section 7, étapes 2-3 du document d'architecture).
 *
 * Service pur : reçoit les raretés et templates déjà chargés depuis Prisma par
 * l'appelant, ne fait aucune requête DB lui-même (même principe que ImageService).
 */

export interface LootResult {
  rarity: Rarity;
  template: CardTemplate;
}

/** Tirage pondéré générique : probabilité de sélection proportionnelle à `getWeight(item)`. */
function pickWeighted<T>(items: T[], getWeight: (item: T) => number): T {
  const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);
  let roll = Math.random() * totalWeight;

  for (const item of items) {
    roll -= getWeight(item);
    if (roll < 0) return item;
  }

  // Filet de sécurité (imprécision flottante en toute fin de tirage) : ne devrait
  // jamais être atteint en pratique.
  return items[items.length - 1];
}

function pickUniform<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Tire un loot : une rareté pondérée par `dropWeight`, puis un template au hasard
 * parmi tous les templates actifs — deux tirages indépendants (section 7).
 */
export function rollLoot(rarities: Rarity[], templates: CardTemplate[]): LootResult {
  if (rarities.length === 0) {
    throw new Error(
      'Aucune rareté disponible pour le tirage (content/rarities.json vide ou non seedé).',
    );
  }
  if (templates.length === 0) {
    throw new Error(
      'Aucun template de carte disponible pour le tirage (content/cards.json vide ou non seedé).',
    );
  }

  const rarity = pickWeighted(rarities, (r) => r.dropWeight);
  const template = pickUniform(templates);

  return { rarity, template };
}
