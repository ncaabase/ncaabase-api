// StatBroadcast Landing Page Scraper
// Scrapes server-rendered HTML from statbroadcast.com/events/statbroadcast.php?gid={gid}
// These pages contain live scores, inning, and game status directly in HTML (no JS needed)
// Public feeds run at intentional 5-10 second delay behind real-time

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
      // Follow redirects
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
// Parses the StatBroadcast landing page HTML to extract baseball game info
// The page structure from Kentucky example:
//
// <div class="pointed-event"> or similar event container
//   <span class="pointed-event-sport">Baseball</span>
//   Team name with score: "Kentucky" "3" "T3rd" "UNC Greensboro" "0"
//   Link to Live Stats: stats.statbroadcast.com/broadcast/?id=635984
//
// The page also contains a "This Week at a Glance" table with:
//   "Kentucky 3, UNC Greensboro 0 - T3rd   -- In Progress"
//   "Kentucky 5, Stanford 0 - FINAL"

function parseGames(html, hostGid) {
  const games = [];
  const hostTeam = BY_GID[hostGid];
  if (!hostTeam) return games;

  // Strategy: Parse the table rows (tr class='search-item') from the week-at-a-glance table
  // Each row structure:
  //   <tr class=' search-item'>
  //     <td class='pl-1'>Feb 18</td>
  //     <td class='search'>TeamA Score, TeamB Score - STATUS</td>
  //     <td class='search'><span>BASE</span><span>Baseball</span></td>
  //     <td>LIVE button or Book link or archived link</td>
  //   </tr>
  //
  // Status patterns:
  //   FINAL:    "Kentucky 13, UNC Greensboro 2 - FINAL"
  //   LIVE:     "Kentucky 3, Stanford 0 - T3rd" with nearby "LIVE" button and broadcast link
  //   UPCOMING: "Kentucky at Evansville" (no score, "vs." or "at")
  //
  // Key insight: LIVE games have btn-live class and "LIVE" text nearby
  // FINAL games have "archived.php" links nearby
  // We parse each <tr> as a unit to get proper context

  // Split HTML into table rows
  const rowRegex = /<tr[^>]*class=['"][^'"]*search-item[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // Check if this row is baseball (contains BASE or Baseball)
    if (!/>\s*BASE\s*<|>\s*Baseball\s*</i.test(row)) continue;

    // Extract date
    const dateMatch = row.match(/<td[^>]*>\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\s+\d+)\s*<\/td>/i);
    const dateStr = dateMatch ? dateMatch[1].trim() : '';

    // Extract the event text (score or matchup)
    const eventMatch = row.match(/<td[^>]*class=['"]search['"][^>]*>([^<]+)<\/td>/);
    if (!eventMatch) continue;
    const eventText = eventMatch[1].trim();

    // Check if this is a live game (has btn-live class and "LIVE" text)
    const isLive = /btn-live|class="[^"]*live[^"]*"/i.test(row) && />\s*LIVE\s*</i.test(row);
    
    // Check if this is a final/archived game
    const isFinal = /archived\.php/i.test(row) || /FINAL/i.test(eventText);

    // Check if this is an upcoming game (uses "vs." or "at" without scores)
    const isUpcoming = /\s+(?:vs\.?|at)\s+/i.test(eventText) && !/\d+,/.test(eventText);

    // Parse scores: "TeamA Score, TeamB Score - Status"
    const scoreMatch = eventText.match(/^(.+?)\s+(\d+),\s*(.+?)\s+(\d+)(?:\s*-\s*(.+))?$/);
    
    if (!scoreMatch && !isUpcoming) continue;

    if (isUpcoming) {
      // Skip upcoming games for now — Sidearm handles schedule
      continue;
    }

    if (!scoreMatch) continue;

    const [, team1Name, score1, team2Name, score2, statusText] = scoreMatch;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    const statusStr = (statusText || '').trim();

    let status = 'final'; // Default to final for safety
    let inning = 9;
    let half = 'top';

    if (isLive) {
      status = 'live';
      inning = 1; // default
      half = 'top';
      // Parse inning from status like "T3rd", "B5th", "Top 7th", "Bot 2nd"
      const innMatch = statusStr.match(/(?:T|Top)\s*(\d+)/i);
      const botMatch = statusStr.match(/(?:B|Bot|Bottom)\s*(\d+)/i);
      const midMatch = statusStr.match(/(?:M|Mid|Middle)\s*(\d+)/i);
      const endMatch = statusStr.match(/(?:E|End)\s*(\d+)/i);
      if (innMatch) { inning = parseInt(innMatch[1]); half = 'top'; }
      else if (botMatch) { inning = parseInt(botMatch[1]); half = 'bottom'; }
      else if (midMatch) { inning = parseInt(midMatch[1]); half = 'mid'; }
      else if (endMatch) { inning = parseInt(endMatch[1]); half = 'end'; }
      else {
        const numMatch = statusStr.match(/(\d+)(?:st|nd|rd|th)/i);
        if (numMatch) inning = parseInt(numMatch[1]);
      }
    } else if (isFinal) {
      status = 'final';
      inning = 9;
      const extraMatch = statusStr.match(/\((\d+)\)/);
      if (extraMatch) inning = parseInt(extraMatch[1]);
    }

    // Determine home/away teams
    const t1 = findTeam(team1Name.trim());
    const t2 = findTeam(team2Name.trim());

    let homeTeam, awayTeam, homeScore, awayScore;
    if (t1 && t1.gid === hostGid) {
      awayTeam = t1; awayScore = s1;
      homeTeam = t2 || { name: team2Name.trim(), abbr: team2Name.trim().substring(0,4).toUpperCase(), conf: null };
      homeScore = s2;
    } else if (t2 && t2.gid === hostGid) {
      awayTeam = t1 || { name: team1Name.trim(), abbr: team1Name.trim().substring(0,4).toUpperCase(), conf: null };
      awayScore = s1;
      homeTeam = t2; homeScore = s2;
    } else {
      awayTeam = t1 || { name: team1Name.trim(), abbr: team1Name.trim().substring(0,4).toUpperCase(), conf: null };
      awayScore = s1;
      homeTeam = t2 || { name: team2Name.trim(), abbr: team2Name.trim().substring(0,4).toUpperCase(), conf: null };
      homeScore = s2;
    }

    // Extract event ID from broadcast link
    let eventId = null;
    const idMatch = row.match(/broadcast\/\?id=(\d+)/);
    if (idMatch) eventId = idMatch[1];
    // Also try archived link
    if (!eventId) {
      const archMatch = row.match(/archived\.php\?id=(\d+)/);
      if (archMatch) eventId = archMatch[1];
    }

    const gameId = eventId ? `sb-${eventId}` : `sb-${hostGid}-${(awayTeam.abbr||'').replace(/\s/g,'')}-${(homeTeam.abbr||'').replace(/\s/g,'')}`;

    // Skip duplicates
    if (games.find(g => g.id === gameId)) continue;

    // Extract venue from row if available
    let venue = '';

    games.push({
      id: gameId,
      eventId,
      source: 'statbroadcast',
      sourceGid: hostGid,
      status,
      inning,
      half,
      date: dateStr,
      outs: 0,
      balls: 0,
      strikes: 0,
      sortTime: 0,
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
      pitcher: null,
      hitter: null,
      venue,
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
    this.activeGids = new Set(); // GIDs with current/upcoming baseball games
    this.lastFullScan = 0;
    this.scanInterval = 5 * 60 * 1000; // Full scan every 5 minutes
    this.pollInterval = 10 * 1000; // Active game poll every 10 seconds
    this.running = false;
    this.stats = { totalPolls: 0, errors: 0, lastPoll: null };
  }

  // Full scan: check all schools with verified GIDs for baseball activity
  async fullScan() {
    const teamsWithGid = TEAMS.filter(t => t.gid);
    console.log(`[SB] Starting full scan of ${teamsWithGid.length} verified schools...`);
    const startTime = Date.now();
    this.activeGids.clear();
    
    // Scan in batches of 10 to avoid overwhelming
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
      
      // Small delay between batches
      await new Promise(r => setTimeout(r, 200));
    }
    
    this.lastFullScan = Date.now();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SB] Full scan complete in ${elapsed}s — ${this.activeGids.size} active schools, ${this.games.size} games found`);
  }

  // Scrape a single school's StatBroadcast page
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
      // Don't log every error — they're usually timeouts
      return [];
    }
  }

  // Fast poll: only check schools with active games
  async pollActive() {
    if (this.activeGids.size === 0) return;
    
    const gids = [...this.activeGids];
    const results = await Promise.allSettled(
      gids.map(gid => this.scrapeSchool(gid))
    );
    
    let updated = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        const games = results[i].value;
        for (const game of games) {
          const existing = this.games.get(game.id);
          // Only update if something changed
          if (!existing || existing.home.score !== game.home.score ||
              existing.away.score !== game.away.score ||
              existing.inning !== game.inning ||
              existing.status !== game.status) {
            this.games.set(game.id, game);
            updated++;
          }
        }
        // If school has no more active games, remove from active set
        if (games.every(g => g.status === 'final')) {
          // Keep it for a bit longer in case new games start
        }
      }
    }
    
    if (updated > 0) {
      console.log(`[SB] Poll: ${updated} game updates from ${gids.length} active schools`);
    }
  }

  // Get all current games
  getGames() {
    return [...this.games.values()];
  }

  // Get live games only
  getLiveGames() {
    return [...this.games.values()].filter(g => g.status === 'live');
  }

  // Start the polling loop
  start() {
    if (this.running) return;
    this.running = true;
    console.log('[SB] StatBroadcast scraper starting...');
    
    // Initial full scan
    this.fullScan().then(() => {
      // Start fast polling loop for active games
      this._pollLoop();
      // Schedule periodic full scans
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

  stop() {
    this.running = false;
    console.log('[SB] StatBroadcast scraper stopped');
  }

  getStats() {
    return {
      ...this.stats,
      activeSchools: this.activeGids.size,
      totalGames: this.games.size,
      liveGames: this.getLiveGames().length,
    };
  }
}

module.exports = { StatBroadcastScraper };
