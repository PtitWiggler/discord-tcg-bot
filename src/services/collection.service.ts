/**
 * Service de regroupement/pagination pour /collection (section 8 du document
 * d'architecture).
 *
 * Service pur : reçoit les PlayerCard déjà chargés depuis Prisma par l'appelant
 * (avec cardVariant.cardTemplate et cardVariant.rarity inclus), ne fait aucune
 * requête DB lui-même (même principe que loot.service.ts et cooldown.service.ts).
 *
 * Le type d'entrée est volontairement minimal (pas les types Prisma complets) :
 * il ne dépend que des champs réellement utilisés, ce qui simplifie les tests
 * avec des mocks (même approche que verify-loot-logic.ts au Milestone 3).
 */

export interface CollectionSourceCard {
  quantity: number;
  cardVariant: {
    cardTemplate: { name: string };
    rarity: { name: string; sortOrder: number };
  };
}

interface CollectionEntry {
  cardName: string;
  quantity: number;
  rarityName: string;
  raritySortOrder: number;
}

/** Nombre de cartes affichées par page (les lignes d'en-tête de rareté ne comptent pas dans ce budget). */
export const ENTRIES_PER_PAGE = 10;

function toEntries(cards: CollectionSourceCard[]): CollectionEntry[] {
  return cards.map((c) => ({
    cardName: c.cardVariant.cardTemplate.name,
    quantity: c.quantity,
    rarityName: c.cardVariant.rarity.name,
    raritySortOrder: c.cardVariant.rarity.sortOrder,
  }));
}

/**
 * Tri par rareté croissante (Normale -> Légendaire, ordre "classique" — choix de
 * Thomas, section 13), puis alphabétique au sein d'une même rareté.
 */
function sortEntries(entries: CollectionEntry[]): CollectionEntry[] {
  return [...entries].sort((a, b) => {
    if (a.raritySortOrder !== b.raritySortOrder) return a.raritySortOrder - b.raritySortOrder;
    return a.cardName.localeCompare(b.cardName, 'fr');
  });
}

/**
 * Découpe la collection triée en pages de ENTRIES_PER_PAGE cartes maximum, avec
 * un en-tête gras par groupe de rareté. Si un groupe est interrompu par un saut
 * de page, l'en-tête est répété en haut de la page suivante avec "(suite)".
 *
 * Retourne un tableau vide si `cards` est vide (collection vide) — à gérer côté
 * appelant (message dédié plutôt qu'un embed avec 0 page).
 */
export function buildCollectionPages(cards: CollectionSourceCard[]): string[] {
  const entries = sortEntries(toEntries(cards));

  const pages: string[] = [];
  let currentLines: string[] = [];
  let entriesOnCurrentPage = 0;
  let rarityOnCurrentPage: string | null = null;
  let lastRaritySeen: string | null = null;

  const flushPage = () => {
    if (currentLines.length > 0) pages.push(currentLines.join('\n'));
    currentLines = [];
    entriesOnCurrentPage = 0;
    rarityOnCurrentPage = null;
  };

  for (const entry of entries) {
    if (entriesOnCurrentPage >= ENTRIES_PER_PAGE) {
      flushPage();
    }

    if (entry.rarityName !== rarityOnCurrentPage) {
      const isContinuation = entry.rarityName === lastRaritySeen;
      currentLines.push(`**${entry.rarityName}**${isContinuation ? ' _(suite)_' : ''}`);
      rarityOnCurrentPage = entry.rarityName;
    }

    const suffix = entry.quantity > 1 ? ` (x${entry.quantity})` : '';
    currentLines.push(`• ${entry.cardName}${suffix}`);
    entriesOnCurrentPage++;
    lastRaritySeen = entry.rarityName;
  }

  flushPage();

  return pages;
}