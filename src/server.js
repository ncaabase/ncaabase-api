// NCAABase API Server
// Data sources:
//   1. StatBroadcast landing pages — live scores for 63 verified schools (10s poll)
//   2. Sidearm aggregation API — complete game schedule for all schools (60s poll)
//   3. Massey Ratings — static reference data (308 teams, indices, historical results)

const express = require('express');
const cors = require('cors');
const { StatBroadcastScraper } = require('./statbroadcast-scraper');
const { SidearmPoller } = require('./sidearm-poller');
const { GameStore } = require('./game-store');
const { TEAMS } = require('./teams');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(cors({
  origin: [
    'https://ncaabase.com',
    'https://www.ncaabase.com',
    /\.ncaabase\.com$/,
    /\.vercel\.app$/,
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  methods: ['GET'],
}));

// ─── Data Sources ───

const gameStore = new GameStore();
const sbScraper = new StatBroadcastScraper();
const sidearmPoller = new SidearmPoller();

// Sync loop: merge data from both sources into the game store
async function syncLoop() {
  while (true) {
    try {
      // Merge Sidearm schedule into game store
      const sidearmGames = sidearmPoller.getGames();
      if (sidearmGames.length > 0) {
        gameStore.updateFromSidearm(sidearmGames);
      }

      // Merge StatBroadcast live scores into game store
      const sbGames = sbScraper.getGames();
      if (sbGames.length > 0) {
        gameStore.updateFromStatBroadcast(sbGames);
      }
    } catch (err) {
      console.error('[Sync] Error:', err.message);
    }
    await new Promise(r => setTimeout(r, 5000)); // Sync every 5s
  }
}

// ─── API Routes ───

// Today's games (merged, sorted)
app.get('/api/scores', (req, res) => {
  const games = gameStore.getGames();
  res.json({
    date: new Date().toISOString().slice(0, 10),
    count: games.length,
    games,
    stats: gameStore.getStats(),
  });
});

// Live games only
app.get('/api/scores/live', (req, res) => {
  const games = gameStore.getLiveGames();
  res.json({ count: games.length, games });
});

// Games by conference
app.get('/api/scores/conference/:conf', (req, res) => {
  const games = gameStore.getGamesByConf(req.params.conf);
  res.json({ conference: req.params.conf, count: games.length, games });
});

// All teams
app.get('/api/teams', (req, res) => {
  res.json({ count: TEAMS.length, teams: TEAMS });
});

// Health / status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    teams: TEAMS.length,
    games: gameStore.getStats(),
    statbroadcast: sbScraper.getStats(),
    sidearm: {
      games: sidearmPoller.getGames().length,
      lastFetch: sidearmPoller.lastFetch,
    },
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'NCAABase API',
    version: '2.0',
    sources: ['StatBroadcast (63 schools, 10s)', 'Sidearm (all schools, 60s)', 'Massey (308 teams, static)'],
    endpoints: ['/api/scores', '/api/scores/live', '/api/scores/conference/:conf', '/api/teams', '/api/status'],
  });
});

// ─── Start ───

app.listen(PORT, () => {
  console.log(`\n=== NCAABase API v2.0 ===`);
  console.log(`Port: ${PORT}`);
  console.log(`Teams: ${TEAMS.length}`);
  console.log(`StatBroadcast: ${TEAMS.filter(t=>t.gid).length} schools (10s poll)`);
  console.log(`Sidearm: all schools (60s poll)`);
  console.log(`========================\n`);

  sbScraper.start();
  sidearmPoller.start();
  syncLoop();
});

process.on('SIGTERM', () => { sbScraper.stop(); sidearmPoller.stop(); process.exit(0); });
process.on('SIGINT', () => { sbScraper.stop(); sidearmPoller.stop(); process.exit(0); });
