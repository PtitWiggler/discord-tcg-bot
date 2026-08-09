# Document d'architecture technique — Bot Discord TCG (V1)

## 1. Vision du projet

Un bot Discord pour un serveur communautaire proposant un mini-jeu de type TCG (jeu de cartes à collectionner). Chaque joueur peut utiliser une commande quotidienne pour obtenir une carte aléatoire, consulter sa collection et afficher les cartes qu'il possède. Le projet est pensé pour évoluer progressivement : monnaie, boutique, échanges entre joueurs et effets visuels plus poussés viendront dans des versions ultérieures, sur la même base technique.

## 2. Périmètre de ce document

Ce document détaille en profondeur l'architecture de la **V1** :

- `/loot` — tirage quotidien d'une carte aléatoire
- `/collection` — consultation de sa collection
- `/carte` — affichage d'une carte précise de sa collection

Les fonctionnalités prévues pour la suite (or, `/shop`, `/trade`, animations avancées) sont abordées en fin de document sous forme de **roadmap**, sans conception technique détaillée à ce stade — l'architecture V1 est conçue pour ne pas leur faire obstacle.

## 3. Mode de collaboration

Ce projet est mené en mode "Claude implémente" : Claude écrit le code de chaque milestone, Thomas review, pose des questions et valide avant de passer à la suite. Ce n'est pas un projet d'apprentissage encadré où Thomas code lui-même — l'objectif est d'avancer efficacement sur un projet perso à côté d'autres priorités (dont le projet EtsyGrade, déjà chronophage).

## 4. Stack technique retenue

| Composant | Choix | Justification |
|---|---|---|
| Langage / runtime | TypeScript sur Node.js | Cohérent avec ton expérience Angular/React/Vite ; typage fort proche de ton confort côté Java |
| Librairie Discord | discord.js v14 | Librairie la plus utilisée et la mieux documentée, précieux pour un développement itératif assisté |
| Base de données | SQLite | Suffisant pour un seul serveur communautaire ; zéro serveur DB à administrer |
| ORM | Prisma | Typage fort, migrations propres, lisible venant d'un environnement Java/JPA |
| Génération d'images | `@napi-rs/canvas` | Composition d'images de carte (illustration + cadre de rareté + texte) en pur Node, rapide |
| Hébergement | Petit VPS (ou Railway/Fly.io) | Un seul process Node tournant en continu, pas d'infra complexe nécessaire |
| Process manager | PM2 (ou service systemd) | Redémarrage auto en cas de crash, logs centralisés |

## 5. Architecture générale

```
┌─────────────────────┐        ┌──────────────────────────┐
│   Discord (Gateway)  │◄──────►│      Bot Node.js/TS       │
│  Slash commands,     │        │  discord.js client        │
│  boutons, embeds     │        │                            │
└─────────────────────┘        │  ┌──────────────────────┐  │
                                │  │ Command handlers      │  │
                                │  │ (/loot, /collection,  │  │
                                │  │  /carte)               │  │
                                │  └──────────┬───────────┘  │
                                │             │              │
                                │  ┌──────────▼───────────┐  │
                                │  │ Services métier       │  │
                                │  │ - LootService (tirage) │  │
                                │  │ - ImageService (canvas)│  │
                                │  │ - CooldownService      │  │
                                │  └──────────┬───────────┘  │
                                │             │              │
                                │  ┌──────────▼───────────┐  │
                                │  │ Prisma (ORM)           │  │
                                │  └──────────┬───────────┘  │
                                └─────────────┼──────────────┘
                                              │
                                     ┌────────▼────────┐
                                     │  SQLite (fichier) │
                                     └──────────────────┘
```

Le bot est un unique process Node.js qui maintient une connexion websocket permanente à Discord (Gateway) pour recevoir les interactions (commandes slash, clics de bouton). Chaque commande est déléguée à un handler dédié, qui s'appuie sur des services métier (tirage, cooldown, génération d'image) et sur Prisma pour la persistance.

## 6. Modèle de données

Un point de conception important : chaque carte existe en plusieurs **versions selon sa rareté** (ex. "Dragon Rouge" en version Normale, Rare, Épique...). On distingue donc le "template" de carte (l'illustration/le concept) de sa "variante" (template + rareté), qui est l'unité réellement possédée par un joueur.

| Table | Champs principaux | Rôle |
|---|---|---|
| `Player` | `discordId` (PK), `lastLootAt`, `createdAt` | Un joueur du serveur |
| `Rarity` | `id`, `name`, `sortOrder`, `colorHex`, `dropWeight` | Niveaux de rareté et leur poids de tirage |
| `CardTemplate` | `id`, `name`, `slug`, `flavorText` | Le "concept" de carte, indépendant de la rareté |
| `CardVariant` | `id`, `cardTemplateId` (FK), `rarityId` (FK), `imageFile` | Une version précise (ex. "Dragon Rouge - Épique") |
| `PlayerCard` | `playerId` (FK), `cardVariantId` (FK), `quantity`, `firstObtainedAt` | Ce que possède un joueur, avec quantité (doublons) |

Cette séparation Template / Variant permet d'ajouter facilement de nouvelles cartes sans dupliquer la logique de rareté, et de faire évoluer les taux de drop par rareté indépendamment du contenu.

## 7. Logique de tirage (`/loot`)

1. Vérifier le cooldown du joueur (reset à minuit, voir section 12).
2. Tirer une rareté au hasard, pondérée par `Rarity.dropWeight` (tirage pondéré classique).
3. Tirer un `CardTemplate` au hasard parmi tous les templates actifs.
4. Résoudre le `CardVariant` correspondant (template + rareté tirée).
5. Créer ou incrémenter la ligne `PlayerCard` correspondante (gestion des doublons).
6. Mettre à jour `lastLootAt`.
7. Générer l'image de la carte (via `ImageService`) et répondre avec un embed dont la couleur reflète la rareté.

## 8. Commandes V1

**`/loot`** — Réponse publique dans le salon (l'aspect "tirage visible de tous" fait partie du plaisir social du mini-jeu). Si le cooldown n'est pas écoulé, réponse éphémère indiquant le temps restant.

**`/collection`** — Réponse éphémère (visible seulement par le joueur, pour éviter le spam du salon). Liste paginée via boutons "précédent/suivant", regroupée par rareté ou triée alphabétiquement selon préférence.

**`/carte <nom>`** — Réponse éphémère. Utilise l'**autocomplete** natif de Discord sur le paramètre `nom` pour suggérer les cartes que le joueur possède réellement pendant qu'il tape — un vrai confort d'usage, natif à discord.js.

## 9. Gestion des assets et images (placeholders pour l'instant)

Comme il n'y a pas encore d'illustrations, la V1 prévoit :

- Un dossier `assets/cards/` avec une image placeholder générique par défaut.
- Une convention de nommage par `slug` de carte (`dragon-rouge.png`) : dès qu'une vraie illustration existe, il suffit de déposer le fichier au bon nom pour qu'elle remplace le placeholder, sans changement de code.
- `ImageService` compose dynamiquement, par-dessus l'illustration (placeholder ou réelle) : un cadre coloré selon la rareté, le nom de la carte, et le nom de la rareté — via `@napi-rs/canvas`.

Cette approche découple totalement le contenu artistique du code : tu pourras enrichir les illustrations au fil de l'eau sans toucher au bot.

## 10. Gestion du contenu (cartes et raretés)

Conformément au choix fait pour la V1, le contenu est défini via des **fichiers de configuration** versionnés dans le repo :

- `content/rarities.json` — liste des raretés, leur ordre, couleur, poids de tirage
- `content/cards.json` — liste des `CardTemplate`

Un script de seed Prisma (`prisma/seed.ts`) lit ces fichiers et peuple/synchronise la base au déploiement. Pour ajouter une carte : éditer `cards.json`, relancer le seed, redéployer. Pas de commande admin nécessaire pour la V1 — simple et suffisant à cette échelle.

## 11. Hébergement et déploiement

Le bot cible un seul serveur communautaire, donc pas besoin d'infrastructure lourde :

- Un seul process Node.js, géré par PM2 pour le redémarrage automatique et les logs.
- Base SQLite = un simple fichier, sauvegardé régulièrement (copie du fichier suffit).
- Déploiement possible sur un petit VPS (Hetzner, OVH...) ou une plateforme simple (Railway, Fly.io) selon ta préférence au moment de déployer.
- Token du bot et secrets stockés dans un fichier `.env`, jamais commité (`.gitignore`).

## 12. Structure de projet proposée

```
discord-tcg-bot/
├── src/
│   ├── commands/         # loot.ts, collection.ts, carte.ts
│   ├── events/            # ready.ts, interactionCreate.ts
│   ├── services/
│   │   ├── loot.service.ts
│   │   ├── image.service.ts
│   │   └── cooldown.service.ts
│   ├── db/
│   │   └── client.ts      # instance Prisma
│   └── index.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── content/
│   ├── rarities.json
│   └── cards.json
├── assets/
│   ├── cards/
│   └── fonts/          # polices bundlées pour ImageService (Milestone 2)
├── .env.example
└── package.json
```

## 13. Configuration par défaut : cooldown et raretés

**Cooldown** : reset fixe à **minuit, heure de Paris**, identique pour tous les joueurs (confirmé).

**Raretés** : valeurs de départ ci-dessous, à utiliser telles quelles dans `content/rarities.json`. Comme ce sont des données de configuration (et non du code en dur), tu pourras les modifier à tout moment — renommer une rareté, changer sa couleur, ou ajuster son poids de tirage — simplement en éditant ce fichier JSON puis en relançant le script de seed, sans toucher au bot lui-même.

| Rareté | Ordre | Couleur (embed) | Poids de tirage |
|---|---|---|---|
| Normale | 1 | `#B0B0B0` (gris) | 55 |
| Rare | 2 | `#3B82F6` (bleu) | 25 |
| Super Rare | 3 | `#A855F7` (violet) | 12 |
| Épique | 4 | `#F97316` (orange) | 6 |
| Légendaire | 5 | `#FACC15` (or) | 2 |

Le "poids de tirage" est relatif : le tirage pondéré additionne tous les poids actifs (ici 100 au total, mais ce n'est pas obligatoire) et tire au sort proportionnellement. Ajouter une 6ᵉ rareté ou changer les poids ne demande donc aucun calcul particulier — juste des valeurs cohérentes entre elles.

## 14. Roadmap (hors périmètre détaillé de ce document)

Sur cette même base technique, les évolutions suivantes s'ajouteront naturellement :

- **Or et `/shop`** : ajout d'un champ `gold` sur `Player`, tirage occasionnel d'or à la place d'une carte, commande d'achat ciblé (hors légendaires) via select menu + confirmation.
- **`/trade`** : messages à boutons "Accepter/Refuser" entre deux joueurs, avec vérification de possession au moment de la confirmation.
- **Animations et "juice"** : dans un premier temps, effet de suspense par édition séquentielle du message (`⏳` → révélation), puis génération de GIFs animés pour les tirages de haute rareté. Une **Discord Activity** (mini-app web embarquée, avec rendu riche et son) reste une option envisageable à plus long terme, mais nettement plus complexe à mettre en place.
- **Commandes admin** : si le fichier de config devient limitant à l'usage, ajout de commandes réservées aux modérateurs pour gérer le contenu directement depuis Discord.
- **Système de combat au tour par tour (piste V3, non détaillée à ce stade)** : évolution envisagée au-delà de la roadmap ci-dessus, mentionnée ici pour tracer l'intention sans encore engager de conception. Introduirait des stats de combat par carte (coût, dégâts, PV, défense, etc.), donc de nouveaux champs sur `CardTemplate`/`CardVariant` (migration Prisma à prévoir à ce moment-là) et un moteur de résolution de tours entièrement à concevoir. Aucune décision d'architecture prise en amont pour préparer spécifiquement cette piste — mais rien dans la V1 (notamment la génération d'image du Milestone 2, conçue en couches indépendantes) ne lui fait obstacle non plus.

## 15. Milestones d'exécution

Chaque milestone est pensé pour tenir dans **une nouvelle conversation Claude dédiée** (même logique qu'EtsyGrade) : tu démarres une conversation, tu donnes ce document en contexte, tu indiques le numéro du milestone à réaliser. Claude implémente le milestone, tu reviews le code produit, poses tes questions, et valides avant de passer au suivant. Chaque milestone a un livrable clair qui permet de vérifier qu'il est terminé.

**Milestone 0 — Setup du projet**
Scaffolding du repo (structure de dossiers de la section 12), configuration TypeScript/ESLint/Prettier, création de l'application Discord (Developer Portal) et du bot de test, connexion minimale avec une commande `/ping` qui répond. *Livrable : le bot est en ligne sur le serveur Discord et répond à `/ping`.*

**Milestone 1 — Modèle de données**
Écriture du schéma Prisma (`Player`, `Rarity`, `CardTemplate`, `CardVariant`, `PlayerCard`), première migration, création de `content/rarities.json` (valeurs de la section 13) et d'un `content/cards.json` de test avec quelques cartes placeholder, script de seed fonctionnel. *Livrable : la base SQLite se peuple correctement depuis les fichiers de config.*

**Milestone 2 — Génération d'images**
Mise en place d'`ImageService` avec `@napi-rs/canvas` : composition d'un cadre coloré selon la rareté et du nom de la carte par-dessus l'image placeholder. *Livrable : on peut générer et visualiser l'image d'une carte pour chaque rareté.*

**Milestone 3 — Commande `/loot`**
Tirage pondéré (rareté puis template), vérification et écriture du cooldown (reset minuit), création/incrément du `PlayerCard`, réponse en embed avec l'image générée et la couleur de la rareté. *Livrable : `/loot` fonctionne de bout en bout, une fois par jour et par joueur.*

**Milestone 4 — Commande `/collection`**
Liste paginée (boutons précédent/suivant) de la collection du joueur, réponse éphémère, regroupement par rareté. *Livrable : un joueur peut parcourir toute sa collection depuis Discord.*

**Milestone 5 — Commande `/carte`**
Autocomplete sur les cartes réellement possédées par le joueur, affichage de la carte choisie en grand. *Livrable : `/carte <nom>` affiche la bonne carte avec autocomplete fonctionnel.*

**Milestone 6 — Finitions et déploiement V1**
Gestion des cas d'erreur (cooldown actif, carte introuvable, etc.), README d'installation, déploiement sur l'hébergement choisi (VPS ou Railway/Fly.io) avec PM2, vérification en conditions réelles sur le serveur communautaire. *Livrable : la V1 est en production et utilisable par la communauté.*

Les fonctionnalités de la roadmap (section 14 — or, `/shop`, `/trade`, animations, admin) donneront lieu à leurs propres milestones (7, 8, 9...) une fois la V1 validée en production, en gardant ce document comme référence commune à toutes les conversations.

## 16. Journal d'avancement

## Milestone 0 — Rapport d'avancement

**Statut : ✅ Terminé**

### Livrable
Le bot est en ligne sur le serveur Discord et répond à `/ping` (latence round-trip + latence WebSocket affichées).

### Réalisé
- Application Discord créée (Developer Portal), bot invité sur le serveur de test avec les scopes `bot` + `applications.commands`, aucun Privileged Gateway Intent activé (non nécessaire pour les slash commands).
- Structure de projet scaffoldée (version allégée de la section 12 : `prisma/` et `content/` reportés au Milestone 1).
- Tooling configuré : TypeScript (`NodeNext`), ESLint v9 (flat config, `typescript-eslint` unifié), Prettier, `tsx` comme runtime de dev.
- Chargement dynamique des commandes implémenté (Option B retenue dès ce milestone plutôt qu'un `if/else` en dur, pour absorber `/loot`, `/collection`, `/carte` sans retouche du loader).
- Events (`ready`, `interactionCreate`) importés directement dans `index.ts`, sans loader générique — volume fixe (2 events), jugé suffisant.
- `deploy-commands.ts` opérationnel comme script séparé (enregistrement en mode "guild", instantané, via `DISCORD_GUILD_ID`).

### Décisions techniques prises pendant l'implémentation (non détaillées dans le document initial)
- **Convention d'export** : chaque fichier de `src/commands/` utilise `export default` (objet respectant l'interface `Command`). À respecter pour les futures commandes (`loot.ts`, `collection.ts`, `carte.ts`) — le loader générique en dépend.
- **Fix Windows** : `import()` dynamique nécessite une conversion en URL `file://` via `pathToFileURL` (sinon `ERR_UNSUPPORTED_ESM_URL_SCHEME` sur Windows). Point à garder en tête pour tout futur chargement dynamique de fichiers (ex. futurs scripts de contenu).
- **Détection d'extension** (`.ts` en dev via `tsx`, `.js` en prod via `dist/`) déduite dynamiquement de `import.meta.url` du fichier exécutant, pour que le loader fonctionne dans les deux contextes sans configuration séparée.
- **Typage `client.commands`** : ajouté via *module augmentation* de `discord.js` (`declare module 'discord.js'`) dans `src/types.ts`.
- Pas de dépendance `dotenv` : `--env-file=.env` natif (Node 24.16).

### Écarts par rapport au document
Aucun écart d'architecture. Le mode de collaboration a été ajusté en cours de milestone (Claude implémente directement le code, Thomas review) — conforme à la section 3 du document, qui décrivait déjà ce mode ("Ce projet est mené en mode 'Claude implémente'").

### Prochaine étape
Milestone 1 — Modèle de données (schéma Prisma, `content/rarities.json`, `content/cards.json` de test, script de seed).

## Milestone 1 — Rapport d'avancement

**Statut : ✅ Terminé**

### Livrable
La base SQLite se peuple correctement depuis les fichiers de config. Vérifié via Prisma Studio : 5 lignes dans `Rarity`, 5 dans `CardTemplate`, 25 dans `CardVariant` (produit cartésien template × rareté), `Player`/`PlayerCard` vides (attendu, se peuplera via `/loot` au Milestone 3).

### Réalisé
- Schéma Prisma écrit (`Player`, `Rarity`, `CardTemplate`, `CardVariant`, `PlayerCard`) avec relations et contraintes d'unicité (`cardTemplateId` + `rarityId` sur `CardVariant`, clé composite `playerId` + `cardVariantId` sur `PlayerCard`).
- Première migration générée et appliquée (`prisma migrate dev --name init`), historisée dans `prisma/migrations/` (versionnée, contrairement à `prisma/dev.db`).
- `content/rarities.json` créé avec les 5 valeurs de la section 13.
- `content/cards.json` créé avec 5 cartes placeholder de test.
- `prisma/seed.ts` fonctionnel et idempotent (`upsert` uniquement) : lit les fichiers `content/*.json` et génère toutes les variantes (template × rareté).

### Décisions techniques prises pendant l'implémentation (non détaillées dans le document initial)
- **Prisma épinglé en v6.x (`^6.19.3`)** : Prisma 7, sorti après la rédaction du document (nov. 2025), introduit des changements structurants (`prisma.config.ts` obligatoire, adapters de connexion même pour SQLite, générateur `prisma-client` généré hors `node_modules`) jugés disproportionnés pour ce projet. Décision prise consciemment pour rester sur un setup simple, proche de ce que le document suppose. À réévaluer si besoin plus tard (section 4 du doc à mettre à jour pour formaliser ce pin).
- **`imageFile` stocké sur `CardVariant`** (pas recalculé à la volée depuis le slug du template) : rempli par défaut à `${slug}.png` pour toutes les rarétés au seed, mais laisse la possibilité d'une illustration différente par rareté plus tard sans migration.
- **Lecture de `content/*.json` via `fs.readFileSync` + `import.meta.url`**, plutôt qu'un import JSON natif — cohérent avec le pattern déjà utilisé au Milestone 0 pour le chargement dynamique des commandes, évite la complexité des import attributes ESM.
- **`tsconfig.json`** : ajout de `prisma` au tableau `include` (en plus de `src`) et suppression de `rootDir: "src"`, pour que `seed.ts` soit reconnu par le compilateur. Point de vigilance pour le Milestone 6 (build prod) : la sortie `tsc` sera `dist/src/...` et `dist/prisma/...` au lieu d'une sortie à plat — à ajuster à ce moment-là.
- Extension VS Code Prisma installée pour la coloration syntaxique. Bug connu de cette extension : elle affiche une erreur de validation "Prisma 7" sur le champ `url` même en v6 pinnée — cosmétique, sans impact sur le CLI réel (confirmé via `npx prisma validate`).

### Écarts par rapport au document
Aucun écart de modélisation (schéma conforme à la section 6). Ajustement outillage lié à la sortie de Prisma 7 postérieure à la rédaction du document (voir décisions ci-dessus) — la section 4 (stack technique) gagnerait à mentionner explicitement le pin en v6.x.

### Prochaine étape
Milestone 2 — Génération d'images (`ImageService` avec `@napi-rs/canvas`).

## Milestone 2 — Rapport d'avancement

**Statut : ✅ Terminé**

### Livrable
On peut générer et visualiser l'image d'une carte pour chaque rareté. Vérifié via `scripts/preview-cards.ts` (lecture de `content/rarities.json`, une image générée par rareté dans `preview-output/`) : les 5 cadres colorés (Normale à Légendaire) sont visuellement distincts et conformes aux couleurs de la section 13.

### Réalisé
- `ImageService` (`src/services/image.service.ts`) avec `generateCardImage()` : composition canvas en couches — fond de carte, illustration (cover-fit + coins arrondis, sans déformation), cadre coloré selon la rareté, bandeau nom de carte + nom de rareté, cadre extérieur.
- Deux layouts supportés dès ce milestone : **standard** (illustration en bloc haut + bandeau opaque séparé) et **fullart** (illustration sur toute la carte, texte superposé sur un dégradé bas pour rester lisible quelle que soit l'illustration), sélectionné via un champ `fullart: boolean` dans les options passées au service.
- Placeholder générique créé (`assets/cards/placeholder.png`), utilisé en repli automatique dès que `CardVariant.imageFile` ne correspond à aucun fichier présent dans `assets/cards/` — conforme au mécanisme de repli décrit section 9.
- Script de vérification manuelle `scripts/preview-cards.ts` (hors périmètre du bot lui-même, utilitaire de dev).
- Rendu validé sur les cas limites : illustration manquante (fallback placeholder), illustration non carrée (cover-fit), nom de carte long (troncature avec "…"), illustration très claire en layout fullart (lisibilité du texte via le dégradé, testée sur le pire cas).

### Décisions techniques prises pendant l'implémentation (non détaillées dans le document initial)
- **Découplage de Prisma** : `ImageService` n'interroge pas la base lui-même ; il reçoit `cardName`, `rarityName`, `colorHex`, `imageFile` déjà résolus par l'appelant. Garde le service testable indépendamment et directement réutilisable par `/loot` et `/carte` (Milestones 3 et 5) sans dupliquer la logique de résolution du `CardVariant`.
- **Polices bundlées** : DejaVu Sans (`assets/fonts/DejaVuSans.ttf` et `DejaVuSans-Bold.ttf`, licence Bitstream Vera, libre de redistribution) enregistrée via `GlobalFonts.registerFromPath`, plutôt que de compter sur les polices système. Garantit un rendu identique en dev (Windows) et en prod (VPS Linux), qui n'ont pas les mêmes polices par défaut. `assets/fonts/` est un ajout à la structure de la section 12, qui ne listait que `assets/cards/`.
- **Résolution des chemins d'assets via `process.cwd()`**, pas via `import.meta.url` (à la différence du chargement de commandes du Milestone 0 et du seed du Milestone 1) : suppose que le process est toujours lancé depuis la racine du repo. Point à recroiser au Milestone 6 en même temps que l'ajustement de structure `dist/` déjà identifié au Milestone 1.
- **Layout fullart piloté par l'appelant, pas par `ImageService`** : le service expose un simple booléen ; c'est au contenu (`content/rarities.json`, via un champ `fullart` optionnel par rareté) de décider quelles raretés en bénéficient. Évite toute migration Prisma pour cette fonctionnalité. Ajouté après coup à la demande de Thomas, en gardant `fullart` non typé strictement requis côté JSON (`fullart?: boolean`, défaut `false`) pour ne rien casser si le champ n'est pas encore présent dans le fichier de contenu existant.
- **Format de carte** : 600×840px (ratio ~5:7, format carte à jouer classique), choisi arbitrairement en l'absence de contrainte du document — ajustable via une seule constante si besoin.

### Écarts par rapport au document
Aucun écart d'architecture. Ajout du dossier `assets/fonts/` (non listé section 12) pour les raisons ci-dessus — section 12 à mettre à jour pour le refléter. Ajout du layout fullart, non prévu au périmètre initial du milestone (section 15 ne mentionnait que "cadre coloré + nom de la carte"), à la demande explicite de Thomas en cours de milestone.

### Prochaine étape
Milestone 3 — Commande `/loot`.