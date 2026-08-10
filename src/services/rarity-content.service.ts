import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le flag `fullart` vit uniquement dans content/rarities.json (jamais en DB, décision
 * Milestone 2 pour éviter une migration Prisma). Lu une fois et mis en cache pour le
 * process — même pattern que ensureFontsRegistered() dans image.service.ts.
 *
 * Extrait de loot.ts (Milestone 3) où cette lecture était dupliquée localement ; /carte
 * (Milestone 5) a le même besoin, d'où la mutualisation ici — anticipée dans le journal
 * du Milestone 3.
 */
interface RarityContentConfig {
  name: string;
  fullart?: boolean;
}

let fullartByRarityName: Map<string, boolean> | null = null;

export function isFullart(rarityName: string): boolean {
  if (!fullartByRarityName) {
    const raw = readFileSync(join(process.cwd(), 'content', 'rarities.json'), 'utf-8');
    const configs: RarityContentConfig[] = JSON.parse(raw);
    fullartByRarityName = new Map(configs.map((c) => [c.name, c.fullart ?? false]));
  }
  return fullartByRarityName.get(rarityName) ?? false;
}