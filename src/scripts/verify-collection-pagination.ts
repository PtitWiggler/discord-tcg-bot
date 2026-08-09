/**
 * Script de vérification manuelle — Milestone 4.
 * Teste la logique pure de buildCollectionPages() (tri, regroupement par rareté,
 * pagination, gestion du "(suite)" quand un groupe est coupé par un saut de page),
 * sans toucher Prisma. Usage : npx tsx src/scripts/verify-collection-pagination.ts
 */
import {
  buildCollectionPages,
  ENTRIES_PER_PAGE,
  type CollectionSourceCard,
} from '../services/collection.service.js';

function makeCard(
  cardName: string,
  rarityName: string,
  sortOrder: number,
  quantity = 1,
): CollectionSourceCard {
  return {
    quantity,
    cardVariant: {
      cardTemplate: { name: cardName },
      rarity: { name: rarityName, sortOrder },
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
check('Aucune page pour une collection vide', buildCollectionPages([]).length === 0);

// --- 2. Petite collection (1 page) : tri rareté croissante, puis alpha, doublons ---
console.log('\n=== Petite collection (1 page) ===');
const small = [
  makeCard('Sylphe des Vents', 'Légendaire', 5),
  makeCard('Dragon Rouge', 'Rare', 2, 3),
  makeCard('Golem de Pierre', 'Normale', 1),
  makeCard('Loup des Brumes', 'Normale', 1, 2),
];
const smallPages = buildCollectionPages(small);
console.log(smallPages[0]);

const smallLines = smallPages[0]?.split('\n') ?? [];
check('1 seule page générée', smallPages.length === 1);
check(
  'Ordre des groupes : Normale -> Rare -> Légendaire',
  smallLines.indexOf('**Normale**') < smallLines.indexOf('**Rare**') &&
    smallLines.indexOf('**Rare**') < smallLines.indexOf('**Légendaire**'),
);
check(
  'Tri alpha au sein de Normale (Golem avant Loup)',
  smallLines.indexOf('• Golem de Pierre') < smallLines.indexOf('• Loup des Brumes (x2)'),
);
check('Carte unique affichée sans suffixe', smallLines.includes('• Golem de Pierre'));
check('Doublon (x2) affiché', smallLines.includes('• Loup des Brumes (x2)'));
check('Doublon (x3) affiché', smallLines.includes('• Dragon Rouge (x3)'));

// --- 3. Grand groupe qui déborde sur 2 pages -> en-tête répété avec "(suite)" ---
console.log(
  `\n=== Groupe de rareté coupé par un saut de page (ENTRIES_PER_PAGE=${ENTRIES_PER_PAGE}) ===`,
);
const bigGroup: CollectionSourceCard[] = [];
for (let i = 0; i < ENTRIES_PER_PAGE + 3; i++) {
  bigGroup.push(makeCard(`Carte Normale ${String(i).padStart(2, '0')}`, 'Normale', 1));
}
const bigPages = buildCollectionPages(bigGroup);
console.log(`--- Page 1 ---\n${bigPages[0]}\n--- Page 2 ---\n${bigPages[1]}`);

check('2 pages générées', bigPages.length === 2);
check('En-tête "Normale" présent sur la page 1', bigPages[0]?.includes('**Normale**') ?? false);
check(
  'En-tête "Normale (suite)" présent sur la page 2',
  bigPages[1]?.includes('**Normale** _(suite)_') ?? false,
);
check(
  `Page 1 contient ${ENTRIES_PER_PAGE} cartes`,
  (bigPages[0]?.split('\n').filter((l) => l.startsWith('• ')).length ?? 0) === ENTRIES_PER_PAGE,
);
check(
  'Page 2 contient les 3 cartes restantes',
  (bigPages[1]?.split('\n').filter((l) => l.startsWith('• ')).length ?? 0) === 3,
);

// --- 4. Deux groupes distincts qui se terminent pile à la frontière d'une page ---
console.log('\n=== Frontière de page qui coïncide avec une frontière de groupe ===');
const boundary: CollectionSourceCard[] = [
  ...Array.from({ length: ENTRIES_PER_PAGE }, (_, i) =>
    makeCard(`Normale ${String(i).padStart(2, '0')}`, 'Normale', 1),
  ),
  makeCard('Dragon Rouge', 'Rare', 2),
];
const boundaryPages = buildCollectionPages(boundary);
check('2 pages générées', boundaryPages.length === 2);
check(
  'Pas de "(suite)" sur le nouveau groupe (Rare) en page 2',
  (boundaryPages[1]?.includes('**Rare**') ?? false) &&
    !(boundaryPages[1]?.includes('_(suite)_') ?? false),
);

console.log(
  `\n${allOk ? '✅ Toutes les vérifications passent.' : '❌ Certaines vérifications échouent.'}`,
);
process.exitCode = allOk ? 0 : 1;