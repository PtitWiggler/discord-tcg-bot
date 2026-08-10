/**
 * Script de vérification manuelle — Milestone 5.
 * Teste la logique pure de buildAutocompleteChoices() (tri, filtrage insensible à la
 * casse/aux accents, troncature à 25 suggestions, variantes multiples d'une même
 * carte), sans toucher Prisma ni Discord.
 * Usage : npx tsx src/scripts/verify-carte-autocomplete.ts
 */
import {
  buildAutocompleteChoices,
  MAX_AUTOCOMPLETE_CHOICES,
  type OwnedCardSource,
} from '../services/card-lookup.service.js';

function makeSource(
  variantId: number,
  cardName: string,
  rarityName: string,
  raritySortOrder: number,
): OwnedCardSource {
  return {
    cardVariant: {
      id: variantId,
      cardTemplate: { name: cardName },
      rarity: { name: rarityName, sortOrder: raritySortOrder },
    },
  };
}

let allOk = true;
function check(label: string, condition: boolean) {
  console.log(`${condition ? '✓' : '✗'} ${label}`);
  allOk &&= condition;
}

// --- 1. Collection vide ---
console.log('=== Collection vide ===');
check('Aucune suggestion si le joueur ne possède rien', buildAutocompleteChoices([], '').length === 0);

// --- 2. Même carte possédée en plusieurs raretés -> une suggestion par variante ---
console.log('\n=== Même carte, plusieurs raretés ===');
const multiRarity = [
  makeSource(10, 'Dragon Rouge', 'Épique', 4),
  makeSource(11, 'Dragon Rouge', 'Rare', 2),
  makeSource(12, 'Golem de Pierre', 'Normale', 1),
];
const multiChoices = buildAutocompleteChoices(multiRarity, '');
check('3 suggestions distinctes (une par variante)', multiChoices.length === 3);
check(
  'Les deux variantes de Dragon Rouge sont bien distinguées par la rareté',
  multiChoices.some((c) => c.name === 'Dragon Rouge (Rare)') &&
    multiChoices.some((c) => c.name === 'Dragon Rouge (Épique)'),
);
check(
  'Tri par rareté croissante : Golem (Normale) avant Dragon Rouge (Rare) avant Dragon Rouge (Épique)',
  multiChoices.map((c) => c.name).join('|') ===
    'Golem de Pierre (Normale)|Dragon Rouge (Rare)|Dragon Rouge (Épique)',
);
check(
  "value = id de la variante (string), pas le nom de la carte",
  multiChoices.find((c) => c.name === 'Dragon Rouge (Rare)')?.value === '11',
);

// --- 3. Filtrage texte, insensible à la casse et aux accents ---
console.log('\n=== Filtrage insensible casse/accents ===');
const searchable = [
  makeSource(20, 'Phénix Céleste', 'Épique', 4),
  makeSource(21, 'Loup des Brumes', 'Normale', 1),
];
check(
  '"epiq" (sans accent, minuscule) trouve "Phénix Céleste (Épique)"',
  buildAutocompleteChoices(searchable, 'epiq').length === 1 &&
    buildAutocompleteChoices(searchable, 'epiq')[0]?.name === 'Phénix Céleste (Épique)',
);
check(
  '"phenix" (sans accent) trouve la carte malgré le é',
  buildAutocompleteChoices(searchable, 'phenix').length === 1,
);
check(
  'Requête ne correspondant à rien -> liste vide',
  buildAutocompleteChoices(searchable, 'xyzzy').length === 0,
);
check(
  'Requête vide -> toutes les entrées possédées',
  buildAutocompleteChoices(searchable, '').length === 2,
);

// --- 4. Troncature à MAX_AUTOCOMPLETE_CHOICES (limite imposée par l'API Discord) ---
console.log(`\n=== Troncature à ${MAX_AUTOCOMPLETE_CHOICES} suggestions ===`);
const manySources: OwnedCardSource[] = Array.from({ length: 40 }, (_, i) =>
  makeSource(100 + i, `Carte ${String(i).padStart(2, '0')}`, 'Normale', 1),
);
const truncated = buildAutocompleteChoices(manySources, '');
check(`Résultat tronqué à ${MAX_AUTOCOMPLETE_CHOICES} malgré 40 variantes possédées`, truncated.length === MAX_AUTOCOMPLETE_CHOICES);
check(
  'Les 25 premières après tri (ordre alpha ici, même rareté) sont conservées',
  truncated[0]?.name === 'Carte 00 (Normale)' && truncated[24]?.name === 'Carte 24 (Normale)',
);

console.log(
  `\n${allOk ? '✅ Toutes les vérifications passent.' : '❌ Certaines vérifications échouent.'}`,
);
process.exitCode = allOk ? 0 : 1;