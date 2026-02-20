// PEARatings API Poller
// Endpoint: pearatings.com/api/cbase/schedule/today?season=YYYY
// Returns today's D1 baseball games with teams, times, win probability, GQI, conferences
// This is our SCHEDULE source — tells us what games are happening today
// Does NOT provide live scores (all games show score: "SCH")

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

function parseGame(g) {
  const homeTeam = findTeam(g.home_team) || { name: g.home_team, abbr: g.home_team.substring(0,4).toUpperCase(), conf: g.home_conference || '' };
  const awayTeam = findTeam(g.away_team) || { name: g.away_team, abbr: g.away_team.substring(0,4).toUpperCase(), conf: g.away_conference || '' };
  // Determine status from score field
  let status = 'pre';
  let homeScore = null;
  let awayScore = null;

  if (!g.score || g.score === 'SCH') {
    status = 'pre';
  } else {
    // Completed game. Format: "WinnerName Score-Score" e.g. "Kansas St. 24-5"
    const scoreMatch = g.score.match(/(\d+)-(\d+)\s*$/);
    if (scoreMatch) {
      const highScore = parseInt(scoreMatch[1]);
      const lowScore = parseInt(scoreMatch[2]);

      // 0-0 with null Time likely means cancelled/postponed — skip this game
      if (highScore === 0 && lowScore === 0) {
        status = 'cancelled';
        homeScore = 0;
        awayScore = 0;
      } else {
        status = 'final';

        // Figure out which team won by checking if winner name is in the score string
        const scoreName = g.score.replace(/\s*\d+-\d+\s*$/, '').trim().toLowerCase();
        const homeName = (g.home_team || '').toLowerCase();
        const awayName = (g.away_team || '').toLowerCase();

        if (scoreName.includes(homeName) || homeName.includes(scoreName)) {
          // Home team won
          homeScore = highScore;
          awayScore = lowScore;
        } else if (scoreName.includes(awayName) || awayName.includes(scoreName)) {
          // Away team won
          awayScore = highScore;
          homeScore = lowScore;
        } else {
          // Can't determine — assign high to home as default
          homeScore = highScore;
          awayScore = lowScore;
        }
      }
    }
  }

  const homeWinProb = g.home_win_prob || 0.5;
  const awayWinProb = 1 - homeWinProb;

  return {
    id: `pear-${g.Date}-${(awayTeam.abbr || '').replace(/\s/g,'')}-${(homeTeam.abbr || '').replace(/\s/g,'')}`,
    source: 'pear',
    status,
    home: {
      name: g.home_team || homeTeam.name,
      canonical: homeTeam.name,
      abbr: homeTeam.abbr,
      conf: homeTeam.conf || g.home_conference || '',
      score: homeScore,
      rank: g.home_net ? Math.round(g.home_net) : null,
      record: '',
      hits: null,
      errors: null,
      lineScore: [],
    },
    away: {
      name: g.away_team || awayTeam.name,
      canonical: awayTeam.name,
      abbr: awayTeam.abbr,
      conf: awayTeam.conf || g.away_conference || '',
      score: awayScore,
      rank: g.away_net ? Math.round(g.away_net) : null,
      record: '',
      hits: null,
      errors: null,
      lineScore: [],
    },
    inning: null,
    half: null,
    date: g.Date || '',
    time: g.Time || '',
    venue: '',
    neutral: g.Location === 'Neutral',
    conference: g.is_conference_game || false,
    gqi: g.GQI || 0,
    winProb: {
      home: Math.round(homeWinProb * 100),
      away: Math.round(awayWinProb * 100),
    },
    pear: g.PEAR || '',
    updatedAt: new Date().toISOString(),
  };
}

class PearPoller {
  constructor() {
    this.games = [];
    this.lastFetch = 0;
    this.running = false;
    this.pollInterval = 5 * 60 * 1000; // Check every 5 minutes (schedule doesn't change often)
  }

  async fetchGames() {
    const season = new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://pearatings.com/api/cbase/schedule/today?season=${season}`;
    try {
      const raw = await fetch(url);
      const json = JSON.parse(raw);
      const allGames = json.games || [];
      // Filter to only today's games by Date field
      const todayGames = allGames.filter(g => g.Date === today);
      this.games = todayGames.map(parseGame).filter(Boolean);
      this.lastFetch = Date.now();
      console.log(`[PEAR] ${this.games.length} D1 baseball games for ${today} (${allGames.length} total in API response)`);
    } catch (err) {
      console.log(`[PEAR] Fetch failed: ${err.message}`);
    }
  }

  async fetchByDate(dateStr) {
    // dateStr like "2026-02-15"
    const season = new Date().getFullYear();
    const url = `https://pearatings.com/api/cbase/schedule/today?season=${season}&date=${dateStr}`;
    try {
      const raw = await fetch(url);
      const json = JSON.parse(raw);
      const allGames = json.games || [];
      // Filter to only games matching the requested date
      const dated = allGames.filter(g => g.Date === dateStr);
      const games = dated.map(parseGame).filter(Boolean);
      console.log(`[PEAR] ${games.length} games for ${dateStr} (${allGames.length} total in API response)`);
      return games;
    } catch (err) {
      console.log(`[PEAR] Fetch by date failed: ${err.message}`);
      return [];
    }
  }

  // Fetch entire season schedule for a team
  async fetchTeamSchedule(teamName) {
    const season = new Date().getFullYear();
    // PEAR doesn't have a per-team endpoint, so we fetch the full season
    // We'll scan Feb through June by fetching each date range
    const allGames = [];
    const seen = new Set();

    // Fetch a wide date range — PEAR returns games near the date param
    const dates = [];
    for (let m = 2; m <= 6; m++) {
      dates.push(`${season}-${String(m).padStart(2,'0')}-01`);
      dates.push(`${season}-${String(m).padStart(2,'0')}-15`);
    }

    for (const dateStr of dates) {
      try {
        const url = `https://pearatings.com/api/cbase/schedule/today?season=${season}&date=${dateStr}`;
        const raw = await fetch(url);
        const json = JSON.parse(raw);
        const games = json.games || [];
        const teamLower = teamName.toLowerCase();
        for (const g of games) {
          const h = (g.home_team || '').toLowerCase();
          const a = (g.away_team || '').toLowerCase();
          if (h.includes(teamLower) || teamLower.includes(h) || a.includes(teamLower) || teamLower.includes(a)) {
            const key = `${g.Date}-${g.home_team}-${g.away_team}`;
            if (!seen.has(key)) {
              seen.add(key);
              const parsed = parseGame(g);
              if (parsed) allGames.push(parsed);
            }
          }
        }
      } catch (e) { /* skip date */ }
    }

    // Sort by date
    allGames.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    console.log(`[PEAR] Team schedule for "${teamName}": ${allGames.length} games`);
    return allGames;
  }

  getGames() { return this.games; }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[PEAR] Starting poller (5min interval)');
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

module.exports = { PearPoller };
