# discord-tcg-bot

Bot Discord de type TCG (jeu de cartes à collectionner) pour un serveur communautaire.
`/loot` (tirage quotidien), `/collection` (consultation paginée) et `/carte` (affichage
détaillé avec autocomplete). Voir `discord-tcg-bot-architecture_2.md` pour l'architecture
complète et le journal d'avancement des milestones.

## Prérequis

- Node.js **24+** (utilise `--env-file`, natif depuis Node 20.6, sans dépendance `dotenv`)
- Un serveur Discord sur lequel tu as les droits d'administration
- Une application Discord créée sur le [Developer Portal](https://discord.com/developers/applications)

## Installation (dev local)

```bash
git clone https://github.com/PtitWiggler/discord-tcg-bot.git
cd discord-tcg-bot
npm ci
```

> On installe avec `npm ci` (et non `npm ci --omit=dev`) : `tsx` est une dépendance de
> dev mais reste nécessaire pour exécuter le seed (`prisma db seed`) et le mode dev
> (`npm run dev`), y compris en production — voir section Déploiement.

Copie `.env.example` en `.env` et remplis les valeurs :

```bash
cp .env.example .env
```

| Variable            | Où la trouver                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`     | Developer Portal > ton app > Bot > Reset Token                                                                |
| `DISCORD_CLIENT_ID` | Developer Portal > ton app > General Information > Application ID                                             |
| `DISCORD_GUILD_ID`  | Clic droit sur le serveur Discord > Copier l'ID (mode développeur requis dans Discord > Paramètres > Avancés) |
| `DATABASE_URL`      | Laisser `file:./dev.db` en dev                                                                                |

Invite le bot sur ton serveur avec les scopes `bot` + `applications.commands` (aucun
Privileged Gateway Intent n'est nécessaire).

Puis :

```bash
npx prisma generate     # génère le client Prisma
npm run db:migrate      # applique les migrations (mode dev, crée la DB si absente)
npm run db:seed         # peuple la DB depuis content/*.json
npm run deploy-commands # enregistre les slash commands sur DISCORD_GUILD_ID
npm run dev              # lance le bot (tsx, rechargement à chaud non inclus)
```

Vérifie que `/ping` répond sur le serveur.

## Validation avant commit

```bash
npx prisma generate
npx tsc --noEmit
npm run lint
```

`npm run build` compile le bot en JS dans `dist/` (voir section suivante pour le détail
de la structure produite).

## Déploiement en production (VPS)

### 1. Récupérer le code sur le VPS

```bash
git clone https://github.com/PtitWiggler/discord-tcg-bot.git
cd discord-tcg-bot
npm ci
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Remplis `.env` avec les vraies valeurs de production. **Important** : utilise un nom de
fichier différent pour `DATABASE_URL` en prod (ex. `file:./production.db`) plutôt que
`file:./dev.db`, pour ne jamais confondre les deux bases si tu retravailles en local sur
la même machine par erreur. Le `.gitignore` couvre déjà tout `prisma/*.db`, quel que
soit le nom choisi.

`DISCORD_GUILD_ID` doit pointer sur le **vrai serveur communautaire** — vérifie que ce
n'est pas resté l'ID d'un serveur de test utilisé pendant les Milestones précédents.

### 3. Base de données

```bash
npx prisma generate
npm run db:migrate:deploy   # applique les migrations existantes, sans prompt (≠ migrate dev)
npm run db:seed
```

`db:migrate:deploy` (nouveau, ajouté au Milestone 6) utilise `prisma migrate deploy` :
contrairement à `migrate dev` utilisé en local, il n'essaie jamais de créer une nouvelle
migration ni de demander confirmation — le bon choix pour un environnement non-interactif.

### 4. Enregistrer les slash commands

```bash
npm run deploy-commands
```

À refaire à chaque fois qu'une commande change de définition (nom, description,
options) — pas nécessaire pour un simple changement de logique interne.

### 5. Build

```bash
npm run build
```

Produit `dist/index.js` et sa structure (`dist/commands/`, `dist/services/`, etc.), à
plat — c'est ce que `npm start` et `ecosystem.config.cjs` attendent.

> Note technique (Milestone 6) : `tsconfig.json` inclut `src` **et** `prisma` pour que
> `tsc --noEmit` type-vérifie aussi `prisma/seed.ts`. Mais compiler avec cette config
> produirait `dist/src/...` au lieu de `dist/index.js`. `npm run build` utilise donc
> `tsconfig.build.json` (n'inclut que `src`, sortie à plat) — `prisma/seed.ts` n'a de
> toute façon jamais besoin d'être compilé : il tourne toujours via `tsx`, en dev comme
> en prod (`npm run db:seed`).

### 6. Lancer avec PM2

```bash
npm install -g pm2   # si pas déjà installé sur le VPS
pm2 start ecosystem.config.cjs
pm2 save             # persiste la liste des process pour un redémarrage du VPS
pm2 startup          # affiche la commande à lancer pour démarrer PM2 au boot (une fois)
```

`ecosystem.config.cjs` fixe explicitement le `cwd` du process à la racine du repo : la
génération d'images (`ImageService`) et la lecture du contenu (`RarityContentService`)
résolvent `assets/` et `content/` via `process.cwd()`, donc ce `cwd` doit rester la
racine du repo quel que soit l'endroit d'où `pm2 start` est lancé.

Commandes utiles :

```bash
pm2 logs discord-tcg-bot     # logs en direct
pm2 restart discord-tcg-bot  # après un déploiement
pm2 stop discord-tcg-bot
pm2 status
```

Le bot redémarre automatiquement en cas de crash. Une protection anti-crash-loop est
configurée (`min_uptime`/`max_restarts` dans `ecosystem.config.cjs`) : si le process
meurt en boucle avant 30s d'uptime plus de 10 fois de suite (ex. `.env` mal configuré),
PM2 arrête de le relancer au lieu de boucler indéfiniment — vérifie `pm2 status` et
`pm2 logs` dans ce cas.

### 7. Mettre à jour une version déployée

```bash
git pull
npm ci
npx prisma generate
npm run db:migrate:deploy   # sans effet si aucune nouvelle migration
npm run build
pm2 restart discord-tcg-bot
```

### Sauvegarde de la base

La base SQLite est un simple fichier (`prisma/<nom>.db`) : une copie régulière du
fichier suffit (ex. `cp prisma/production.db backups/production-$(date +%F).db` dans un
cron). Pas d'outillage dédié pour la V1, conformément à la section 11 du document
d'architecture.

## Vérification en conditions réelles (livrable Milestone 6)

Sur le serveur communautaire, avec la vraie config de prod :

- [ ] `/ping` répond
- [ ] `/loot` fonctionne, image générée, cooldown déclenché sur un second essai immédiat
- [ ] `/collection` affiche la collection, pagination si >10 cartes
- [ ] `/carte <nom>` avec autocomplete fonctionnel
- [ ] `pm2 status` montre le process en ligne après un `pm2 restart` ou un reboot du VPS
- [ ] Les logs (`pm2 logs`) ne montrent pas d'erreur en fonctionnement normal

## Structure du projet

```
discord-tcg-bot/
├── src/
│   ├── commands/        # loot.ts, collection.ts, carte.ts, ping.ts
│   ├── events/           # ready.ts, interactionCreate.ts
│   ├── services/          # logique pure, découplée de Prisma/Discord
│   ├── scripts/            # utilitaires de dev (preview, vérification, reset)
│   ├── db/                  # instance Prisma partagée
│   └── index.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts             # toujours exécuté via tsx, jamais compilé
│   └── migrations/
├── content/                 # rarities.json, cards.json — jamais de données en dur dans le code
├── assets/
│   ├── cards/                # illustrations (placeholder par défaut)
│   └── fonts/                  # polices bundlées (rendu identique dev/prod)
├── ecosystem.config.cjs        # config PM2
├── tsconfig.json                # dev / type-checking (inclut prisma/)
├── tsconfig.build.json            # build de prod (sortie plate dans dist/)
└── .env.example
```
