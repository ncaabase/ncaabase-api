// Game Store — Central game state manager
// Merges: Sidearm (schedule for ALL schools) + StatBroadcast (live scores for 63 schools)
// Priority: StatBroadcast scores override Sidearm data when available (faster updates)

class GameStore {
  constructor() {
    this.games = new Map(); // gameId -> game object
  }

  // Merge Sidearm schedule games (provides the complete list of today's games)
  updateFromSidearm(sidearmGames) {
    let added = 0;
    for (const sg of sidearmGames) {
      // Check if we already have this game from StatBroadcast (by matching teams)
      const existing = this._findMatchingGame(sg);
      if (existing) {
        // Enrich StatBroadcast game with Sidearm data (venue, time, logos, video)
        const g = this.games.get(existing.id);
        if (!g.venue && sg.venue) g.venue = sg.venue;
        if (!g.startTime && sg.time) g.startTime = sg.time;
        if (sg.home.logo && !g.home.logo) g.home.logo = sg.home.logo;
        if (sg.away.logo && !g.away.logo) g.away.logo = sg.away.logo;
        if (sg.videoURL) g.videoURL = sg.videoURL;
        if (sg.livestatsURL) g.livestatsURL = sg.livestatsURL;
        if (sg.neutral) g.neutral = sg.neutral;
      } else {
        // New game only from Sidearm — add it
        this.games.set(sg.id, sg);
        added++;
      }
    }
    return added;
  }

  // Update with StatBroadcast live score data (faster, more accurate scores)
  updateFromStatBroadcast(sbGames) {
    let updated = 0;
    for (const sg of sbGames) {
      const existing = this.games.get(sg.id);
      if (existing) {
        // Update scores and status
        const changed = existing.home.score !== sg.home.score ||
                        existing.away.score !== sg.away.score ||
                        existing.inning !== sg.inning ||
                        existing.status !== sg.status;
        if (changed) {
          // Keep Sidearm enrichment data but update scores
          sg.venue = sg.venue || existing.venue;
          sg.startTime = sg.startTime || existing.startTime;
          sg.home.logo = sg.home.logo || existing.home?.logo;
          sg.away.logo = sg.away.logo || existing.away?.logo;
          sg.videoURL = sg.videoURL || existing.videoURL;
          sg.livestatsURL = sg.livestatsURL || existing.livestatsURL;
          this.games.set(sg.id, sg);
          updated++;
        }
      } else {
        // Check if this matches a Sidearm game by teams
        const match = this._findMatchingGame(sg);
        if (match) {
          // Replace Sidearm placeholder with StatBroadcast live data
          const old = this.games.get(match.id);
          sg.venue = sg.venue || old.venue;
          sg.startTime = sg.startTime || old.startTime || old.time;
          sg.home.logo = sg.home.logo || old.home?.logo;
          sg.away.logo = sg.away.logo || old.away?.logo;
          sg.videoURL = sg.videoURL || old.videoURL;
          sg.livestatsURL = sg.livestatsURL || old.livestatsURL;
          this.games.delete(match.id); // Remove Sidearm entry
          this.games.set(sg.id, sg); // Add StatBroadcast entry
          updated++;
        } else {
          this.games.set(sg.id, sg);
          updated++;
        }
      }
    }
    return updated;
  }

  // Find a game matching by team names (for deduplication)
  _findMatchingGame(newGame) {
    const newHome = (newGame.home?.name || '').toLowerCase();
    const newAway = (newGame.away?.name || '').toLowerCase();
    if (!newHome || !newAway) return null;

    for (const [id, g] of this.games) {
      const h = (g.home?.name || '').toLowerCase();
      const a = (g.away?.name || '').toLowerCase();
      // Match: same home & away, or swapped (neutral site games sometimes flip)
      if ((h === newHome && a === newAway) || (h === newAway && a === newHome)) {
        return g;
      }
      // Partial match: check if names contain each other
      if (h && newHome && a && newAway) {
        if ((h.includes(newHome) || newHome.includes(h)) &&
            (a.includes(newAway) || newAway.includes(a))) {
          return g;
        }
      }
    }
    return null;
  }

  // Get all games sorted: live first (furthest inning), then upcoming, then final
  getGames() {
    const games = [...this.games.values()];
    return sortGames(games);
  }

  getLiveGames() {
    return [...this.games.values()].filter(g => g.status === 'live');
  }

  getGamesByConf(conf) {
    return this.getGames().filter(g =>
      g.home.conf === conf || g.away.conf === conf
    );
  }

  clear() { this.games.clear(); }

  getStats() {
    const games = [...this.games.values()];
    return {
      total: games.length,
      live: games.filter(g => g.status === 'live').length,
      final: games.filter(g => g.status === 'final').length,
      pre: games.filter(g => g.status === 'pre').length,
      fromSB: games.filter(g => g.source === 'statbroadcast').length,
      fromSidearm: games.filter(g => g.source === 'sidearm').length,
    };
  }
}

function sortGames(games) {
  const order = { live: 0, pre: 1, final: 2 };
  return games.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.status === 'live') return (b.inning || 0) - (a.inning || 0);
    if (a.status === 'pre') {
      const aT = a.dateUTC || a.startTime || '';
      const bT = b.dateUTC || b.startTime || '';
      return aT.localeCompare(bT);
    }
    return 0;
  });
}

module.exports = { GameStore };
