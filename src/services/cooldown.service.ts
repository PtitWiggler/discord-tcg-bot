/**
 * Service de cooldown pour /loot — reset fixe à minuit, heure de Paris,
 * identique pour tous les joueurs (section 13 du document d'architecture).
 *
 * Service pur : ne dépend pas de Prisma, reçoit `lastLootAt` déjà résolu par
 * l'appelant (même principe que ImageService, cf. section "Architecture" du doc).
 * Ça le rend testable indépendamment (voir scripts/verify-cooldown.ts).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PARIS_TIMEZONE = 'Europe/Paris';

/**
 * Décalage (en ms) entre l'heure de Paris et UTC à l'instant donné.
 * Utilise Intl.DateTimeFormat plutôt qu'une lib de dates : gère automatiquement
 * l'alternance CET/CEST (heure d'hiver/été) sans dépendance supplémentaire.
 */
function getParisOffsetMs(reference: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(reference);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  // Certains environnements ICU représentent minuit pile par "24" plutôt que "00".
  const hour = get('hour') % 24;
  const parisWallClockAsUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );

  return parisWallClockAsUTC - reference.getTime();
}

/**
 * Instant (en UTC) du dernier minuit heure de Paris, à ou avant `reference`.
 *
 * Limite connue : le jour précis d'un changement d'heure (dernier dimanche de
 * mars/octobre), cette frontière peut dévier d'environ 1h par rapport à un
 * minuit Paris "exact". Négligeable pour un cooldown quotidien communautaire.
 */
export function getLastParisMidnight(reference: Date = new Date()): Date {
  const offsetMs = getParisOffsetMs(reference);
  const parisWallClock = new Date(reference.getTime() + offsetMs);
  const parisMidnightAsUTC = Date.UTC(
    parisWallClock.getUTCFullYear(),
    parisWallClock.getUTCMonth(),
    parisWallClock.getUTCDate(),
  );

  return new Date(parisMidnightAsUTC - offsetMs);
}

/** Prochain reset du cooldown (minuit Paris suivant) — commun à tous les joueurs. */
export function getNextResetAt(reference: Date = new Date()): Date {
  return new Date(getLastParisMidnight(reference).getTime() + ONE_DAY_MS);
}

/** Un joueur est en cooldown si son dernier loot date d'après le dernier minuit Paris. */
export function isOnCooldown(lastLootAt: Date | null, reference: Date = new Date()): boolean {
  return lastLootAt !== null && lastLootAt >= getLastParisMidnight(reference);
}
