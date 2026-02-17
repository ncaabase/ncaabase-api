// ESPN College Baseball Scoreboard Poller
// Secondary source — polls every 30 seconds
// Catches games from schools not on StatBroadcast
// ESPN API is free, public, and structured JSON

const https = require('https');
const { findTeam } = require('./teams');

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/scoreboard';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'NCAABase/1.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function ord(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function parseESPNGame(event) {
  const comp = event.competitions?.[0];
  if (!comp) return null;

  // Determine status
  const stateStr = comp.status?.type?.state || '';
  let status = 'pre';
  if (stateStr === 'in') status = 'live';
  else if (stateStr === 'post') status = 'final';

  // Parse inning
  let inning = 0, half = 'top';
  const detail = comp.status?.type?.detail || '';
  const topMatch = detail.match(/Top\s+(\d+)/i);
  const botMatch = detail.match(/(?:Bot|Bottom)\s+(\d+)/i);
  const midMatch = detail.match(/Mid\s+(\d+)/i);
  const endMatch = detail.match(/End\s+(\d+)/i);
  if (topMatch) { inning = parseInt(topMatch[1]); half = 'top'; }
  else if (botMatch) { inning = parseInt(botMatch[1]); half = 'bottom'; }
  else if (midMatch) { inning = parseInt(midMatch[1]); half = 'bottom'; }
  else if (endMatch) { inning = parseInt(endMatch[1]); half = 'top'; }
  else if (status === 'final') {
    // Try to get final inning count
    const finalMatch = detail.match(/Final(?:\s*\/\s*(\d+))?/i);
    inning = finalMatch?.[1] ? parseInt(finalMatch[1]) : 9;
  }

  // Parse competitors
  let home = null, away = null;
  for (const c of comp.competitors || []) {
    if (c.homeAway === 'home') home = c;
    else away = c;
  }
  if (!home || !away) return null;

  function parseCompetitor(c) {
    const teamData = findTeam(c.team?.displayName) || findTeam(c.team?.shortDisplayName);
    const name = teamData?.name || c.team?.displayName || c.team?.name || 'Unknown';
    const abbr = teamData?.abbr || c.team?.abbreviation || '???';
    const conf = teamData?.conf || '';
    const rank = c.curatedRank?.current <= 25 ? c.curatedRank.current : null;
    const record = c.records?.find(r => r.type === 'total' || r.type === 'overall')?.summary || '';
    const score = parseInt(c.score) || 0;
    const lineScore = (c.linescores || []).map(l => l.value != null ? l.value : null);
    // ESPN sometimes provides hits and errors in statistics
    const stats = c.statistics || [];
    let hits = null, errors = null;
    for (const s of stats) {
      if (s.name === 'hits') hits = parseInt(s.displayValue) || null;
      if (s.name === 'errors') errors = parseInt(s.displayValue) || null;
    }
    return { name, abbr, rank, record, conf, score, hits, errors, lineScore };
  }

  const awayData = parseCompetitor(away);
  const homeData = parseCompetitor(home);

  // Situation data (runners, outs, count, pitcher, hitter)
  const sit = comp.situation || {};
  const runners = {
    first: !!sit.onFirst,
    second: !!sit.onSecond,
    third: !!sit.onThird,
  };
  const outs = sit.outs || 0;
  const balls = sit.balls || 0;
  const strikes = sit.strikes || 0;

  const pitcher = sit.pitcher ? {
    name: sit.pitcher.athlete?.displayName || sit.pitcher.displayName || null,
    throws: null,
    pitchCount: sit.pitcher.pitchCount || 0,
  } : null;

  const hitter = sit.batter ? {
    name: sit.batter.athlete?.displayName || sit.batter.displayName || null,
    bats: null,
    avg: sit.batter.average || null,
  } : null;

  // Time
  const startDate = event.date ? new Date(event.date) : null;
  const startTime = startDate ? startDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET' : '';
  const sortTime = startDate ? startDate.getHours() * 100 + startDate.getMinutes() : 1200;

  // Venue
  const venue = comp.venue?.fullName || comp.venue?.address?.city || '';

  return {
    id: `espn-${event.id}`,
    espnId: event.id,
    source: 'espn',
    status,
    inning,
    half,
    outs,
    balls,
    strikes,
    sortTime,
    away: awayData,
    home: homeData,
    runners,
    pitcher,
    hitter,
    winProb: { away: 50, home: 50 },
    venue,
    startTime,
    updatedAt: new Date().toISOString(),
  };
}

class ESPNPoller {
  constructor() {
    this.games = new Map();
    this.pollInterval = 30 * 1000; // 30 seconds
    this.running = false;
    this.stats = { totalPolls: 0, errors: 0, lastPoll: null };
  }

  async poll(dateStr) {
    // dateStr format: YYYYMMDD
    const d = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const url = `${ESPN_BASE}?dates=${d}&limit=200&groups=50`;
    
    try {
      const data = await fetchJSON(url);
      const events = data.events || [];
      const games = events.map(parseESPNGame).filter(Boolean);
      
      for (const game of games) {
        this.games.set(game.id, game);
      }
      
      this.stats.totalPolls++;
      this.stats.lastPoll = new Date().toISOString();
      
      const live = games.filter(g => g.status === 'live').length;
      if (live > 0 || this.stats.totalPolls % 10 === 0) {
        console.log(`[ESPN] ${games.length} games (${live} live) for ${d}`);
      }
      
      return games;
    } catch (err) {
      this.stats.errors++;
      console.error(`[ESPN] Error: ${err.message}`);
      return [];
    }
  }

  getGames() {
    return [...this.games.values()];
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[ESPN] Poller starting...');
    this.poll(); // Initial poll
    this._loop();
  }

  async _loop() {
    while (this.running) {
      await new Promise(r => setTimeout(r, this.pollInterval));
      await this.poll();
    }
  }

  stop() {
    this.running = false;
  }

  getStats() {
    return {
      ...this.stats,
      totalGames: this.games.size,
    };
  }
}

module.exports = { ESPNPoller };
