/**
 * Script de vérification manuelle — Milestone 3.
 * Teste la logique pure de rollLoot() et du cooldown, sans toucher Prisma
 * (utile en sandbox où `prisma generate` est bloqué). Peut être supprimé
 * une fois la vérification faite, ou gardé comme utilitaire de dev.
 *
 * Usage : npx tsx src/scripts/verify-loot-logic.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rollLoot } from '../services/loot.service.js';
import {
  getLastParisMidnight,
  getNextResetAt,
  isOnCooldown,
} from '../services/cooldown.service.js';

// --- 1. Tirage pondéré : vérifie que les fréquences observées collent à content/rarities.json ---

interface RarityConfig {
  name: string;
  sortOrder: number;
  colorHex: string;
  dropWeight: number;
}
interface CardConfig {
  name: string;
  slug: string;
  flavorText?: string;
}

const rarities: RarityConfig[] = JSON.parse(
  readFileSync(join(process.cwd(), 'content', 'rarities.json'), 'utf-8'),
);
const cards: CardConfig[] = JSON.parse(
  readFileSync(join(process.cwd(), 'content', 'cards.json'), 'utf-8'),
);

// Mock des types Prisma (id ajouté, pas besoin du reste des champs pour rollLoot)
const mockRarities = rarities.map((r, i) => ({ id: i + 1, ...r }));
const mockTemplates = cards.map((c, i) => ({ id: i + 1, ...c, flavorText: c.flavorText ?? null }));

const ITERATIONS = 100_000;
const rarityCounts = new Map<string, number>();
const templateCounts = new Map<string, number>();

for (let i = 0; i < ITERATIONS; i++) {
  const { rarity, template } = rollLoot(mockRarities as never, mockTemplates as never);
  rarityCounts.set(rarity.name, (rarityCounts.get(rarity.name) ?? 0) + 1);
  templateCounts.set(template.name, (templateCounts.get(template.name) ?? 0) + 1);
}

const totalWeight = rarities.reduce((sum, r) => sum + r.dropWeight, 0);

console.log(`=== Tirage de rareté (${ITERATIONS} tirages) ===`);
let rarityOk = true;
for (const rarity of rarities) {
  const expectedRatio = rarity.dropWeight / totalWeight;
  const observedRatio = (rarityCounts.get(rarity.name) ?? 0) / ITERATIONS;
  const deviation = Math.abs(observedRatio - expectedRatio);
  const ok = deviation < 0.01; // tolérance 1 point de %
  rarityOk &&= ok;
  console.log(
    `${ok ? '✓' : '✗'} ${rarity.name.padEnd(12)} attendu ${(expectedRatio * 100).toFixed(2)}% | observé ${(observedRatio * 100).toFixed(2)}%`,
  );
}

console.log(`\n=== Tirage de template (${ITERATIONS} tirages, doit être ~uniforme) ===`);
const expectedTemplateRatio = 1 / cards.length;
let templateOk = true;
for (const card of cards) {
  const observedRatio = (templateCounts.get(card.name) ?? 0) / ITERATIONS;
  const ok = Math.abs(observedRatio - expectedTemplateRatio) < 0.01;
  templateOk &&= ok;
  console.log(
    `${ok ? '✓' : '✗'} ${card.name.padEnd(20)} attendu ${(expectedTemplateRatio * 100).toFixed(2)}% | observé ${(observedRatio * 100).toFixed(2)}%`,
  );
}

// --- 2. Cooldown : vérifie le calcul du minuit Paris en hiver (CET, UTC+1) et été (CEST, UTC+2) ---

console.log('\n=== Cooldown : minuit Paris ===');

// 15 janvier 2026 10:00 UTC -> hiver, Paris = UTC+1 -> minuit Paris = 2026-01-14T23:00:00Z
const winterRef = new Date('2026-01-15T10:00:00Z');
const winterMidnight = getLastParisMidnight(winterRef);
const winterOk = winterMidnight.toISOString() === '2026-01-14T23:00:00.000Z';
console.log(
  `${winterOk ? '✓' : '✗'} Hiver (CET) : ${winterRef.toISOString()} -> minuit Paris = ${winterMidnight.toISOString()}`,
);

// 15 juillet 2026 10:00 UTC -> été, Paris = UTC+2 -> minuit Paris = 2026-07-14T22:00:00Z
const summerRef = new Date('2026-07-15T10:00:00Z');
const summerMidnight = getLastParisMidnight(summerRef);
const summerOk = summerMidnight.toISOString() === '2026-07-14T22:00:00.000Z';
console.log(
  `${summerOk ? '✓' : '✗'} Été (CEST)  : ${summerRef.toISOString()} -> minuit Paris = ${summerMidnight.toISOString()}`,
);

// nextResetAt = minuit Paris + 24h
const nextReset = getNextResetAt(winterRef);
const nextResetOk = nextReset.toISOString() === '2026-01-15T23:00:00.000Z';
console.log(
  `${nextResetOk ? '✓' : '✗'} Prochain reset après ${winterRef.toISOString()} -> ${nextReset.toISOString()}`,
);

// isOnCooldown : looté juste après minuit Paris -> en cooldown ; looté avant -> pas en cooldown
const lootedJustAfterMidnight = new Date('2026-01-14T23:30:00Z');
const lootedBeforeMidnight = new Date('2026-01-14T20:00:00Z');
const cooldownActiveOk = isOnCooldown(lootedJustAfterMidnight, winterRef) === true;
const cooldownExpiredOk = isOnCooldown(lootedBeforeMidnight, winterRef) === false;
const neverLootedOk = isOnCooldown(null, winterRef) === false;

console.log(`${cooldownActiveOk ? '✓' : '✗'} Looté après minuit Paris -> en cooldown`);
console.log(`${cooldownExpiredOk ? '✓' : '✗'} Looté avant minuit Paris -> cooldown expiré`);
console.log(`${neverLootedOk ? '✓' : '✗'} Jamais looté (null) -> pas en cooldown`);

const allOk =
  rarityOk &&
  templateOk &&
  winterOk &&
  summerOk &&
  nextResetOk &&
  cooldownActiveOk &&
  cooldownExpiredOk &&
  neverLootedOk;

console.log(
  `\n${allOk ? '✅ Toutes les vérifications passent.' : '❌ Certaines vérifications échouent.'}`,
);
process.exitCode = allOk ? 0 : 1;
