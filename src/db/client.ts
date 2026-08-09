import { PrismaClient } from '@prisma/client';

/**
 * Instance unique de PrismaClient, partagée par toutes les commandes et services
 * du bot (structure prévue section 12 du document d'architecture).
 *
 * `prisma/seed.ts` reste volontairement indépendant avec sa propre instance :
 * c'est un script ponctuel qui tourne hors du process du bot, aucun bénéfice
 * à mutualiser avec celle-ci.
 */
export const prisma = new PrismaClient();
