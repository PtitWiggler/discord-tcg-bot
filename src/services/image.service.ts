import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D, type Image } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Options nécessaires pour composer l'image d'une carte.
 * Le service ne dépend pas de Prisma : c'est à l'appelant (LootService, /carte, ...)
 * de résoudre le CardVariant et de lui passer les valeurs déjà résolues.
 */
export interface CardImageOptions {
  /** Nom du CardTemplate (ex. "Dragon Rouge") */
  cardName: string;
  /** Nom de la Rarity (ex. "Épique") */
  rarityName: string;
  /** Couleur hex de la Rarity (ex. "#F97316"), utilisée pour le cadre */
  colorHex: string;
  /** Nom de fichier de CardVariant.imageFile (ex. "dragon-rouge.png") */
  imageFile: string;
  /**
   * Layout fullart : l'illustration remplit toute la carte, texte superposé en bas
   * sur un dégradé, plutôt qu'un bandeau opaque séparé sous un bloc d'illustration.
   * C'est à l'appelant de décider (ex. un champ `fullart` sur la rareté dans
   * content/rarities.json) — ce service ne fait que rendre le layout demandé.
   */
  fullart: boolean;
}

// Hypothèse de résolution de chemin : le process est lancé depuis la racine du repo
// (cas de `tsx src/index.ts` en dev comme de `node dist/src/index.js` en prod via PM2,
// tant que le cwd du process reste la racine). Point à revalider au Milestone 6 en même
// temps que l'ajustement de structure dist/ déjà identifié au Milestone 1.
const ASSETS_DIR = join(process.cwd(), 'assets');
const CARDS_DIR = join(ASSETS_DIR, 'cards');
const PLACEHOLDER_PATH = join(CARDS_DIR, 'placeholder.png');

const CARD_WIDTH = 600;
const CARD_HEIGHT = 840;
const CORNER_RADIUS = 26;
const OUTER_FRAME_WIDTH = 14;
const MARGIN = 24;
const ILLUSTRATION_HEIGHT = 560;

let fontsRegistered = false;

/**
 * Enregistre les polices embarquées (assets/fonts/) une seule fois par process.
 * Polices bundlées (DejaVu Sans, licence Bitstream Vera) plutôt que des polices système :
 * garantit un rendu identique en dev (Windows) et en prod (VPS Linux).
 */
function ensureFontsRegistered(): void {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(join(ASSETS_DIR, 'fonts', 'DejaVuSans-Bold.ttf'), 'TCG Card Sans Bold');
  GlobalFonts.registerFromPath(join(ASSETS_DIR, 'fonts', 'DejaVuSans.ttf'), 'TCG Card Sans');
  fontsRegistered = true;
}

/**
 * Compose l'image finale d'une carte : illustration (ou placeholder) + cadre coloré
 * selon la rareté + nom de la carte + nom de la rareté.
 * Retourne un buffer PNG, prêt à être attaché à un embed Discord.
 */
export async function generateCardImage(options: CardImageOptions): Promise<Buffer> {
  ensureFontsRegistered();

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  const illustration = await loadImage(resolveImagePath(options.imageFile));

  drawCardBackground(ctx);

  if (options.fullart) {
    drawFullartLayout(ctx, illustration, options);
  } else {
    drawStandardLayout(ctx, illustration, options);
  }

  drawOuterFrame(ctx, options.colorHex);

  return canvas.toBuffer('image/png');
}

function drawCardBackground(ctx: SKRSContext2D): void {
  ctx.fillStyle = '#111114';
  roundRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS);
  ctx.fill();
}

/** Layout standard : illustration en bloc haut, bandeau opaque séparé en bas. */
function drawStandardLayout(ctx: SKRSContext2D, illustration: Image, options: CardImageOptions): void {
  const illustrationArea = { x: MARGIN, y: MARGIN, w: CARD_WIDTH - MARGIN * 2, h: ILLUSTRATION_HEIGHT };

  ctx.save();
  roundRectPath(ctx, illustrationArea.x, illustrationArea.y, illustrationArea.w, illustrationArea.h, CORNER_RADIUS - 8);
  ctx.clip();
  drawImageCover(ctx, illustration, illustrationArea);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = options.colorHex;
  ctx.lineWidth = 5;
  roundRectPath(
    ctx,
    illustrationArea.x + 2.5,
    illustrationArea.y + 2.5,
    illustrationArea.w - 5,
    illustrationArea.h - 5,
    CORNER_RADIUS - 8,
  );
  ctx.stroke();
  ctx.restore();

  const bannerY = illustrationArea.y + illustrationArea.h + 18;
  const bannerArea = { x: MARGIN, y: bannerY, w: illustrationArea.w, h: CARD_HEIGHT - bannerY - MARGIN };

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRectPath(ctx, bannerArea.x, bannerArea.y, bannerArea.w, bannerArea.h, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, bannerArea.x, bannerArea.y, bannerArea.w, bannerArea.h, 16);
  ctx.stroke();
  ctx.restore();

  drawNameAndRarity(ctx, bannerArea, options, '#f5f5f7');
}

/** Layout fullart : illustration sur toute la carte, texte superposé sur un dégradé bas. */
function drawFullartLayout(ctx: SKRSContext2D, illustration: Image, options: CardImageOptions): void {
  const fullArea = {
    x: OUTER_FRAME_WIDTH,
    y: OUTER_FRAME_WIDTH,
    w: CARD_WIDTH - OUTER_FRAME_WIDTH * 2,
    h: CARD_HEIGHT - OUTER_FRAME_WIDTH * 2,
  };

  ctx.save();
  roundRectPath(ctx, fullArea.x, fullArea.y, fullArea.w, fullArea.h, CORNER_RADIUS - 6);
  ctx.clip();
  drawImageCover(ctx, illustration, fullArea);

  // Dégradé sombre en bas pour garder le texte lisible sur n'importe quelle illustration
  const scrimHeight = fullArea.h * 0.32;
  const scrimY = fullArea.y + fullArea.h - scrimHeight;
  const scrim = ctx.createLinearGradient(0, scrimY, 0, fullArea.y + fullArea.h);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = scrim;
  ctx.fillRect(fullArea.x, scrimY, fullArea.w, scrimHeight);
  ctx.restore();

  const textArea = { x: fullArea.x, y: fullArea.y + fullArea.h - scrimHeight, w: fullArea.w, h: scrimHeight };
  drawNameAndRarity(ctx, textArea, options, '#ffffff');
}

/** Nom de la carte + séparateur + nom de la rareté, centrés dans la zone donnée. */
function drawNameAndRarity(
  ctx: SKRSContext2D,
  area: { x: number; y: number; w: number; h: number },
  options: CardImageOptions,
  nameColor: string,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerX = area.x + area.w / 2;

  ctx.fillStyle = nameColor;
  ctx.font = '40px "TCG Card Sans Bold"';
  ctx.fillText(fitText(ctx, options.cardName, area.w - 50), centerX, area.y + area.h * 0.4);

  ctx.strokeStyle = options.colorHex;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 40, area.y + area.h * 0.58);
  ctx.lineTo(centerX + 40, area.y + area.h * 0.58);
  ctx.stroke();

  ctx.fillStyle = options.colorHex;
  ctx.font = '26px "TCG Card Sans Bold"';
  ctx.fillText(options.rarityName.toUpperCase(), centerX, area.y + area.h * 0.78);
}

function drawOuterFrame(ctx: SKRSContext2D, colorHex: string): void {
  ctx.save();
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = OUTER_FRAME_WIDTH;
  roundRectPath(
    ctx,
    OUTER_FRAME_WIDTH / 2,
    OUTER_FRAME_WIDTH / 2,
    CARD_WIDTH - OUTER_FRAME_WIDTH,
    CARD_HEIGHT - OUTER_FRAME_WIDTH,
    CORNER_RADIUS,
  );
  ctx.stroke();
  ctx.restore();
}

/** Résout imageFile vers assets/cards/, avec repli sur le placeholder générique si absent. */
function resolveImagePath(imageFile: string): string {
  const candidate = join(CARDS_DIR, imageFile);
  return existsSync(candidate) ? candidate : PLACEHOLDER_PATH;
}

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dessine l'image en mode "cover" (remplit la zone, recadrée au centre, sans déformation). */
function drawImageCover(
  ctx: SKRSContext2D,
  image: Image,
  area: { x: number; y: number; w: number; h: number },
): void {
  const scale = Math.max(area.w / image.width, area.h / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawX = area.x + (area.w - drawW) / 2;
  const drawY = area.y + (area.h - drawH) / 2;
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
}

/** Tronque le texte avec "…" s'il dépasse maxWidth, pour éviter le débordement du bandeau. */
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}
