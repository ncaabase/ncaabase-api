// Massey Ratings Data Parser
// Ingests the Matlab Hyper-Games CSV format from masseyratings.com
// URL: https://masseyratings.com/scores.php?s=658933&sub=11590&all=1
// Format: days,YYYYMMDD,team1_idx,homefield1,score1,team2_idx,homefield2,score2
// homefield: 1=home, -1=away, 0=neutral

const https = require('https');
const { BY_MI } = require('./teams');

const MASSEY_SCORES_URL = 'https://masseyratings.com/scores.php?s=658933&sub=11590&all=1&mode=2&format=1';
const MASSEY_TEAMS_URL = 'https://masseyratings.com/scores.php?s=658933&sub=11590&all=1&mode=3&format=2';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseScoresCSV(csv) {
  const games = [];
  for (const line of csv.split('\n')) {
    const parts = line.trim().split(',').map(s => s.trim());
    if (parts.length < 8) continue;
    
    const date = parts[1]; // YYYYMMDD
    const t1_idx = parseInt(parts[2]);
    const t1_home = parseInt(parts[3]); // 1=home, -1=away, 0=neutral
    const t1_score = parseInt(parts[4]);
    const t2_idx = parseInt(parts[5]);
    const t2_home = parseInt(parts[6]);
    const t2_score = parseInt(parts[7]);
    
    if (isNaN(t1_idx) || isNaN(t2_idx)) continue;
    
    const t1 = BY_MI[t1_idx];
    const t2 = BY_MI[t2_idx];
    
    // Determine home/away
    let home, away, homeScore, awayScore;
    if (t1_home === 1) {
      home = t1; away = t2; homeScore = t1_score; awayScore = t2_score;
    } else if (t2_home === 1) {
      home = t2; away = t1; homeScore = t2_score; awayScore = t1_score;
    } else {
      // Neutral site — team1 listed as "home" by convention
      home = t1; away = t2; homeScore = t1_score; awayScore = t2_score;
    }
    
    games.push({
      date,
      home: home ? { name: home.name, abbr: home.abbr, conf: home.conf, mi: home.mi } : { name: `Team_${t1_home===1?t1_idx:t2_idx}`, abbr: '???', conf: '', mi: t1_home===1?t1_idx:t2_idx },
      away: away ? { name: away.name, abbr: away.abbr, conf: away.conf, mi: away.mi } : { name: `Team_${t1_home===-1?t1_idx:t2_idx}`, abbr: '???', conf: '', mi: t1_home===-1?t1_idx:t2_idx },
      homeScore,
      awayScore,
      neutral: t1_home === 0 && t2_home === 0,
    });
  }
  return games;
}

// Compute team records from completed games
function computeRecords(games) {
  const records = {}; // team mi -> { w, l, confW, confL, homeW, homeL, awayW, awayL, neutralW, neutralL }
  
  for (const g of games) {
    for (const side of ['home', 'away']) {
      const team = g[side];
      if (!team.mi) continue;
      if (!records[team.mi]) {
        records[team.mi] = { w:0, l:0, confW:0, confL:0, homeW:0, homeL:0, awayW:0, awayL:0, neutralW:0, neutralL:0, name: team.name, abbr: team.abbr, conf: team.conf };
      }
      
      const r = records[team.mi];
      const won = (side === 'home' && g.homeScore > g.awayScore) || (side === 'away' && g.awayScore > g.homeScore);
      
      if (won) {
        r.w++;
        if (g.neutral) r.neutralW++;
        else if (side === 'home') r.homeW++;
        else r.awayW++;
        // Conference game?
        const opp = side === 'home' ? g.away : g.home;
        if (team.conf && team.conf === opp.conf) r.confW++;
      } else {
        r.l++;
        if (g.neutral) r.neutralL++;
        else if (side === 'home') r.homeL++;
        else r.awayL++;
        const opp = side === 'home' ? g.away : g.home;
        if (team.conf && team.conf === opp.conf) r.confL++;
      }
    }
  }
  
  return records;
}

// Build formatted record strings
function formatRecord(r) {
  return `${r.w}-${r.l}`;
}

class MasseyPoller {
  constructor() {
    this.games = [];
    this.records = {};
    this.lastFetch = 0;
    this.fetchInterval = 10 * 60 * 1000; // Refresh every 10 minutes
    this.running = false;
  }

  // Load from local data (for initial bootstrap)
  loadFromCSV(csv) {
    this.games = parseScoresCSV(csv);
    this.records = computeRecords(this.games);
    console.log(`[Massey] Loaded ${this.games.length} games, ${Object.keys(this.records).length} teams with records`);
  }

  // Fetch from Massey (may be blocked — fallback to local data)
  async fetchFromMassey() {
    try {
      const csv = await fetch(MASSEY_SCORES_URL);
      this.games = parseScoresCSV(csv);
      this.records = computeRecords(this.games);
      this.lastFetch = Date.now();
      console.log(`[Massey] Fetched ${this.games.length} games from masseyratings.com`);
      return true;
    } catch (err) {
      console.log(`[Massey] Fetch failed (${err.message}) — using cached data`);
      return false;
    }
  }

  getRecord(masseyIdx) {
    const r = this.records[masseyIdx];
    if (!r) return '';
    return formatRecord(r);
  }

  getGamesForDate(dateStr) {
    // dateStr: YYYYMMDD
    return this.games.filter(g => g.date === dateStr);
  }

  getAllRecords() {
    return this.records;
  }

  start() {
    if (this.running) return;
    this.running = true;
    // Try to load bootstrap data first
    try {
      const fs = require('fs');
      const path = require('path');
      const bootstrapPath = path.join(__dirname, 'massey-bootstrap.csv');
      if (fs.existsSync(bootstrapPath)) {
        const csv = fs.readFileSync(bootstrapPath, 'utf-8');
        this.loadFromCSV(csv);
        console.log('[Massey] Bootstrap data loaded');
      }
    } catch (e) { /* no bootstrap file */ }
    // Then try live fetch
    this.fetchFromMassey();
    this._loop();
  }

  async _loop() {
    while (this.running) {
      await new Promise(r => setTimeout(r, this.fetchInterval));
      await this.fetchFromMassey();
    }
  }

  stop() { this.running = false; }
}

module.exports = { MasseyPoller, parseScoresCSV, computeRecords };
