/**
 * Script de vérification manuelle — Milestone 2.
 * Génère une image de carte par rareté (à partir de content/rarities.json)
 * dans preview-output/, pour validation visuelle avant de considérer le
 * milestone terminé. Ne fait pas partie du bot lui-même.
 *
 * Usage : npx tsx scripts/preview-cards.ts
 * Peut être supprimé une fois la vérification faite (ou gardé comme utilitaire de dev).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateCardImage } from '../services/image.service.js';

interface RarityConfig {
  name: string;
  colorHex: string;
  /** Optionnel : ajoute ce champ à content/rarities.json pour tester le fullart. */
  fullart?: boolean;
}

const rarities: RarityConfig[] = JSON.parse(readFileSync(join(process.cwd(), 'content', 'rarities.json'), 'utf-8'));

const outDir = join(process.cwd(), 'preview-output');
mkdirSync(outDir, { recursive: true });

for (const rarity of rarities) {
  const buffer = await generateCardImage({
    cardName: 'Dragon Rouge',
    rarityName: rarity.name,
    colorHex: rarity.colorHex,
    imageFile: 'dragon-rouge.png', // n'existe pas encore -> vérifie aussi le fallback placeholder
    fullart: rarity.fullart ?? false,
  });
  const filename = `${rarity.name.toLowerCase().replace(/\s+/g, '-')}.png`;
  writeFileSync(join(outDir, filename), buffer);
  console.log(`✓ preview-output/${filename}`);
}

console.log(`\n${rarities.length} images générées dans preview-output/.`);
