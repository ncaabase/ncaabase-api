// Game Merger
// Combines games from StatBroadcast (fast, primary) and ESPN (slower, secondary)
// StatBroadcast data takes priority when available
// ESPN fills gaps for schools not on StatBroadcast

const { findTeam } = require('./teams');

function normalizeKey(game) {
  // Create a key to match the same game across sources
  // Use away + home team abbreviations + date
  const away = game.away?.abbr || '';
  const home = game.home?.abbr || '';
  return `${away}@${home}`.toUpperCase();
}

function mergeGames(sbGames, espnGames) {
  const merged = new Map(); // key -> game
  const sbKeys = new Set();

  // StatBroadcast games go in first (primary source — faster updates)
  for (const game of sbGames) {
    const key = normalizeKey(game);
    sbKeys.add(key);
    
    // If we already have an ESPN version, merge useful ESPN data into SB game
    const espnVersion = espnGames.find(g => normalizeKey(g) === key);
    if (espnVersion) {
      // Take ESPN's ranks, records, lineup data, and venue if SB doesn't have them
      if (!game.away.rank && espnVersion.away.rank) game.away.rank = espnVersion.away.rank;
      if (!game.home.rank && espnVersion.home.rank) game.home.rank = espnVersion.home.rank;
      if (!game.away.record && espnVersion.away.record) game.away.record = espnVersion.away.record;
      if (!game.home.record && espnVersion.home.record) game.home.record = espnVersion.home.record;
      if (!game.venue && espnVersion.venue) game.venue = espnVersion.venue;
      if (!game.startTime && espnVersion.startTime) game.startTime = espnVersion.startTime;
      if (!game.sortTime && espnVersion.sortTime) game.sortTime = espnVersion.sortTime;
      // Take ESPN's detailed situation data if SB doesn't have it
      if (!game.pitcher && espnVersion.pitcher) game.pitcher = espnVersion.pitcher;
      if (!game.hitter && espnVersion.hitter) game.hitter = espnVersion.hitter;
      if (game.outs === 0 && espnVersion.outs > 0) game.outs = espnVersion.outs;
      if (game.balls === 0 && espnVersion.balls > 0) game.balls = espnVersion.balls;
      if (game.strikes === 0 && espnVersion.strikes > 0) game.strikes = espnVersion.strikes;
      if (!game.runners.first && !game.runners.second && !game.runners.third) {
        game.runners = espnVersion.runners;
      }
      // Take ESPN's line scores if SB doesn't have them
      if (game.away.lineScore.length === 0 && espnVersion.away.lineScore.length > 0) {
        game.away.lineScore = espnVersion.away.lineScore;
      }
      if (game.home.lineScore.length === 0 && espnVersion.home.lineScore.length > 0) {
        game.home.lineScore = espnVersion.home.lineScore;
      }
      if (game.away.hits == null && espnVersion.away.hits != null) game.away.hits = espnVersion.away.hits;
      if (game.home.hits == null && espnVersion.home.hits != null) game.home.hits = espnVersion.home.hits;
      if (game.away.errors == null && espnVersion.away.errors != null) game.away.errors = espnVersion.away.errors;
      if (game.home.errors == null && espnVersion.home.errors != null) game.home.errors = espnVersion.home.errors;
    }
    
    merged.set(game.id, game);
  }

  // Add ESPN games that aren't covered by StatBroadcast
  for (const game of espnGames) {
    const key = normalizeKey(game);
    if (!sbKeys.has(key)) {
      merged.set(game.id, game);
    }
  }

  return [...merged.values()];
}

// Sort games: live first (furthest along), then upcoming (earliest start), then final
function sortGames(games) {
  const order = { live: 0, pre: 1, final: 2 };
  return games.sort((a, b) => {
    const oa = order[a.status] ?? 1;
    const ob = order[b.status] ?? 1;
    if (oa !== ob) return oa - ob;
    if (a.status === 'live') return b.inning - a.inning; // furthest along first
    if (a.status === 'pre') return a.sortTime - b.sortTime; // earliest start first
    return b.sortTime - a.sortTime; // most recent final first
  });
}

// Compute simple win probability based on score and inning
function computeWinProb(game) {
  if (game.status === 'final') {
    return {
      away: game.away.score > game.home.score ? 100 : 0,
      home: game.home.score > game.away.score ? 100 : 0,
    };
  }
  if (game.status === 'pre') {
    return { away: 50, home: 50 };
  }
  
  // Simple model: lead * inning weight
  const diff = game.home.score - game.away.score;
  const innPct = Math.min(game.inning / 9, 1);
  // Larger leads later in the game = higher win prob
  const leverage = diff * (0.5 + innPct * 0.5) * 12;
  const homeProb = Math.round(Math.min(99, Math.max(1, 50 + leverage)));
  
  return {
    away: 100 - homeProb,
    home: homeProb,
  };
}

module.exports = { mergeGames, sortGames, computeWinProb };
