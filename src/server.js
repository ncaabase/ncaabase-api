// NCAABase API Server v5
// Sources:
//   1. PEARatings API — today's D1 schedule (teams, times, win prob, GQI) — 5min poll
//   2. Sidearm Live Stats — real-time scores, BSO, runners, pitcher/batter — 12s poll
//   3. Massey Ratings — static reference (308 teams)

const express = require('express');
const cors = require('cors');
const { SidearmLivePoller } = require('./sidearm-live');
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
const sidearmLive = new SidearmLivePoller();
const pearPoller = new PearPoller();

// Sync loop: merge PEAR schedule + Sidearm live scores
async function syncLoop() {
  while (true) {
    try {
      const pearGames = pearPoller.getGames();
      if (pearGames.length > 0) {
        gameStore.setSchedule(pearGames);
      }
      const liveGames = sidearmLive.getGames();
      gameStore.setLive(liveGames);
    } catch (err) {
      console.error('[Sync] Error:', err.message);
    }
    await new Promise(r => setTimeout(r, 3000));
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

app.get('/api/scores/:date', async (req, res) => {
  const dateStr = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) {
    const games = gameStore.getGames();
    return res.json({ date: today, count: games.length, games });
  }
  const games = await pearPoller.fetchByDate(dateStr);
  res.json({ date: dateStr, count: games.length, games });
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
    sidearmLive: sidearmLive.getStats(),
    pear: {
      games: pearPoller.getGames().length,
      lastFetch: pearPoller.lastFetch,
    },
  });
});

// Debug: show raw sidearm live data
app.get('/api/debug/sidearm', (req, res) => {
  const games = sidearmLive.getGames();
  res.json({
    count: games.length,
    activeAbbrevs: [...sidearmLive.activeAbbrevs || []],
    cachedAbbrevs: sidearmLive.getStats().cachedList || [],
    games: games.map(g => ({
      id: g.id,
      status: g.status,
      home: g.home?.name,
      away: g.away?.name,
      homeScore: g.home?.score,
      awayScore: g.away?.score,
      inning: g.inning,
      half: g.half,
      balls: g.balls,
      strikes: g.strikes,
      outs: g.outs,
      runners: g.runners,
      pitcher: g.pitcher?.name,
      hitter: g.hitter?.name,
    })),
  });
});

// Debug: show a single live game with all fields
app.get('/api/debug/live', (req, res) => {
  const liveGames = gameStore.getLiveGames();
  res.json({
    count: liveGames.length,
    games: liveGames.map(g => ({
      id: g.id,
      source: g.source,
      status: g.status,
      home: { name: g.home?.name, score: g.home?.score },
      away: { name: g.away?.name, score: g.away?.score },
      inning: g.inning,
      half: g.half,
      balls: g.balls,
      strikes: g.strikes,
      outs: g.outs,
      runners: g.runners,
      pitcher: g.pitcher,
      hitter: g.hitter,
      lineScore: { home: g.home?.lineScore, away: g.away?.lineScore },
    })),
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'NCAABase API',
    version: '5.1',
    sources: ['PEARatings (schedule, 5min)', 'Sidearm Live Stats (scores/BSO/runners, 8s)'],
    endpoints: ['/api/scores', '/api/scores/:date', '/api/scores/live', '/api/scores/conference/:conf', '/api/teams', '/api/status', '/api/debug/sidearm', '/api/debug/live'],
  });
});

// ─── Start ───

app.listen(PORT, () => {
  console.log(`\n=== NCAABase API v5.0 ===`);
  console.log(`Port: ${PORT}`);
  console.log(`Teams: ${TEAMS.length}`);
  console.log(`PEAR: schedule (5min poll)`);
  console.log(`Sidearm: live stats (12s poll)`);
  console.log(`========================\n`);
  pearPoller.start();
  sidearmLive.start();
  syncLoop();
});

process.on('SIGTERM', () => { sidearmLive.stop(); pearPoller.stop(); process.exit(0); });
process.on('SIGINT', () => { sidearmLive.stop(); pearPoller.stop(); process.exit(0); });
