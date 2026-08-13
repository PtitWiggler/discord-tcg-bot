// Config PM2. En .cjs volontairement : le package est en "type": "module",
// et PM2 attend un fichier CommonJS (module.exports) pour son fichier de config.
//
// `cwd` est fixé explicitement à la racine du repo (plutôt que de compter sur le
// dossier courant au moment du `pm2 start`) : ImageService et RarityContentService
// résolvent assets/ et content/ via process.cwd() (décision Milestone 2, revalidée
// ici au Milestone 6) — sans ce `cwd` fixe, lancer `pm2 start` depuis un autre
// dossier casserait silencieusement la génération d'images.
module.exports = {
  apps: [
    {
      name: 'discord-tcg-bot',
      script: 'dist/index.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // Protection anti "crash-loop" : si le process meurt avant min_uptime plus de
      // max_restarts fois de suite (ex. mauvaise DATABASE_URL au démarrage), PM2
      // arrête de le relancer au lieu de boucler indéfiniment.
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
