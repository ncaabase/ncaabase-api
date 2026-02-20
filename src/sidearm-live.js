// Sidearm Live Stats Poller v2
// Discovers ClientAbbrev via multiple methods, then polls game.json for live data
// Returns: scores, inning, half, BSO, runners, pitcher, batter, line scores

const https = require('https');
const http = require('http');

function fetch(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, timeout).then(resolve).catch(reject);
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

// ─── 95 Sidearm Schools ───
const SIDEARM_SCHOOLS = [
  {name:'Akron',host:'gozips.com',abbrev:null},
  {name:'Alabama A&M',host:'aamusports.com',abbrev:null},
  {name:'Albany',host:'ualbanysports.com',abbrev:null},
  {name:'Alcorn State',host:'alcornsports.com',abbrev:null},
  {name:'Arkansas-Pine Bluff',host:'uapblionsroar.com',abbrev:null},
  {name:'Army',host:'goarmywestpoint.com',abbrev:null},
  {name:'Bellarmine',host:'athletics.bellarmine.edu',abbrev:null},
  {name:'Bethune-Cookman',host:'bcuathletics.com',abbrev:null},
  {name:'Binghamton',host:'binghamtonbearcats.com',abbrev:null},
  {name:'Bowling Green',host:'bgsufalcons.com',abbrev:null},
  {name:'Brown',host:'brownbears.com',abbrev:null},
  {name:'Bryant',host:'bryantbulldogs.com',abbrev:null},
  {name:'Bucknell',host:'bucknellbison.com',abbrev:null},
  {name:'Cal State Fullerton',host:'fullertontitans.com',abbrev:null},
  {name:'Cal State Northridge',host:'gomatadors.com',abbrev:null},
  {name:'Canisius',host:'gogriffs.com',abbrev:null},
  {name:'Central Arkansas',host:'ucasports.com',abbrev:null},
  {name:'Central Michigan',host:'cmuchippewas.com',abbrev:null},
  {name:'Charleston Southern',host:'csusports.com',abbrev:null},
  {name:'Coppin State',host:'coppinstatesports.com',abbrev:null},
  {name:'Cornell',host:'cornellbigred.com',abbrev:null},
  {name:'Dartmouth',host:'dartmouthsports.com',abbrev:null},
  {name:'Davidson',host:'davidsonwildcats.com',abbrev:null},
  {name:'Delaware State',host:'dsuhornets.com',abbrev:null},
  {name:'Eastern Illinois',host:'eiupanthers.com',abbrev:null},
  {name:'Fairleigh Dickinson',host:'fduknights.com',abbrev:null},
  {name:'Florida A&M',host:'famuathletics.com',abbrev:null},
  {name:'Fordham',host:'fordhamsports.com',abbrev:null},
  {name:'George Washington',host:'gwsports.com',abbrev:null},
  {name:'Grambling State',host:'gsutigers.com',abbrev:null},
  {name:'Harvard',host:'gocrimson.com',abbrev:null},
  {name:'High Point',host:'highpointpanthers.com',abbrev:null},
  {name:'Holy Cross',host:'goholycross.com',abbrev:null},
  {name:'Iona',host:'ionagaels.com',abbrev:null},
  {name:'Jacksonville',host:'judolphins.com',abbrev:null},
  {name:'Kent State',host:'kentstatesports.com',abbrev:null},
  {name:'La Salle',host:'goexplorers.com',abbrev:'lasalle'},
  {name:'Lafayette',host:'goleopards.com',abbrev:null},
  {name:'Le Moyne',host:'lemoynedolphins.com',abbrev:null},
  {name:'Lehigh',host:'lehighsports.com',abbrev:null},
  {name:'Lindenwood',host:'lindenwoodlions.com',abbrev:null},
  {name:'Long Island',host:'liuathletics.com',abbrev:null},
  {name:'Longwood',host:'longwoodlancers.com',abbrev:'longwood'},
  {name:'Loyola-Marymount',host:'lmulions.com',abbrev:null},
  {name:'Maine',host:'goblackbears.com',abbrev:null},
  {name:'Manhattan',host:'gojaspers.com',abbrev:null},
  {name:'Maryland Eastern Shore',host:'umeshawksports.com',abbrev:null},
  {name:'Mercyhurst',host:'hurstathletics.com',abbrev:null},
  {name:'Merrimack',host:'merrimackathletics.com',abbrev:null},
  {name:'Miami (OH)',host:'miamiredhawks.com',abbrev:null},
  {name:'Mississippi Valley State',host:'mvsusports.com',abbrev:null},
  {name:'Mount Saint Mary\'s',host:'mountathletics.com',abbrev:'msmary'},
  {name:'New Haven',host:'newhavenchargers.com',abbrev:null},
  {name:'Niagara',host:'purpleeagles.com',abbrev:null},
  {name:'NJIT',host:'njithighlanders.com',abbrev:null},
  {name:'Norfolk State',host:'nsuspartans.com',abbrev:null},
  {name:'Northern Colorado',host:'uncbears.com',abbrev:null},
  {name:'Northern Illinois',host:'niuhuskies.com',abbrev:null},
  {name:'Northern Kentucky',host:'nkunorse.com',abbrev:null},
  {name:'Omaha',host:'omavs.com',abbrev:null},
  {name:'Oral Roberts',host:'oruathletics.com',abbrev:null},
  {name:'Pacific',host:'pacifictigers.com',abbrev:null},
  {name:'Princeton',host:'goprincetontigers.com',abbrev:null},
  {name:'Quinnipiac',host:'gobobcats.com',abbrev:null},
  {name:'Radford',host:'radfordathletics.com',abbrev:null},
  {name:'Rider',host:'gobroncs.com',abbrev:null},
  {name:'Sacred Heart',host:'sacredheartpioneers.com',abbrev:null},
  {name:'Saint Bonaventure',host:'gobonnies.com',abbrev:null},
  {name:'Saint Joseph\'s',host:'sjuhawks.com',abbrev:null},
  {name:'Saint Peter\'s',host:'saintpeterspeacocks.com',abbrev:null},
  {name:'Saint Thomas',host:'ustcelts.com',abbrev:null},
  {name:'Siena',host:'sienasaints.com',abbrev:null},
  {name:'South Carolina Upstate',host:'upstatespartans.com',abbrev:null},
  {name:'Southeast Missouri',host:'semoredhawks.com',abbrev:null},
  {name:'Southern',host:'gojagsports.com',abbrev:null},
  {name:'Southern Indiana',host:'usiscreamingeagles.com',abbrev:null},
  {name:'Stonehill',host:'stonehillskyhawks.com',abbrev:null},
  {name:'Tennessee-Martin',host:'utmsports.com',abbrev:null},
  {name:'Texas Southern',host:'tsusports.com',abbrev:null},
  {name:'The Citadel',host:'citadelsports.com',abbrev:null},
  {name:'Toledo',host:'utrockets.com',abbrev:null},
  {name:'UC Irvine',host:'ucirvinesports.com',abbrev:null},
  {name:'UC Riverside',host:'gohighlanders.com',abbrev:'ucr'},
  {name:'UMass-Lowell',host:'goriverhawks.com',abbrev:null},
  {name:'UMBC',host:'umbcretrievers.com',abbrev:null},
  {name:'UNC Asheville',host:'uncabulldogs.com',abbrev:'uncash'},
  {name:'Utah Tech',host:'utahtechtrailblazers.com',abbrev:null},
  {name:'VMI',host:'vmikeydets.com',abbrev:null},
  {name:'Wagner',host:'wagnerathletics.com',abbrev:null},
  {name:'West Georgia',host:'uwgathletics.com',abbrev:null},
  {name:'Western Illinois',host:'goleathernecks.com',abbrev:null},
  {name:'Wofford',host:'woffordterriers.com',abbrev:null},
  {name:'Wright State',host:'wsuraiders.com',abbrev:null},
  {name:'Yale',host:'yalebulldogs.com',abbrev:null},
  {name:'Youngstown State',host:'ysusports.com',abbrev:null},
];

// ─── Parse game.json ───

function parseSidearmGame(json) {
  const g = json.Game;
  if (!g) return null;
  if (g.Type !== 'BaseballSoftballGame') return null;
  if (g.GlobalSportShortname && g.GlobalSportShortname !== 'baseball') return null;

  const home = g.HomeTeam || {};
  const away = g.VisitingTeam || {};
  const sit = g.Situation || {};

  let status = 'pre';
  if (g.IsComplete) status = 'final';
  else if (g.HasStarted) status = 'live';
  if (status === 'pre') return null;

  let half = 'top';
  if (sit.BattingTeam === 'HomeTeam') half = 'bottom';

  const runners = {
    first: sit.OnFirst != null,
    second: sit.OnSecond != null,
    third: sit.OnThird != null,
  };

  let pitcher = null;
  if (sit.Pitcher) {
    pitcher = {
      name: `${sit.Pitcher.FirstName} ${sit.Pitcher.LastName}`,
      number: sit.Pitcher.UniformNumber || '',
      throws: sit.PitcherHandedness || '',
      pitchCount: sit.PitcherPitchCount || 0,
    };
  }

  let hitter = null;
  if (sit.Batter) {
    hitter = {
      name: `${sit.Batter.FirstName} ${sit.Batter.LastName}`,
      number: sit.Batter.UniformNumber || '',
      bats: sit.BatterHandedness || '',
      avg: '',
    };
  }

  const inning = sit.Inning ? Math.floor(sit.Inning) : (g.Period || 1);
  const abbrev = g.ClientAbbrev || '';

  return {
    id: `sidearm-${abbrev}`,
    source: 'sidearm-live',
    sourceAbbrev: abbrev,
    status,
    inning,
    half,
    balls: sit.Balls || 0,
    strikes: sit.Strikes || 0,
    outs: sit.Outs || 0,
    runners,
    pitcher: status === 'live' ? pitcher : null,
    hitter: status === 'live' ? hitter : null,
    home: {
      name: home.Name || '',
      score: home.Score != null ? home.Score : null,
      hits: null, errors: null,
      lineScore: home.PeriodScores || [],
    },
    away: {
      name: away.Name || '',
      score: away.Score != null ? away.Score : null,
      hits: null, errors: null,
      lineScore: away.PeriodScores || [],
    },
    wp: sit.WinPitcher ? { name: `${sit.WinPitcher.FirstName} ${sit.WinPitcher.LastName}` } : null,
    lp: sit.LossPitcher ? { name: `${sit.LossPitcher.FirstName} ${sit.LossPitcher.LastName}` } : null,
    sv: sit.SavePitcher ? { name: `${sit.SavePitcher.FirstName} ${sit.SavePitcher.LastName}` } : null,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Poller ───

class SidearmLivePoller {
  constructor() {
    this.games = new Map();
    this.activeAbbrevs = new Set();
    this.abbrevCache = new Map();     // hostname -> abbrev
    this.running = false;
    this.pollInterval = 8 * 1000;     // 8 seconds for active live games
    this.discoveryInterval = 2 * 60 * 1000;  // 2 min discovery scan
    this.stats = { totalPolls: 0, errors: 0, lastPoll: null, lastDiscovery: null };

    for (const s of SIDEARM_SCHOOLS) {
      if (s.abbrev) this.abbrevCache.set(s.host, s.abbrev);
    }
  }

  // Discovery method 1: fetch the sidearm summary HTML page and extract abbrev from JS
  async discoverFromPage(school) {
    if (this.abbrevCache.has(school.host)) return this.abbrevCache.get(school.host);
    try {
      // The sidearm summary page HTML contains a reference to sidearmstats.com/{abbrev}
      const url = `https://${school.host}/sidearmstats/baseball/summary`;
      const html = await fetch(url, 8000);
      // Look for sidearmstats.com/{abbrev}/ pattern in the HTML/JS
      const m = html.match(/sidearmstats\.com\/([a-zA-Z0-9_-]+)\/baseball/);
      if (m) {
        const abbrev = m[1];
        this.abbrevCache.set(school.host, abbrev);
        school.abbrev = abbrev;
        console.log(`[SidearmLive] Discovered from page: ${school.name} -> ${abbrev}`);
        return abbrev;
      }
      // Also try: ClientAbbrev in embedded JSON
      const m2 = html.match(/"ClientAbbrev"\s*:\s*"([^"]+)"/);
      if (m2) {
        const abbrev = m2[1];
        this.abbrevCache.set(school.host, abbrev);
        school.abbrev = abbrev;
        console.log(`[SidearmLive] Discovered from embedded JSON: ${school.name} -> ${abbrev}`);
        return abbrev;
      }
    } catch (e) { /* page load failed */ }
    return null;
  }

  // Discovery method 2: hit their /api/livestats/baseball (only works during active game)
  async discoverFromAPI(school) {
    if (this.abbrevCache.has(school.host)) return this.abbrevCache.get(school.host);
    try {
      const raw = await fetch(`https://${school.host}/api/livestats/baseball`, 6000);
      const json = JSON.parse(raw);
      if (json.Game && json.Game.ClientAbbrev) {
        const abbrev = json.Game.ClientAbbrev;
        this.abbrevCache.set(school.host, abbrev);
        school.abbrev = abbrev;
        console.log(`[SidearmLive] Discovered from API: ${school.name} -> ${abbrev}`);
        return abbrev;
      }
    } catch (e) { /* no game or endpoint failed */ }
    return null;
  }

  // Try all discovery methods
  async discoverAbbrev(school) {
    if (this.abbrevCache.has(school.host)) return this.abbrevCache.get(school.host);
    // Method 1: Page scrape (always works, even without active game)
    let abbrev = await this.discoverFromPage(school);
    if (abbrev) return abbrev;
    // Method 2: API (works during active game)
    abbrev = await this.discoverFromAPI(school);
    if (abbrev) return abbrev;
    return null;
  }

  async pollSchool(abbrev) {
    const url = `https://sidearmstats.com/${abbrev}/baseball/game.json?detail=full`;
    try {
      const raw = await fetch(url, 6000);
      const json = JSON.parse(raw);
      const game = parseSidearmGame(json);
      this.stats.totalPolls++;
      this.stats.lastPoll = new Date().toISOString();

      if (game && game.status === 'live') {
        this.games.set(abbrev, game);
        return game;
      } else if (game && game.status === 'final') {
        this.games.set(abbrev, game);
        this.activeAbbrevs.delete(abbrev);
        return game;
      } else {
        this.games.delete(abbrev);
        this.activeAbbrevs.delete(abbrev);
        return null;
      }
    } catch (err) {
      this.stats.errors++;
      return null;
    }
  }

  async fullScan() {
    console.log(`[SidearmLive] Scanning ${SIDEARM_SCHOOLS.length} schools (${this.abbrevCache.size} cached)...`);
    const start = Date.now();

    for (let i = 0; i < SIDEARM_SCHOOLS.length; i += 8) {
      const batch = SIDEARM_SCHOOLS.slice(i, i + 8);
      await Promise.allSettled(
        batch.map(async (school) => {
          let abbrev = school.abbrev || this.abbrevCache.get(school.host);
          if (!abbrev) abbrev = await this.discoverAbbrev(school);
          if (!abbrev) return;

          try {
            const raw = await fetch(`https://sidearmstats.com/${abbrev}/baseball/game.json?detail=full`, 6000);
            const json = JSON.parse(raw);
            const game = parseSidearmGame(json);
            if (game && game.status === 'live') {
              this.activeAbbrevs.add(abbrev);
              this.games.set(abbrev, game);
            }
          } catch (e) { /* no active game */ }
        })
      );
      await new Promise(r => setTimeout(r, 250));
    }

    this.stats.lastDiscovery = new Date().toISOString();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[SidearmLive] Scan done ${elapsed}s — ${this.games.size} live, ${this.activeAbbrevs.size} active, ${this.abbrevCache.size} abbrevs cached`);
  }

  async pollActive() {
    if (this.activeAbbrevs.size === 0) return;
    const abbrevs = [...this.activeAbbrevs];
    await Promise.allSettled(abbrevs.map(a => this.pollSchool(a)));
    const live = [...this.games.values()].filter(g => g.status === 'live').length;
    if (live > 0) console.log(`[SidearmLive] Poll: ${live} live`);
  }

  getGames() { return [...this.games.values()]; }
  getLiveGames() { return [...this.games.values()].filter(g => g.status === 'live'); }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[SidearmLive] Starting (${SIDEARM_SCHOOLS.length} schools, ${this.abbrevCache.size} known)`);
    this.fullScan().then(() => { this._pollLoop(); this._scanLoop(); });
  }

  async _pollLoop() {
    while (this.running) {
      await this.pollActive();
      await new Promise(r => setTimeout(r, this.pollInterval));
    }
  }

  async _scanLoop() {
    while (this.running) {
      await new Promise(r => setTimeout(r, this.discoveryInterval));
      await this.fullScan();
    }
  }

  stop() { this.running = false; }

  getStats() {
    return {
      ...this.stats,
      activeSchools: this.activeAbbrevs.size,
      liveGames: this.getLiveGames().length,
      trackedGames: this.games.size,
      cachedAbbrevs: this.abbrevCache.size,
      cachedList: [...this.abbrevCache.entries()].map(([h,a]) => `${h}=${a}`),
      totalSchools: SIDEARM_SCHOOLS.length,
    };
  }
}

module.exports = { SidearmLivePoller, SIDEARM_SCHOOLS };
