// Game Store — Central game state manager
// PEAR provides: today's schedule (all D1 games, teams, times, win prob, GQI)
// StatBroadcast provides: live scores + inning for in-progress games
// Logic: Start with PEAR schedule, overlay SB live data by matching teams

class GameStore {
  constructor() {
    this.scheduleGames = new Map(); // PEAR schedule: id -> game
    this.liveGames = new Map();     // SB live: id -> game
    this.merged = [];               // Final merged + sorted array
  }

  // Set today's schedule from PEAR
  setSchedule(pearGames) {
    this.scheduleGames.clear();
    for (const g of pearGames) {
      this.scheduleGames.set(g.id, g);
    }
    this._rebuild();
    console.log(`[Store] Schedule: ${pearGames.length} games`);
  }

  // Update live scores from StatBroadcast
  setLive(sbGames) {
    this.liveGames.clear();
    for (const g of sbGames) {
      this.liveGames.set(g.id, g);
    }
    this._rebuild();
  }

  // Merge schedule + live data
  _rebuild() {
    const result = new Map();

    // Start with all schedule games
    for (const [id, g] of this.scheduleGames) {
      result.set(id, { ...g });
    }

    // Overlay live games — match by team names
    for (const [sbId, live] of this.liveGames) {
      const scheduleMatch = this._findByTeams(result, live);
      if (scheduleMatch) {
        // Found matching schedule game — upgrade it with live data
        const sched = result.get(scheduleMatch);
        result.set(scheduleMatch, {
          ...sched,
          status: 'live',
          inning: live.inning,
          half: live.half,
          home: {
            ...sched.home,
            score: live.home.score,
            hits: live.home.hits,
            errors: live.home.errors,
            lineScore: live.home.lineScore || [],
          },
          away: {
            ...sched.away,
            score: live.away.score,
            hits: live.away.hits,
            errors: live.away.errors,
            lineScore: live.away.lineScore || [],
          },
          runners: live.runners,
          eventId: live.eventId,
          source: 'statbroadcast+pear',
          updatedAt: live.updatedAt,
        });
      } else {
        // Live game not in schedule — add it directly
        result.set(sbId, live);
      }
    }

    // Sort: live (by inning desc) → upcoming (by time) → final
    this.merged = [...result.values()].sort((a, b) => {
      const order = { live: 0, pre: 1, final: 2 };
      const oa = order[a.status] ?? 1;
      const ob = order[b.status] ?? 1;
      if (oa !== ob) return oa - ob;
      if (a.status === 'live') return (b.inning || 0) - (a.inning || 0);
      // For upcoming, sort by GQI (highest quality first)
      if (a.status === 'pre') return (b.gqi || 0) - (a.gqi || 0);
      return 0;
    });
  }

  // Find a schedule game matching a live game by team names
  _findByTeams(gameMap, liveGame) {
    const lh = (liveGame.home?.name || '').toLowerCase();
    const la = (liveGame.away?.name || '').toLowerCase();
    if (!lh || !la) return null;

    for (const [id, g] of gameMap) {
      const gh = (g.home?.name || '').toLowerCase();
      const ga = (g.away?.name || '').toLowerCase();
      // Exact match
      if ((gh === lh && ga === la) || (gh === la && ga === lh)) return id;
      // Partial match (handles "Arkansas" vs "Arkansas Razorbacks" etc)
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
      schedule: this.scheduleGames.size,
      liveOverlays: this.liveGames.size,
    };
  }
}

module.exports = { GameStore };
