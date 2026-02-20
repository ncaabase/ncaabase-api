// StatBroadcast Live Score Scraper v2
// Scrapes score text from StatBroadcast calendar API for 212 D1 schools
// Returns: team names, scores, inning, game status (no BSO/runners)
//
// Flow:
// 1. Fetch statmonitr.php?gid={gid} to get hash + time tokens
// 2. POST to _calendar.php with baseball filter to get today's games
// 3. Parse score text: "Alabama 3, Rhode Island 0 - Pregame" / "T5th" / "FINAL"

const https = require('https');
const http = require('http');
const querystring = require('querystring');

function fetchGet(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchGet(res.headers.location, timeout).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchPost(url, postData, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(postData);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      }
    };
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(options, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── 212 StatBroadcast Schools ───
const SB_SCHOOLS = [
  {name:'Abilene Christian',gid:'achr'},
  {name:'Air Force',gid:'afa'},
  {name:'Alabama',gid:'alab'},
  {name:'Alabama State',gid:'alst'},
  {name:'Appalachian State',gid:'appa'},
  {name:'Arizona',gid:'ariz'},
  {name:'Arizona State',gid:'asu'},
  {name:'Arkansas',gid:'ark'},
  {name:'Arkansas State',gid:'aru'},
  {name:'Auburn',gid:'aub'},
  {name:'Austin Peay',gid:'ausp'},
  {name:'Ball State',gid:'ball'},
  {name:'Baylor',gid:'bay'},
  {name:'Belmont',gid:'belm'},
  {name:'Boston College',gid:'bc'},
  {name:'Bradley',gid:'brad'},
  {name:'Butler',gid:'butl'},
  {name:'BYU',gid:'byu'},
  {name:'Cal Poly',gid:'cslo'},
  {name:'Cal State Bakersfield',gid:'ucsb'},
  {name:'California',gid:'cal'},
  {name:'California Baptist',gid:'calb'},
  {name:'Campbell',gid:'camb'},
  {name:'Charleston',gid:'chac'},
  {name:'Charlotte',gid:'ncch'},
  {name:'Cincinnati',gid:'cinn'},
  {name:'Clemson',gid:'clem'},
  {name:'Coastal Carolina',gid:'coas'},
  {name:'Columbia',gid:'colm'},
  {name:'Connecticut',gid:'conn'},
  {name:'Creighton',gid:'crei'},
  {name:'Dallas Baptist',gid:'dbap'},
  {name:'Dayton',gid:'dayt'},
  {name:'Delaware',gid:'dela'},
  {name:'Duke',gid:'duke'},
  {name:'East Carolina',gid:'ecu'},
  {name:'East Tennessee State',gid:'etsu'},
  {name:'Eastern Kentucky',gid:'eky'},
  {name:'Eastern Michigan',gid:'emu'},
  {name:'Elon',gid:'elon'},
  {name:'Evansville',gid:'evan'},
  {name:'Fairfield',gid:'fair'},
  {name:'FAU',gid:'fau'},
  {name:'FGCU',gid:'fguu'},
  {name:'FIU',gid:'flin'},
  {name:'Florida',gid:'fla'},
  {name:'Florida State',gid:'fsu'},
  {name:'Fresno State',gid:'fres'},
  {name:'Gardner-Webb',gid:'gard'},
  {name:'George Mason',gid:'gema'},
  {name:'Georgetown',gid:'gu'},
  {name:'Georgia',gid:'geo'},
  {name:'Georgia Southern',gid:'geos'},
  {name:'Georgia State',gid:'gest'},
  {name:'Georgia Tech',gid:'geot'},
  {name:'Gonzaga',gid:'gonz'},
  {name:'Grand Canyon',gid:'gcan'},
  {name:'Hawaii',gid:'haw'},
  {name:'Hofstra',gid:'hofs'},
  {name:'Houston',gid:'hou'},
  {name:'Houston Christian',gid:'houb'},
  {name:'Illinois',gid:'ill'},
  {name:'Illinois State',gid:'ilsu'},
  {name:'Incarnate Word',gid:'inca'},
  {name:'Indiana',gid:'ind'},
  {name:'Indiana State',gid:'insu'},
  {name:'Iowa',gid:'iowa'},
  {name:'Jackson State',gid:'jast'},
  {name:'Jacksonville State',gid:'jkst'},
  {name:'James Madison',gid:'jame'},
  {name:'Kansas',gid:'kan'},
  {name:'Kansas State',gid:'ksu'},
  {name:'Kennesaw State',gid:'kenn'},
  {name:'Kentucky',gid:'kty'},
  {name:'Lamar',gid:'lama'},
  {name:'Liberty',gid:'libe'},
  {name:'Lipscomb',gid:'lips'},
  {name:'Little Rock',gid:'arkl'},
  {name:'Long Beach State',gid:'lbst'},
  {name:'Louisiana',gid:'ulaf'},
  {name:'Louisiana Tech',gid:'latc'},
  {name:'Louisville',gid:'lou'},
  {name:'LSU',gid:'lsu'},
  {name:'Marist',gid:'mari'},
  {name:'Marshall',gid:'mars'},
  {name:'Maryland',gid:'md'},
  {name:'McNeese',gid:'mcne'},
  {name:'Memphis',gid:'mem'},
  {name:'Mercer',gid:'merc'},
  {name:'Miami (FL)',gid:'mifl'},
  {name:'Michigan',gid:'mich'},
  {name:'Michigan State',gid:'msu'},
  {name:'Middle Tennessee',gid:'mtn'},
  {name:'Milwaukee',gid:'wiml'},
  {name:'Minnesota',gid:'minn'},
  {name:'Mississippi State',gid:'msst'},
  {name:'Missouri',gid:'miss'},
  {name:'Missouri State',gid:'mosu'},
  {name:'Monmouth',gid:'monm'},
  {name:'Morehead State',gid:'more'},
  {name:'Murray State',gid:'must'},
  {name:'Navy',gid:'navy'},
  {name:'Nebraska',gid:'neb'},
  {name:'Nevada',gid:'unv'},
  {name:'New Mexico',gid:'nm'},
  {name:'New Mexico State',gid:'nmst'},
  {name:'New Orleans',gid:'newo'},
  {name:'Nicholls',gid:'nist'},
  {name:'North Alabama',gid:'noal'},
  {name:'North Carolina',gid:'unc'},
  {name:'North Carolina A&T',gid:'ncat'},
  {name:'North Carolina State',gid:'ncst'},
  {name:'North Dakota State',gid:'ndsu'},
  {name:'North Florida',gid:'nfla'},
  {name:'Northeastern',gid:'ne'},
  {name:'Northwestern',gid:'nw'},
  {name:'Northwestern State',gid:'nwst'},
  {name:'Notre Dame',gid:'nd'},
  {name:'Oakland',gid:'oakl'},
  {name:'Ohio',gid:'ohio'},
  {name:'Ohio State',gid:'osu'},
  {name:'Oklahoma',gid:'okla'},
  {name:'Oklahoma State',gid:'okst'},
  {name:'Old Dominion',gid:'oldd'},
  {name:'Ole Miss',gid:'ole'},
  {name:'Oregon',gid:'ore'},
  {name:'Oregon State',gid:'orst'},
  {name:'Penn',gid:'penn'},
  {name:'Penn State',gid:'psu'},
  {name:'Pepperdine',gid:'pepp'},
  {name:'Pittsburgh',gid:'pitt'},
  {name:'Portland',gid:'port'},
  {name:'Prairie View A&M',gid:'pvam'},
  {name:'Presbyterian College',gid:'psby'},
  {name:'Purdue',gid:'pur'},
  {name:'Queens',gid:'qunc'},
  {name:'Rhode Island',gid:'uri'},
  {name:'Rice',gid:'rice'},
  {name:'Richmond',gid:'rich'},
  {name:'Rutgers',gid:'rutu'},
  {name:'Sacramento State',gid:'cssa'},
  {name:'Saint John\'s',gid:'stjo'},
  {name:'Saint Louis',gid:'stlo'},
  {name:'Saint Mary\'s College',gid:'stma'},
  {name:'Sam Houston State',gid:'samh'},
  {name:'Samford',gid:'samf'},
  {name:'San Diego',gid:'usd'},
  {name:'San Diego State',gid:'sdsu'},
  {name:'San Francisco',gid:'sanf'},
  {name:'San Jose State',gid:'sjsu'},
  {name:'Santa Clara',gid:'sacl'},
  {name:'Seattle University',gid:'sea'},
  {name:'Seton Hall',gid:'seha'},
  {name:'SIUE',gid:'siue'},
  {name:'South Alabama',gid:'sala'},
  {name:'South Carolina',gid:'scar'},
  {name:'South Dakota State',gid:'sdst'},
  {name:'South Florida',gid:'sfla'},
  {name:'Southeastern Louisiana',gid:'sela'},
  {name:'Southern Illinois',gid:'silu'},
  {name:'Southern Miss',gid:'smis'},
  {name:'Stanford',gid:'stan'},
  {name:'Stephen F. Austin',gid:'sasu'},
  {name:'Stetson',gid:'stet'},
  {name:'Stony Brook',gid:'ston'},
  {name:'Tarleton State',gid:'tarl'},
  {name:'TCU',gid:'tcu'},
  {name:'Tennessee',gid:'tenn'},
  {name:'Tennessee Tech',gid:'tntc'},
  {name:'Texas',gid:'tex'},
  {name:'Texas A&M',gid:'tam'},
  {name:'Texas A&M-Corpus Christi',gid:'tamcc'},
  {name:'Texas State',gid:'txst'},
  {name:'Texas Tech',gid:'text'},
  {name:'Towson',gid:'tows'},
  {name:'Troy',gid:'troy'},
  {name:'Tulane',gid:'tul'},
  {name:'UAB',gid:'albr'},
  {name:'UC Davis',gid:'ucda'},
  {name:'UC San Diego',gid:'ucsd'},
  {name:'UC Santa Barbara',gid:'ucsb'},
  {name:'UCF',gid:'ucf'},
  {name:'UCLA',gid:'ucla'},
  {name:'UIC',gid:'ilch'},
  {name:'ULM',gid:'ulm'},
  {name:'UMass',gid:'mass'},
  {name:'UNCG',gid:'uncg'},
  {name:'UNCW',gid:'ncwi'},
  {name:'UNLV',gid:'unlv'},
  {name:'USC',gid:'usc'},
  {name:'UTA',gid:'txar'},
  {name:'Utah',gid:'utah'},
  {name:'Utah Valley',gid:'utva'},
  {name:'UTRGV',gid:'utrgv'},
  {name:'UTSA',gid:'txsa'},
  {name:'Valparaiso',gid:'val'},
  {name:'Vanderbilt',gid:'vand'},
  {name:'VCU',gid:'vcu'},
  {name:'Villanova',gid:'nova'},
  {name:'Virginia',gid:'va'},
  {name:'Virginia Tech',gid:'vtec'},
  {name:'Wake Forest',gid:'wake'},
  {name:'Washington',gid:'wash'},
  {name:'Washington State',gid:'wast'},
  {name:'West Virginia',gid:'wvir'},
  {name:'Western Carolina',gid:'wcar'},
  {name:'Western Kentucky',gid:'wky'},
  {name:'Western Michigan',gid:'wmu'},
  {name:'Wichita State',gid:'wich'},
  {name:'William & Mary',gid:'wima'},
  {name:'Winthrop',gid:'wint'},
  {name:'Xavier',gid:'xavi'},
];

// ─── Parse score text ───
// Examples:
//   "Alabama 3, Rhode Island 0 - Pregame"
//   "Alabama 3, Rhode Island 1 - T5th"
//   "Alabama 3, Rhode Island 1 - B7th"
//   "Crimson 6, Gray 5 - T8th"
//   "Washington State 8, Alabama 4 - FINAL"
//   "Alabama 8, Washington State 1 - FINAL"

function parseScoreText(text) {
  if (!text || text.trim() === '') return null;

  // Match: "Team1 Score1, Team2 Score2 - Status"
  const m = text.match(/^(.+?)\s+(\d+),\s+(.+?)\s+(\d+)\s*-\s*(.+)$/);
  if (!m) return null;

  const team1 = m[1].trim();
  const score1 = parseInt(m[2]);
  const team2 = m[3].trim();
  const score2 = parseInt(m[4]);
  const statusText = m[5].trim();

  let status = 'pre';
  let inning = null;
  let half = null;

  if (statusText === 'FINAL' || statusText.startsWith('FINAL')) {
    status = 'final';
  } else if (statusText === 'Pregame' || statusText === 'Pre-Game') {
    status = 'pre';
  } else {
    // Parse inning: T5th, B7th, Top 5th, Bot 7th, etc.
    const innMatch = statusText.match(/^(T|B|Top|Bot|Mid)\s*(\d+)/i);
    if (innMatch) {
      status = 'live';
      const halfStr = innMatch[1].toUpperCase();
      half = (halfStr === 'T' || halfStr === 'TOP') ? 'top' : (halfStr === 'MID' ? 'mid' : 'bottom');
      inning = parseInt(innMatch[2]);
    } else {
      // Could be "End 5th" or just "5th"
      const endMatch = statusText.match(/(?:End\s+)?(\d+)/i);
      if (endMatch) {
        status = 'live';
        inning = parseInt(endMatch[1]);
        half = 'mid'; // between innings
      }
    }
  }

  return { team1, score1, team2, score2, status, inning, half };
}

// ─── Scraper ───

class StatBroadcastScraper {
  constructor() {
    this.games = new Map();       // eventId -> parsed game
    this.tokenCache = new Map();  // gid -> { hash, time, ts }
    this.liveGids = new Set();    // GIDs with active live games
    this.running = false;
    this.scanInterval = 3 * 60 * 1000;  // Full scan every 3 min
    this.pollInterval = 15 * 1000;       // Poll live games every 15s
    this.stats = { totalScans: 0, errors: 0, lastScan: null, lastPoll: null, tokensObtained: 0 };
  }

  // Step 1: Get hash+time tokens from a school's statmonitr page
  async getTokens(gid) {
    const cached = this.tokenCache.get(gid);
    // Reuse tokens for 30 min
    if (cached && (Date.now() - cached.ts) < 30 * 60 * 1000) {
      return { hash: cached.hash, time: cached.time };
    }

    try {
      const html = await fetchGet(`https://www.statbroadcast.com/events/statmonitr.php?gid=${gid}`, 10000);
      const hashM = html.match(/sbCal\.hash\s*=\s*"([^"]+)"/);
      const timeM = html.match(/sbCal\.time\s*=\s*"([^"]+)"/);
      if (hashM && timeM) {
        const tokens = { hash: hashM[1], time: timeM[1], ts: Date.now() };
        this.tokenCache.set(gid, tokens);
        this.stats.tokensObtained++;
        return { hash: tokens.hash, time: tokens.time };
      }
    } catch (e) { /* failed */ }
    return null;
  }

  // Step 2: Fetch today's baseball games for a school
  async fetchSchoolGames(gid) {
    const tokens = await this.getTokens(gid);
    if (!tokens) return [];

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    try {
      const url = `https://www.statbroadcast.com/events/_calendar.php?hash=${encodeURIComponent(tokens.hash)}&time=${tokens.time}`;
      const postData = {
        'o[gid]': gid,
        'o[conf]': '',
        'o[sport]': 'bsgame',
        'o[gender]': 'M',
        'o[live]': '1',
        'o[month]': month,
        'o[year]': year,
        'o[members]': '',
        'o[schools]': '',
      };
      const raw = await fetchPost(url, postData, 10000);
      const json = JSON.parse(raw);
      return json.data || [];
    } catch (e) {
      this.stats.errors++;
      return [];
    }
  }

  // Step 3: Parse games into our standard format
  parseGame(row, schoolName) {
    const parsed = parseScoreText(row.score || row.name || '');
    if (!parsed) return null;
    if (parsed.status === 'pre') return null; // Only care about live/final

    return {
      id: `sb-${row.id}`,
      source: 'statbroadcast',
      sbEventId: row.id,
      status: parsed.status,
      inning: parsed.inning,
      half: parsed.half,
      // No BSO/runners from StatBroadcast
      balls: null,
      strikes: null,
      outs: null,
      runners: null,
      pitcher: null,
      hitter: null,
      home: {
        name: parsed.team2,  // In SB, format is "Away Score, Home Score"
        score: parsed.score2,
        hits: null, errors: null, lineScore: [],
      },
      away: {
        name: parsed.team1,
        score: parsed.score1,
        hits: null, errors: null, lineScore: [],
      },
      location: row.location || '',
      updatedAt: new Date().toISOString(),
    };
  }

  // Full scan of all 212 schools
  async fullScan() {
    console.log(`[StatBroadcast] Scanning ${SB_SCHOOLS.length} schools...`);
    const start = Date.now();
    this.games.clear();

    for (let i = 0; i < SB_SCHOOLS.length; i += 5) {
      const batch = SB_SCHOOLS.slice(i, i + 5);
      await Promise.allSettled(
        batch.map(async (school) => {
          try {
            const rows = await this.fetchSchoolGames(school.gid);
            for (const row of rows) {
              if (row.short && row.short !== 'bsgame') continue;
              const game = this.parseGame(row, school.name);
              if (game && (game.status === 'live' || game.status === 'final')) {
                if (!this.games.has(game.id)) {
                  this.games.set(game.id, game);
                  // Track which GIDs have live games for fast polling
                  if (game.status === 'live') {
                    this.liveGids.add(school.gid);
                  }
                }
              }
            }
          } catch (e) { /* skip school */ }
        })
      );
      await new Promise(r => setTimeout(r, 500));
    }

    this.stats.totalScans++;
    this.stats.lastScan = new Date().toISOString();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const live = [...this.games.values()].filter(g => g.status === 'live').length;
    console.log(`[StatBroadcast] Scan done ${elapsed}s — ${this.games.size} games (${live} live), ${this.liveGids.size} live GIDs, ${this.tokenCache.size} tokens`);
  }

  // Fast poll — only re-fetch schools that have live games
  async pollLive() {
    if (this.liveGids.size === 0) return;
    const gids = [...this.liveGids];
    await Promise.allSettled(
      gids.map(async (gid) => {
        try {
          const rows = await this.fetchSchoolGames(gid);
          let stillLive = false;
          for (const row of rows) {
            if (row.short && row.short !== 'bsgame') continue;
            const game = this.parseGame(row, gid);
            if (game) {
              this.games.set(game.id, game);
              if (game.status === 'live') stillLive = true;
            }
          }
          if (!stillLive) this.liveGids.delete(gid);
        } catch (e) { /* skip */ }
      })
    );
    this.stats.lastPoll = new Date().toISOString();
  }

  getGames() { return [...this.games.values()]; }
  getLiveGames() { return [...this.games.values()].filter(g => g.status === 'live'); }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[StatBroadcast] Starting (${SB_SCHOOLS.length} schools)`);
    this.fullScan().then(() => { this._scanLoop(); this._pollLoop(); });
  }

  async _scanLoop() {
    while (this.running) {
      await new Promise(r => setTimeout(r, this.scanInterval));
      await this.fullScan();
    }
  }

  async _pollLoop() {
    while (this.running) {
      await new Promise(r => setTimeout(r, this.pollInterval));
      await this.pollLive();
    }
  }

  stop() { this.running = false; }

  getStats() {
    return {
      ...this.stats,
      liveGames: this.getLiveGames().length,
      liveGids: this.liveGids.size,
      totalGames: this.games.size,
      cachedTokens: this.tokenCache.size,
      totalSchools: SB_SCHOOLS.length,
    };
  }
}

module.exports = { StatBroadcastScraper, SB_SCHOOLS };
