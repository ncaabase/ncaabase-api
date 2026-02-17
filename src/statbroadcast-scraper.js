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

  // Strategy: Parse the "This Week at a Glance" table which has the cleanest data
  // Format: "Team1 Score1, Team2 Score2 - Status" or "Team1 Score1, Team2 Score2 - FINAL"
  // Baseball rows are marked with "BASE" or "Baseball"
  
  // Extract all baseball entries from the week-at-a-glance table
  // Pattern: "TeamA #, TeamB # - Status | BASE Baseball | LIVE/Stats link"
  const baseballRegex = /([^|<]+?\d+,\s*[^|<]+?\d+)\s*-\s*([^|<]+?)\s*\|\s*BASE\s+Baseball/gi;
  const pregameRegex = /([^|<]+?)\s+(?:vs\.\s*|at\s+)([^|<]+?)\s*\|\s*BASE\s+Baseball/gi;
  
  // Also try the cleaner format from the table
  // Look for rows like: "Feb 13 | Kentucky 3, UNC Greensboro 0 - T3rd | BASE Baseball | LIVE"
  const rowRegex = /(?:Feb|Mar|Apr|May|Jun)\s+\d+\s*\|?\s*(.+?)\s*\|\s*BASE\s+Baseball\s*\|\s*(LIVE|STATS|Book)/gi;
  
  let match;

  // Method 1: Parse structured event rows from table
  // Look for patterns like "Kentucky 3, UNC Greensboro 0 - T3rd   -- In Progress"
  const scorePattern = /([A-Za-z\s.&'()-]+?)\s+(\d+),\s*([A-Za-z\s.&'()-]+?)\s+(\d+)\s*-\s*([A-Za-z0-9\s]+?)(?:\s*--\s*(In Progress|In Progress|Final))?/g;
  
  while ((match = scorePattern.exec(html)) !== null) {
    const [, team1Name, score1, team2Name, score2, statusText, progressFlag] = match;
    
    // Check if this is in a baseball context (look backwards for "BASE" or "Baseball")
    const contextStart = Math.max(0, match.index - 200);
    const context = html.slice(contextStart, match.index + match[0].length + 200);
    if (!/BASE|Baseball/i.test(context)) continue;
    
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    const statusStr = (statusText || '').trim();
    
    let status = 'pre';
    let inning = 0;
    let half = 'top';
    
    if (/FINAL/i.test(statusStr)) {
      status = 'final';
      inning = 9; // default, could be different for extras
      // Check for extra innings: "FINAL (10)" pattern
      const extraMatch = statusStr.match(/FINAL\s*\((\d+)\)/i);
      if (extraMatch) inning = parseInt(extraMatch[1]);
    } else if (/In Progress/i.test(progressFlag || context)) {
      status = 'live';
      // Parse inning from status like "T3rd", "B5th", "Top 7th", "Bot 2nd"
      const innMatch = statusStr.match(/(?:T|Top)\s*(\d+)/i);
      const botMatch = statusStr.match(/(?:B|Bot|Bottom)\s*(\d+)/i);
      const midMatch = statusStr.match(/(?:M|Mid|Middle)\s*(\d+)/i);
      const endMatch = statusStr.match(/(?:E|End)\s*(\d+)/i);
      if (innMatch) { inning = parseInt(innMatch[1]); half = 'top'; }
      else if (botMatch) { inning = parseInt(botMatch[1]); half = 'bottom'; }
      else if (midMatch) { inning = parseInt(midMatch[1]); half = 'bottom'; }
      else if (endMatch) { inning = parseInt(endMatch[1]); half = 'top'; }
      else {
        // Try plain number
        const numMatch = statusStr.match(/(\d+)/);
        if (numMatch) inning = parseInt(numMatch[1]);
      }
    } else if (statusStr && !/Pregame|PPD|Delayed/i.test(statusStr)) {
      // Has a status that isn't pregame — probably live
      status = 'live';
      const innMatch = statusStr.match(/(?:T|Top)\s*(\d+)/i);
      const botMatch = statusStr.match(/(?:B|Bot|Bottom)\s*(\d+)/i);
      if (innMatch) { inning = parseInt(innMatch[1]); half = 'top'; }
      else if (botMatch) { inning = parseInt(botMatch[1]); half = 'bottom'; }
      else {
        const numMatch = statusStr.match(/(\d+)(?:st|nd|rd|th)/i);
        if (numMatch) inning = parseInt(numMatch[1]);
      }
    }
    
    // Determine which team is home (host school is usually home)
    const t1 = findTeam(team1Name.trim());
    const t2 = findTeam(team2Name.trim());
    
    // The host school on their StatBroadcast page is listed first when they're the home team
    // but "at" games show them second. Use the hostGid to determine.
    let homeTeam, awayTeam, homeScore, awayScore;
    if (t1 && t1.gid === hostGid) {
      // Host is team1 — but are they home or away?
      // On StatBroadcast landing pages, the format is typically "Visitor Score, Home Score"
      // So team1 is the visitor (away team listed first)
      awayTeam = t1; awayScore = s1;
      homeTeam = t2 || { name: team2Name.trim(), abbr: team2Name.trim().substring(0,4).toUpperCase(), conf: null };
      homeScore = s2;
    } else if (t2 && t2.gid === hostGid) {
      awayTeam = t1 || { name: team1Name.trim(), abbr: team1Name.trim().substring(0,4).toUpperCase(), conf: null };
      awayScore = s1;
      homeTeam = t2; homeScore = s2;
    } else {
      // Neither matched as host — just use order as-is (first is visitor)
      awayTeam = t1 || { name: team1Name.trim(), abbr: team1Name.trim().substring(0,4).toUpperCase(), conf: null };
      awayScore = s1;
      homeTeam = t2 || { name: team2Name.trim(), abbr: team2Name.trim().substring(0,4).toUpperCase(), conf: null };
      homeScore = s2;
    }
    
    // Extract event ID from nearby Live Stats link
    let eventId = null;
    const idMatch = context.match(/broadcast\/\?id=(\d+)/);
    if (idMatch) eventId = idMatch[1];
    
    const gameId = eventId ? `sb-${eventId}` : `sb-${hostGid}-${awayTeam.abbr}-${homeTeam.abbr}`;
    
    // Skip duplicates
    if (games.find(g => g.id === gameId)) continue;
    
    games.push({
      id: gameId,
      eventId,
      source: 'statbroadcast',
      sourceGid: hostGid,
      status,
      inning,
      half,
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
      winProb: { away: 50, home: 50 },
      venue: '',
      startTime: '',
      updatedAt: new Date().toISOString(),
    });
  }

  // Method 2: Parse the "Today's Events" section for live games with more detail
  // This section has structured divs with team logos, scores, and live/pregame status
  // Pattern in HTML: team logo images with alt text, scores in text nodes
  // Look for the broadcast event ID pattern
  const liveEventPattern = /broadcast\/\?id=(\d+)/g;
  const eventIds = new Set();
  while ((match = liveEventPattern.exec(html)) !== null) {
    eventIds.add(match[1]);
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

  // Full scan: check ALL verified GIDs for baseball activity
  async fullScan() {
    console.log(`[SB] Starting full scan of ${TEAMS.length} schools...`);
    const startTime = Date.now();
    this.activeGids.clear();
    
    // Scan in batches of 10 to avoid overwhelming
    for (let i = 0; i < TEAMS.length; i += 10) {
      const batch = TEAMS.slice(i, i + 10);
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
