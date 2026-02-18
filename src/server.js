// NCAABase API Server v4
// Sources:
//   1. PEARatings API — today's D1 schedule (teams, times, win prob, GQI) — 5min poll
//   2. StatBroadcast landing pages — LIVE scores only (63 schools) — 10s poll
//   3. Massey Ratings — static reference (308 teams)

const express = require('express');
const cors = require('cors');
const { StatBroadcastScraper } = require('./statbroadcast-scraper');
const { PearPoller } = require('./pear-poller');
const { GameStore } = require('./game-store');
const { TEAMS } = require('./teams');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'https://ncaabase.com', 'https://www.ncaabase.com',
    /\.ncaabase\.com$/, /\.vercel\.app$/,
    'http://localhost:3000', 'http://localhost:3001',
  ],
  methods: ['GET'],
}));

// ─── Data Sources ───

const gameStore = new GameStore();
const sbScraper = new StatBroadcastScraper();
const pearPoller = new PearPoller();

// Sync loop: merge PEAR schedule + SB live scores
async function syncLoop() {
  while (true) {
    try {
      const pearGames = pearPoller.getGames();
      if (pearGames.length > 0) {
        gameStore.setSchedule(pearGames);
      }
      const sbGames = sbScraper.getGames();
      gameStore.setLive(sbGames);
    } catch (err) {
      console.error('[Sync] Error:', err.message);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

// ─── API Routes ───

app.get('/api/scores', (req, res) => {
  const games = gameStore.getGames();
  res.json({
    date: new Date().toISOString().slice(0, 10),
    count: games.length,
    games,
    stats: gameStore.getStats(),
  });
});

app.get('/api/scores/live', (req, res) => {
  const games = gameStore.getLiveGames();
  res.json({ count: games.length, games });
});

app.get('/api/scores/conference/:conf', (req, res) => {
  const games = gameStore.getGamesByConf(req.params.conf);
  res.json({ conference: req.params.conf, count: games.length, games });
});

app.get('/api/teams', (req, res) => {
  res.json({ count: TEAMS.length, teams: TEAMS });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    teams: TEAMS.length,
    games: gameStore.getStats(),
    statbroadcast: sbScraper.getStats(),
    pear: {
      games: pearPoller.getGames().length,
      lastFetch: pearPoller.lastFetch,
    },
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'NCAABase API',
    version: '4.0',
    sources: ['PEARatings (schedule, 5min)', 'StatBroadcast (live scores, 10s)'],
    endpoints: ['/api/scores', '/api/scores/live', '/api/scores/conference/:conf', '/api/teams', '/api/status'],
  });
});

// ─── Start ───

app.listen(PORT, () => {
  console.log(`\n=== NCAABase API v4.0 ===`);
  console.log(`Port: ${PORT}`);
  console.log(`Teams: ${TEAMS.length}`);
  console.log(`PEAR: schedule (5min poll)`);
  console.log(`StatBroadcast: ${TEAMS.filter(t=>t.gid).length} schools (10s live poll)`);
  console.log(`========================\n`);
  pearPoller.start();
  sbScraper.start();
  syncLoop();
});

process.on('SIGTERM', () => { sbScraper.stop(); pearPoller.stop(); process.exit(0); });
process.on('SIGINT', () => { sbScraper.stop(); pearPoller.stop(); process.exit(0); });
