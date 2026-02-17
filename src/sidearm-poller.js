// Sidearm Sports Aggregation API Poller
// Endpoint: aggregation-service.sidearmsports.com/services/games.ashx
// Returns ALL games across all Sidearm schools with structured JSON
// We filter by sport.abbrev === "BB" for baseball

const https = require('https');
const { findTeam } = require('./teams');

function fetch(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    }}, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function buildURL(date) {
  // Sidearm uses UTC date range: 9AM UTC day-of to 8:59AM UTC next day
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const nextD = new Date(d);
  nextD.setDate(nextD.getDate() + 1);
  const ny = nextD.getFullYear();
  const nm = String(nextD.getMonth() + 1).padStart(2, '0');
  const nd = String(nextD.getDate()).padStart(2, '0');
  return `https://aggregation-service.sidearmsports.com/services/games.ashx?livestats=1&start_date=${y}-${m}-${day}T09:00:00.000Z&end_date=${ny}-${nm}-${nd}T08:59:59.999Z`;
}

function parseGame(g) {
  // Only baseball
  if (!g.sport || (g.sport.abbrev !== 'BB' && g.sport.shortname !== 'baseball')) return null;

  const home = g.home_team || {};
  const away = g.away_team || {};

  // Try to match to our 308-team database
  const homeTeam = findTeam(home.name) || { name: home.name || 'TBD', abbr: '???', conf: home.conference?.name || '' };
  const awayTeam = findTeam(away.name) || { name: away.name || 'TBD', abbr: '???', conf: away.conference?.name || '' };

  // Determine status
  let status = 'pre'; // default upcoming
  if (g.status === 'C') status = 'final';
  // If sidearmstats_active is set, it's live
  if (g.sidearmstats_active) status = 'live';

  const game = {
    id: `sidearm-${g.id}`,
    source: 'sidearm',
    status,
    home: {
      name: homeTeam.name,
      abbr: homeTeam.abbr,
      conf: homeTeam.conf,
      logo: home.logo || null,
      score: null, // Sidearm schedule doesn't include scores
    },
    away: {
      name: awayTeam.name,
      abbr: awayTeam.abbr,
      conf: awayTeam.conf,
      logo: away.logo || null,
      score: null,
    },
    inning: null,
    inningHalf: null,
    time: g.date_info?.time || '',
    dateUTC: g.date_info?.datetime_utc || '',
    venue: g.location?.facility || '',
    location: g.location?.location || '',
    neutral: g.location?.han === 'N',
    conference: g.conference_game || false,
    doubleheader: g.doubleheader || false,
    broadcastId: null, // Will be extracted from livestats URL if StatBroadcast
    livestatsURL: g.media?.livestats || null,
    livestatsFeed: g.media?.livestats_feed || null,
    videoURL: g.media?.video || null,
    sidearmSchoolId: g.school_id,
  };

  // Extract StatBroadcast broadcast ID from livestats URL if present
  // e.g. "https://stats.statbroadcast.com/broadcast/?id=631932"
  const liveURL = g.media?.livestats || '';
  const sbMatch = liveURL.match(/statbroadcast\.com\/broadcast\/\?id=(\d+)/);
  if (sbMatch) game.broadcastId = sbMatch[1];

  return game;
}

class SidearmPoller {
  constructor() {
    this.games = [];
    this.lastFetch = 0;
    this.running = false;
    this.pollInterval = 60000; // Check for new games every 60s
  }

  async fetchGames(date) {
    const url = buildURL(date || new Date());
    try {
      const raw = await fetch(url);
      const json = JSON.parse(raw);
      if (json.error) {
        console.log(`[Sidearm] API error: ${json.error}`);
        return;
      }
      const allGames = json.data || [];
      const baseball = allGames.map(parseGame).filter(Boolean);
      this.games = baseball;
      this.lastFetch = Date.now();
      console.log(`[Sidearm] ${baseball.length} baseball games (from ${allGames.length} total events)`);
    } catch (err) {
      console.log(`[Sidearm] Fetch failed: ${err.message}`);
    }
  }

  getGames() { return this.games; }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[Sidearm] Starting poller (60s interval)');
    this.fetchGames();
    this._loop();
  }

  async _loop() {
    while (this.running) {
      await new Promise(r => setTimeout(r, this.pollInterval));
      await this.fetchGames();
    }
  }

  stop() { this.running = false; }
}

module.exports = { SidearmPoller };
