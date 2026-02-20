// Game Store — Central game state manager
// PEAR provides: today's schedule (all D1 games, teams, times, win prob, GQI)
// Sidearm Live provides: real-time scores, BSO, runners, pitcher, batter, line scores
// Logic: Start with PEAR schedule, overlay Sidearm live data by matching teams

class GameStore {
  constructor() {
    this.scheduleGames = new Map();
    this.liveGames = new Map();
    this.merged = [];
  }

  setSchedule(pearGames) {
    this.scheduleGames.clear();
    for (const g of pearGames) {
      this.scheduleGames.set(g.id, g);
    }
    this._rebuild();
    console.log(`[Store] Schedule: ${pearGames.length} games`);
  }

  setLive(liveGames) {
    this.liveGames.clear();
    for (const g of liveGames) {
      this.liveGames.set(g.id || g.sourceAbbrev, g);
    }
    this._rebuild();
  }

  _rebuild() {
    const result = new Map();
    for (const [id, g] of this.scheduleGames) {
      result.set(id, { ...g });
    }
    for (const [liveId, live] of this.liveGames) {
      const scheduleMatch = this._findByTeams(result, live);
      if (scheduleMatch) {
        const sched = result.get(scheduleMatch);
        result.set(scheduleMatch, {
          ...sched,
          status: live.status || 'live',
          inning: live.inning,
          half: live.half,
          balls: live.balls || 0,
          strikes: live.strikes || 0,
          outs: live.outs || 0,
          runners: live.runners || { first: false, second: false, third: false },
          pitcher: live.pitcher || null,
          hitter: live.hitter || null,
          home: {
            ...sched.home,
            score: live.home.score != null ? live.home.score : sched.home.score,
            hits: live.home.hits || sched.home.hits,
            errors: live.home.errors || sched.home.errors,
            lineScore: (live.home.lineScore && live.home.lineScore.length > 0) ? live.home.lineScore : sched.home.lineScore,
          },
          away: {
            ...sched.away,
            score: live.away.score != null ? live.away.score : sched.away.score,
            hits: live.away.hits || sched.away.hits,
            errors: live.away.errors || sched.away.errors,
            lineScore: (live.away.lineScore && live.away.lineScore.length > 0) ? live.away.lineScore : sched.away.lineScore,
          },
          wp: live.wp || sched.wp || null,
          lp: live.lp || sched.lp || null,
          sv: live.sv || sched.sv || null,
          source: 'sidearm-live+pear',
          updatedAt: live.updatedAt || new Date().toISOString(),
        });
      } else {
        result.set(liveId, {
          id: liveId, ...live,
          balls: live.balls || 0,
          strikes: live.strikes || 0,
          outs: live.outs || 0,
          runners: live.runners || { first: false, second: false, third: false },
        });
      }
    }
    this.merged = [...result.values()].sort((a, b) => {
      const order = { live: 0, pre: 1, final: 2, cancelled: 3 };
      const oa = order[a.status] ?? 1;
      const ob = order[b.status] ?? 1;
      if (oa !== ob) return oa - ob;
      if (a.status === 'live') return (b.inning || 0) - (a.inning || 0);
      if (a.status === 'pre') {
        return parseTimeToMin(a.time || a.startTime) - parseTimeToMin(b.time || b.startTime);
      }
      return 0;
    });
  }

  _findByTeams(gameMap, liveGame) {
    const lh = (liveGame.home?.name || '').toLowerCase();
    const la = (liveGame.away?.name || '').toLowerCase();
    if (!lh || !la) return null;
    for (const [id, g] of gameMap) {
      const gh = (g.home?.name || '').toLowerCase();
      const ga = (g.away?.name || '').toLowerCase();
      if ((gh === lh && ga === la) || (gh === la && ga === lh)) return id;
      if (gh && lh && ga && la) {
        if ((gh.includes(lh) || lh.includes(gh)) && (ga.includes(la) || la.includes(ga))) return id;
        if ((gh.includes(la) || la.includes(gh)) && (ga.includes(lh) || lh.includes(ga))) return id;
      }
    }
    return null;
  }

  getGames() { return this.merged; }
  getLiveGames() { return this.merged.filter(g => g.status === 'live'); }
  getGamesByConf(conf) {
    return this.merged.filter(g =>
      (g.home?.conf || '') === conf || (g.away?.conf || '') === conf ||
      (g.home?.conf || '').includes(conf) || (g.away?.conf || '').includes(conf)
    );
  }
  getStats() {
    return {
      total: this.merged.length,
      live: this.merged.filter(g => g.status === 'live').length,
      final: this.merged.filter(g => g.status === 'final').length,
      pre: this.merged.filter(g => g.status === 'pre').length,
      cancelled: this.merged.filter(g => g.status === 'cancelled').length,
      schedule: this.scheduleGames.size,
      liveOverlays: this.liveGames.size,
    };
  }
}

function parseTimeToMin(t) {
  if (!t) return 9999;
  const m = (t || '').match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return 9999;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

module.exports = { GameStore };
