import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(__dirname, '..', 'content');

interface RarityConfig {
  name: string;
  sortOrder: number;
  colorHex: string;
  dropWeight: number;
}

interface CardTemplateConfig {
  name: string;
  slug: string;
  flavorText?: string;
}

function readJson<T>(fileName: string): T {
  const filePath = path.join(contentDir, fileName);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

async function main(): Promise<void> {
  const rarities = readJson<RarityConfig[]>('rarities.json');
  const cardTemplates = readJson<CardTemplateConfig[]>('cards.json');

  console.log(`Seed: ${rarities.length} raretés, ${cardTemplates.length} cartes trouvées dans content/`);

  // 1. Upsert des raretés
  const rarityRecords = await Promise.all(
    rarities.map((rarity) =>
      prisma.rarity.upsert({
        where: { name: rarity.name },
        update: {
          sortOrder: rarity.sortOrder,
          colorHex: rarity.colorHex,
          dropWeight: rarity.dropWeight,
        },
        create: rarity,
      }),
    ),
  );

  // 2. Upsert des templates de carte
  const templateRecords = await Promise.all(
    cardTemplates.map((template) =>
      prisma.cardTemplate.upsert({
        where: { slug: template.slug },
        update: {
          name: template.name,
          flavorText: template.flavorText,
        },
        create: template,
      }),
    ),
  );

  // 3. Génération de toutes les variantes (produit cartésien template x rareté)
  let variantCount = 0;
  for (const template of templateRecords) {
    for (const rarity of rarityRecords) {
      await prisma.cardVariant.upsert({
        where: {
          cardTemplateId_rarityId: {
            cardTemplateId: template.id,
            rarityId: rarity.id,
          },
        },
        update: {
          imageFile: `${template.slug}.png`,
        },
        create: {
          cardTemplateId: template.id,
          rarityId: rarity.id,
          imageFile: `${template.slug}.png`,
        },
      });
      variantCount++;
    }
  }

  console.log(
    `Seed terminé : ${rarityRecords.length} raretés, ${templateRecords.length} templates, ${variantCount} variantes.`,
  );
}

main()
  .catch((error) => {
    console.error('Erreur pendant le seed :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });