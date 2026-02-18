// StatBroadcast Landing Page Scraper — LIVE GAMES ONLY
// Scrapes server-rendered HTML from statbroadcast.com/events/statbroadcast.php?gid={gid}
// ONLY outputs games that have the "LIVE" button (currently in progress)
// Does NOT output finals or upcoming — PEARatings handles the schedule

const https = require('https');
const http = require('http');
const { TEAMS, BY_GID, findTeam } = require('./teams');

// ─── HTTP Fetcher ───

function fetch(url, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── HTML Parser ───
// Only parses LIVE baseball games from StatBroadcast landing pages
// 
// HTML structure per row:
//   <tr class=' search-item'>
//     <td class='pl-1'>Feb 18</td>
//     <td class='search'>TeamA Score, TeamB Score - T3rd</td>
//     <td class='search'><span>BASE</span><span>Baseball</span></td>
//     <td><a class="btn btn-live btn-sm ... live" href="...broadcast/?id=XXXXX">LIVE</a></td>
//   </tr>
//
// Key: LIVE games have "btn-live" class AND "LIVE" text in the last column
// FINAL games have "archived.php" links — we SKIP these
// Upcoming games have "vs." or "at" without scores — we SKIP these

function parseGames(html, hostGid) {
  const games = [];
  const hostTeam = BY_GID[hostGid];
  if (!hostTeam) return games;

  // Split HTML into table rows
  const rowRegex = /<tr[^>]*class=['"][^'"]*search-item[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // MUST be baseball
    if (!/>\s*BASE\s*<|>\s*Baseball\s*</i.test(row)) continue;

    // MUST have LIVE button — this is the key filter
    const isLive = /btn-live/i.test(row) && />\s*LIVE\s*</i.test(row);
    if (!isLive) continue;

    // Extract the score text: "TeamA Score, TeamB Score - Status"
    const eventMatch = row.match(/<td[^>]*class=['"]search['"][^>]*>([^<]+)<\/td>/);
    if (!eventMatch) continue;
    const eventText = eventMatch[1].trim();

    // Parse scores: "TeamA 3, TeamB 1 - T5th"
    const scoreMatch = eventText.match(/^(.+?)\s+(\d+),\s*(.+?)\s+(\d+)(?:\s*-\s*(.+))?$/);
    if (!scoreMatch) continue;

    const [, team1Name, score1, team2Name, score2, statusText] = scoreMatch;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    const statusStr = (statusText || '').trim();

    // Parse inning from status like "T3rd", "B5th", "Top 7th", "Bot 2nd"
    let inning = 1;
    let half = 'top';
    const topMatch = statusStr.match(/(?:T|Top)\s*(\d+)/i);
    const botMatch = statusStr.match(/(?:B|Bot|Bottom)\s*(\d+)/i);
    const midMatch = statusStr.match(/(?:M|Mid|Middle)\s*(\d+)/i);
    const endMatch = statusStr.match(/(?:E|End)\s*(\d+)/i);
    if (topMatch) { inning = parseInt(topMatch[1]); half = 'top'; }
    else if (botMatch) { inning = parseInt(botMatch[1]); half = 'bottom'; }
    else if (midMatch) { inning = parseInt(midMatch[1]); half = 'mid'; }
    else if (endMatch) { inning = parseInt(endMatch[1]); half = 'end'; }
    else {
      const numMatch = statusStr.match(/(\d+)(?:st|nd|rd|th)/i);
      if (numMatch) inning = parseInt(numMatch[1]);
    }

    // Determine home/away teams
    const t1 = findTeam(team1Name.trim());
    const t2 = findTeam(team2Name.trim());

    let homeTeam, awayTeam, homeScore, awayScore;
    if (t1 && t1.gid === hostGid) {
      awayTeam = t1; awayScore = s1;
      homeTeam = t2 || { name: team2Name.trim(), abbr: team2Name.trim().substring(0,4).toUpperCase(), conf: '' };
      homeScore = s2;
    } else if (t2 && t2.gid === hostGid) {
      awayTeam = t1 || { name: team1Name.trim(), abbr: team1Name.trim().substring(0,4).toUpperCase(), conf: '' };
      awayScore = s1;
      homeTeam = t2; homeScore = s2;
    } else {
      awayTeam = t1 || { name: team1Name.trim(), abbr: team1Name.trim().substring(0,4).toUpperCase(), conf: '' };
      awayScore = s1;
      homeTeam = t2 || { name: team2Name.trim(), abbr: team2Name.trim().substring(0,4).toUpperCase(), conf: '' };
      homeScore = s2;
    }

    // Extract broadcast event ID
    let eventId = null;
    const idMatch = row.match(/broadcast\/\?id=(\d+)/);
    if (idMatch) eventId = idMatch[1];

    const gameId = eventId ? `sb-${eventId}` : `sb-${hostGid}-${(awayTeam.abbr||'').replace(/\s/g,'')}-${(homeTeam.abbr||'').replace(/\s/g,'')}`;

    // Skip duplicates
    if (games.find(g => g.id === gameId)) continue;

    games.push({
      id: gameId,
      eventId,
      source: 'statbroadcast',
      sourceGid: hostGid,
      status: 'live',
      inning,
      half,
      away: {
        name: awayTeam.name,
        abbr: awayTeam.abbr,
        rank: null,
        record: '',
        conf: awayTeam.conf || '',
        score: awayScore,
        hits: null,
        errors: null,
        lineScore: [],
      },
      home: {
        name: homeTeam.name,
        abbr: homeTeam.abbr,
        rank: null,
        record: '',
        conf: homeTeam.conf || '',
        score: homeScore,
        hits: null,
        errors: null,
        lineScore: [],
      },
      runners: { first: false, second: false, third: false },
      venue: '',
      startTime: '',
      updatedAt: new Date().toISOString(),
    });
  }

  return games;
}

// ─── Scraper Controller ───

class StatBroadcastScraper {
  constructor() {
    this.games = new Map(); // gameId -> game object
    this.activeGids = new Set(); // GIDs currently returning live games
    this.lastFullScan = 0;
    this.scanInterval = 5 * 60 * 1000; // Full scan every 5 minutes
    this.pollInterval = 10 * 1000; // Active game poll every 10 seconds
    this.running = false;
    this.stats = { totalPolls: 0, errors: 0, lastPoll: null };
  }

  // Full scan: check all schools with verified GIDs
  async fullScan() {
    const teamsWithGid = TEAMS.filter(t => t.gid);
    console.log(`[SB] Scanning ${teamsWithGid.length} schools for live games...`);
    const startTime = Date.now();
    this.activeGids.clear();
    this.games.clear(); // Clear old games — only live games matter

    for (let i = 0; i < teamsWithGid.length; i += 10) {
      const batch = teamsWithGid.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(team => this.scrapeSchool(team.gid))
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled' && results[j].value.length > 0) {
          this.activeGids.add(batch[j].gid);
          for (const game of results[j].value) {
            this.games.set(game.id, game);
          }
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    this.lastFullScan = Date.now();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SB] Scan complete in ${elapsed}s — ${this.games.size} live games from ${this.activeGids.size} schools`);
  }

  async scrapeSchool(gid) {
    const url = `https://www.statbroadcast.com/events/statbroadcast.php?gid=${gid}`;
    try {
      const html = await fetch(url);
      const games = parseGames(html, gid);
      this.stats.totalPolls++;
      this.stats.lastPoll = new Date().toISOString();
      return games;
    } catch (err) {
      this.stats.errors++;
      return [];
    }
  }

  async pollActive() {
    if (this.activeGids.size === 0) return;

    const gids = [...this.activeGids];
    const results = await Promise.allSettled(
      gids.map(gid => this.scrapeSchool(gid))
    );

    // Rebuild live games from active schools
    const newGames = new Map();
    let liveCount = 0;

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        const games = results[i].value;
        for (const game of games) {
          newGames.set(game.id, game);
          liveCount++;
        }
        // If school returned no live games, remove from active set
        if (games.length === 0) {
          this.activeGids.delete(gids[i]);
        }
      }
    }

    // Replace game store with fresh live data
    this.games = newGames;

    if (liveCount > 0) {
      console.log(`[SB] ${liveCount} live games from ${this.activeGids.size} schools`);
    }
  }

  getGames() { return [...this.games.values()]; }
  getLiveGames() { return this.getGames(); } // All games are live

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[SB] StatBroadcast scraper starting (live games only)...');
    this.fullScan().then(() => {
      this._pollLoop();
      this._scanLoop();
    });
  }

  async _pollLoop() {
    while (this.running) {
      await this.pollActive();
      await new Promise(r => setTimeout(r, this.pollInterval));
    }
  }

  async _scanLoop() {
    while (this.running) {
      await new Promise(r => setTimeout(r, this.scanInterval));
      await this.fullScan();
    }
  }

  stop() { this.running = false; }

  getStats() {
    return {
      ...this.stats,
      activeSchools: this.activeGids.size,
      liveGames: this.games.size,
    };
  }
}

module.exports = { StatBroadcastScraper };
