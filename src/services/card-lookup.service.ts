/**
 * Service de recherche pour l'autocomplete de /carte (section 8 du document
 * d'architecture, Milestone 5).
 *
 * Service pur : reçoit les PlayerCard déjà chargés depuis Prisma par l'appelant
 * (avec cardVariant.cardTemplate et cardVariant.rarity inclus), ne fait aucune
 * requête DB lui-même — même principe et même forme de type d'entrée minimal
 * que collection.service.ts (CollectionSourceCard).
 *
 * Un joueur peut posséder plusieurs raretés d'une même carte (ex. "Dragon Rouge"
 * en Rare et en Épique) : chaque variante possédée est donc une suggestion
 * distincte ("Dragon Rouge (Rare)", "Dragon Rouge (Épique)"), pour que le joueur
 * choisisse précisément laquelle afficher (décision explicite de Thomas).
 */

export interface OwnedCardSource {
  cardVariant: {
    id: number;
    cardTemplate: { name: string };
    rarity: { name: string; sortOrder: number };
  };
}

interface AutocompleteEntry {
  variantId: number;
  cardName: string;
  rarityName: string;
  raritySortOrder: number;
}

export interface AutocompleteChoice {
  name: string;
  value: string;
}

/** Limite imposée par l'API Discord sur le nombre de suggestions d'autocomplete. */
export const MAX_AUTOCOMPLETE_CHOICES = 25;

function toEntries(cards: OwnedCardSource[]): AutocompleteEntry[] {
  return cards.map((c) => ({
    variantId: c.cardVariant.id,
    cardName: c.cardVariant.cardTemplate.name,
    rarityName: c.cardVariant.rarity.name,
    raritySortOrder: c.cardVariant.rarity.sortOrder,
  }));
}

/** Insensible à la casse et aux accents, pour que "epiq" trouve "Épique". */
function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatLabel(entry: AutocompleteEntry): string {
  return `${entry.cardName} (${entry.rarityName})`;
}

/** Même tri que /collection : rareté croissante, puis alphabétique au sein d'un groupe. */
function sortEntries(entries: AutocompleteEntry[]): AutocompleteEntry[] {
  return [...entries].sort((a, b) => {
    if (a.raritySortOrder !== b.raritySortOrder) return a.raritySortOrder - b.raritySortOrder;
    return a.cardName.localeCompare(b.cardName, 'fr');
  });
}

/**
 * Construit la liste de suggestions Discord à partir des variantes possédées et du
 * texte actuellement tapé par le joueur (`query`, éventuellement vide au premier
 * affichage). Résultat trié, filtré, puis tronqué à MAX_AUTOCOMPLETE_CHOICES.
 */
export function buildAutocompleteChoices(
  cards: OwnedCardSource[],
  query: string,
): AutocompleteChoice[] {
  const sorted = sortEntries(toEntries(cards));
  const normalizedQuery = normalizeForSearch(query);

  const filtered = normalizedQuery
    ? sorted.filter((entry) => normalizeForSearch(formatLabel(entry)).includes(normalizedQuery))
    : sorted;

  return filtered.slice(0, MAX_AUTOCOMPLETE_CHOICES).map((entry) => ({
    name: formatLabel(entry),
    value: String(entry.variantId),
  }));
}