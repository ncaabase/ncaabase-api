const express = require('express');
const cors = require('cors');
const { StatBroadcastScraper } = require('./statbroadcast-scraper');
const { ESPNPoller } = require('./espn-poller');
const { MasseyPoller } = require('./massey-poller');
const { mergeGames, sortGames, computeWinProb } = require('./merger');
const { TEAMS } = require('./teams');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'https://ncaabase.com',
    'https://www.ncaabase.com',
    'http://localhost:3000',
    'http://localhost:3001',
    /\.vercel\.app$/,
  ],
}));
app.use(express.json());

const sbScraper = new StatBroadcastScraper();
const espnPoller = new ESPNPoller();
const masseyPoller = new MasseyPoller();

app.get('/', (req, res) => {
  res.json({ name: 'NCAABase API', version: '0.1.0', status: 'running', timestamp: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({
    uptime: process.uptime(),
    scrapers: { statbroadcast: sbScraper.getStats(), espn: espnPoller.getStats() },
    teams: TEAMS.length,
  });
});

app.get('/api/scores', (req, res) => {
  try {
    const sbGames = sbScraper.getGames();
    const espnGames = espnPoller.getGames();
    let games = mergeGames(sbGames, espnGames);
    games = games.map(g => ({ ...g, winProb: computeWinProb(g) }));
    games = sortGames(games);
    res.json({
      date: new Date().toISOString().slice(0, 10),
      count: games.length,
      live: games.filter(g => g.status === 'live').length,
      games,
      sources: { statbroadcast: sbGames.length, espn: espnGames.length },
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/scores/live', (req, res) => {
  try {
    const sbGames = sbScraper.getLiveGames();
    const espnGames = espnPoller.getGames().filter(g => g.status === 'live');
    let games = mergeGames(sbGames, espnGames);
    games = games.map(g => ({ ...g, winProb: computeWinProb(g) }));
    games = sortGames(games);
    res.json({ count: games.length, games, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/scores/:date', async (req, res) => {
  try {
    const dateStr = req.params.date.replace(/-/g, '');
    const espnGames = await espnPoller.poll(dateStr);
    const games = sortGames(espnGames.map(g => ({ ...g, winProb: computeWinProb(g) })));
    res.json({ date: req.params.date, count: games.length, games, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/teams', (req, res) => {
  res.json({ teams: TEAMS });
});

// Team records from Massey
app.get('/api/records', (req, res) => {
  const records = masseyPoller.getAllRecords();
  res.json({ count: Object.keys(records).length, records });
});

app.listen(PORT, () => {
  console.log(`\nNCAABase API — Port ${PORT} — ${TEAMS.length} teams`);
  console.log(`StatBroadcast: 10s poll | ESPN: 30s poll | Massey: 10m poll\n`);
  sbScraper.start();
  espnPoller.start();
  masseyPoller.start();
});

process.on('SIGTERM', () => { sbScraper.stop(); espnPoller.stop(); masseyPoller.stop(); process.exit(0); });
process.on('SIGINT', () => { sbScraper.stop(); espnPoller.stop(); masseyPoller.stop(); process.exit(0); });
