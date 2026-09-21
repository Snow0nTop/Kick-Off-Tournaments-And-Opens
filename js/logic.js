// Tournament computation engine. Mirrors the KOTAO workbooks' formulas exactly:
// same round-robin schedule, same match formats, same tiebreak order, same
// double-elimination seeding chain. Only raw scores are stored in data.js -
// everything else (standings, seeding, the bracket) is derived here, so the
// site can never drift from a workbook's own logic.
//
// Two match formats exist, and a tournament uses one of them throughout:
//
//   bo    a best-of series. First to ceil(bo/2) rounds takes the match, and
//         the remaining rounds are not played. An odd bo means no draw.
//   quad  a fixed block of 4 rounds - 2 hosted in the EST region, 2 in GMT -
//         and all four are always played. A group match that ends 2-2 is a
//         draw. A playoff match that ends 2-2 goes to one sudden-death
//         decider round, so it always has a winner. The Grand Final is a
//         best of 3 such blocks.

// Round-robin pairing of calendar slots 1-6 (circle method), by matchday.
// Which team fills each slot is the workbook's draw: data.js carries every
// match already resolved to team numbers (m.a, m.b), so this table is only the
// fallback for data exported before the draw existed.
const SCHEDULE = [
  [[1, 2], [3, 6], [4, 5]],
  [[1, 3], [2, 4], [5, 6]],
  [[1, 4], [3, 5], [2, 6]],
  [[1, 5], [4, 6], [2, 3]],
  [[1, 6], [2, 5], [3, 4]],
];

const PLAYOFF_PHASES = [
  { code: 'UB-SF1', name: 'Upper Bracket Semifinal 1' },
  { code: 'UB-SF2', name: 'Upper Bracket Semifinal 2' },
  { code: 'LB-QF1', name: 'Lower Bracket Quarterfinal 1' },
  { code: 'LB-QF2', name: 'Lower Bracket Quarterfinal 2' },
  { code: 'UB-F',   name: 'Upper Bracket Final' },
  { code: 'LB-SF',  name: 'Lower Bracket Semifinal' },
  { code: 'LB-F',   name: 'Lower Bracket Final' },
  { code: 'GF',     name: 'Grand Final' },
];

// Alphabetical order the way Excel sorts: case-insensitive, so "BM FC" comes
// after "Blizzards FC" here exactly as it does in the workbook.
function byName(a, b) {
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });
}

function parseRound(s) {
  if (typeof s !== 'string' || s.indexOf('-') === -1) return null;
  const i = s.indexOf('-');
  const a = parseInt(s.slice(0, i), 10);
  const b = parseInt(s.slice(i + 1), 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return [a, b];
}

// ------------------------------------------------------------------ formats
function slotsPerGame(fmt) {
  return fmt.kind === 'bo' ? fmt.bo : fmt.rounds + (fmt.decider ? 1 : 0);
}

function gameCount(fmt) {
  return fmt.kind === 'bo' ? 1 : fmt.games;
}

// What the site calls this format, in full.
function formatLabel(fmt) {
  if (!fmt) return '';
  if (fmt.kind === 'bo') return 'Best of ' + fmt.bo;
  if (fmt.games > 1) return 'Best of ' + fmt.games + ' · ' + fmt.rounds + ' rounds each';
  return fmt.rounds + ' rounds';
}

// The short version, for the cramped bracket headers.
function formatShort(fmt) {
  if (!fmt) return '';
  if (fmt.kind === 'bo') return 'Best of ' + fmt.bo;
  return fmt.games > 1 ? 'Best of ' + fmt.games : fmt.rounds + ' rounds';
}

// ------------------------------------------------------------------- series
// One match. `format` says how it is played; `rounds` is the flat list of
// round slots as the workbook lays them out (for a multi-game series, one
// game's slots after another).
function seriesStats(rounds, format) {
  const fmt = format || { kind: 'bo', bo: 3 };
  rounds = rounds || [];
  const per = slotsPerGame(fmt);
  const nGames = gameCount(fmt);
  const toWinRounds = fmt.kind === 'bo' ? Math.ceil(fmt.bo / 2) : Infinity;
  const toWinGames = Math.floor(nGames / 2) + 1;

  let ra = 0, rb = 0, ga = 0, gb = 0, played = 0;
  let gamesA = 0, gamesB = 0, next = 0;
  const games = [];

  for (let g = 0; g < nGames; g++) {
    const slots = rounds.slice(g * per, (g + 1) * per);
    let wa = 0, wb = 0, n = 0;
    for (const s of slots) {
      const sc = parseRound(s);
      if (!sc) continue;
      n++;
      ga += sc[0]; gb += sc[1];
      if (sc[0] > sc[1]) wa++;
      else if (sc[1] > sc[0]) wb++;
      // a genuine draw ("2-2") should never occur inside a round - sudden
      // death replaces it - but if one slips in, it credits nobody
    }
    played += n;
    ra += wa; rb += wb;

    // is this game finished, and who took it?
    let over, winner = null;
    if (fmt.kind === 'bo') {
      over = Math.max(wa, wb) >= toWinRounds || n >= fmt.bo;
      if (wa >= toWinRounds) winner = 'a';
      else if (wb >= toWinRounds) winner = 'b';
    } else {
      const full = n >= fmt.rounds;
      over = full && (wa !== wb || !fmt.decider || n >= per);
      if (over && wa !== wb) winner = wa > wb ? 'a' : 'b';
    }
    if (winner === 'a') gamesA++;
    else if (winner === 'b') gamesB++;
    games.push({ wa, wb, played: n, over, winner });

    // The first unplayed slot of the first unfinished game, series-wide. Once
    // the series is won there is no next round, and later games stay empty.
    if (!next && !over && Math.max(gamesA, gamesB) < toWinGames) next = g * per + n + 1;
  }

  const multi = nGames > 1;
  const decided = multi ? Math.max(gamesA, gamesB) >= toWinGames
                        : games[0].winner !== null;
  const winnerSide = decided ? (multi ? (gamesA > gamesB ? 'a' : 'b') : games[0].winner)
                             : null;
  const wa = multi ? gamesA : ra;
  const wb = multi ? gamesB : rb;
  const over = decided || (multi ? games.every(g => g.over) : games[0].over);
  // only a fixed-length block can end level; an odd best-of never can
  const drawn = !multi && over && !decided && fmt.kind !== 'bo';

  let status;
  if (played === 0) status = 'Not started';
  else if (decided) status = 'Finished';
  else if (drawn) status = 'Draw';
  else if (!next) status = 'All rounds played - no winner';
  else if (multi) {
    const g = Math.ceil(next / per), r = next - (g - 1) * per;
    status = `Game ${g}, round ${r} to play`;
  } else status = `Round ${next} to play`;

  return { wa, wb, ra, rb, ga, gb, played, decided, winnerSide, drawn, over,
           next, games, multi, format: fmt, status };
}

function computeGroupStage(teams, groupMatches) {
  // groupMatches[i] = {a, b, format, rounds} with a/b as 1-based positions in
  // `teams`, in calendar order (matchday 1's three matches, then matchday 2's...).
  const stats = {};
  teams.forEach(t => stats[t] = { mp: 0, mw: 0, md: 0, ml: 0,
                                  rw: 0, rl: 0, gf: 0, ga: 0 });

  const rows = [];
  let idx = 0;
  SCHEDULE.forEach((day, dayIdx) => {
    day.forEach(([slotA, slotB]) => {
      const m = groupMatches[idx++];
      const teamA = teams[(m.a || slotA) - 1], teamB = teams[(m.b || slotB) - 1];
      const s = seriesStats(m.rounds, m.format);
      rows.push({ matchday: dayIdx + 1, teamA, teamB, format: m.format,
                  rounds: m.rounds, stats: s });
      if (s.played > 0) {
        const da = stats[teamA], db = stats[teamB];
        da.mp++; db.mp++;
        da.rw += s.ra; da.rl += s.rb; db.rw += s.rb; db.rl += s.ra;
        da.gf += s.ga; da.ga += s.gb; db.gf += s.gb; db.ga += s.ga;
        if (s.decided) {
          if (s.winnerSide === 'a') { da.mw++; db.ml++; } else { db.mw++; da.ml++; }
        } else if (s.drawn) { da.md++; db.md++; }
      }
    });
  });
  teams.forEach(t => {
    const d = stats[t];
    d.rd = d.rw - d.rl;
    d.gd = d.gf - d.ga;
  });
  return { rows, stats };
}

// Tiebreak: matches won > round difference > rounds won > goal difference
// > goals scored > head-to-head > tiebreak match wins - exactly as in the
// workbooks. There is deliberately no alphabetical last resort.
//
// Head-to-head is a mini-league: among teams level on the first five
// criteria, count how many of those teams each one beat. Where a match cannot
// be drawn, two level teams are therefore always split by the match they
// played; only a circle - three or more level teams that beat each other in
// turn (A>B, B>C, C>A) - survives it. Those teams play a custom tiebreak
// match, recorded by admins as "tiebreak match wins".
function rankTeams(teams, stats, rows) {
  // Head-to-head is applied twice, like UEFA: first among all teams level on
  // the five criteria, then again among those still level after that. A pair
  // left over from a four-way tie (wins 2-2-1-1) is therefore always split by
  // the match the two of them played.
  const h2hPass = (field, levelOf) => {
    teams.forEach(t => { stats[t][field] = 0; });
    (rows || []).forEach(r => {
      if (!r.stats.decided) return;
      const w = r.stats.winnerSide === 'a' ? r.teamA : r.teamB;
      const l = r.stats.winnerSide === 'a' ? r.teamB : r.teamA;
      if (levelOf(w) === levelOf(l)) stats[w][field]++;
    });
  };
  const level = t => {
    const d = stats[t];
    return [d.mw, d.rd, d.rw, d.gd, d.gf].join('|');
  };
  h2hPass('h2h', level);
  h2hPass('h2h2', t => level(t) + '|' + stats[t].h2h);
  const key = t => {
    const d = stats[t];
    return [d.mw, d.rd, d.rw, d.gd, d.gf, d.h2h, d.h2h2, d.tb || 0];
  };
  const rank = {};
  teams.forEach(t => {
    let better = 0;
    teams.forEach(o => {
      if (o === t) return;
      const ko = key(o), kt = key(t);
      for (let i = 0; i < ko.length; i++) {
        if (ko[i] !== kt[i]) { if (ko[i] > kt[i]) better++; break; }
      }
    });
    rank[t] = better + 1;       // shared ranks skip: 1, 2, 2, 4 ...
  });
  return rank;
}

// Groups of two or more teams that share a rank - each one needs a tiebreak
// match before the playoffs can be seeded.
function tiedGroups(teams, rank) {
  const byRank = {};
  teams.forEach(t => (byRank[rank[t]] = byRank[rank[t]] || []).push(t));
  return Object.keys(byRank).map(Number).sort((a, b) => a - b)
    .filter(r => byRank[r].length > 1)
    .map(r => ({ rank: r, teams: byRank[r].slice().sort(byName) }));
}

// Resolves the double-elimination bracket from the ranked standings and the
// raw playoff round scores. Returns one entry per phase with team names
// (once known), the series stats, and winner/loser.
function computePlayoffs(rankByTeam, teams, playoffMatches, seedingSettled) {
  const byRank = {};
  teams.forEach(t => byRank[rankByTeam[t]] = t);

  const stats = playoffMatches.map(m => seriesStats(m.rounds, m.format));
  const teamOf = { a: {}, b: {} };
  const winner = i => stats[i].decided ? teamOf[stats[i].winnerSide === 'a' ? 'a' : 'b'][i] : '';
  const loser = i => stats[i].decided ? teamOf[stats[i].winnerSide === 'a' ? 'b' : 'a'][i] : '';
  // seeds only exist once every rank is unique - see tiedGroups()
  const seed = n => seedingSettled ? byRank[n] : '';

  teamOf.a[0] = seed(1); teamOf.b[0] = seed(4);
  teamOf.a[1] = seed(2); teamOf.b[1] = seed(3);
  teamOf.a[2] = seed(5); teamOf.b[2] = loser(0);
  teamOf.a[3] = seed(6); teamOf.b[3] = loser(1);
  teamOf.a[4] = winner(0); teamOf.b[4] = winner(1);
  teamOf.a[5] = winner(2); teamOf.b[5] = winner(3);
  teamOf.a[6] = loser(4);  teamOf.b[6] = winner(5);
  teamOf.a[7] = winner(4); teamOf.b[7] = winner(6);

  return PLAYOFF_PHASES.map((phase, i) => ({
    ...phase,
    format: playoffMatches[i].format,
    teamA: teamOf.a[i], teamB: teamOf.b[i],
    rounds: playoffMatches[i].rounds,
    stats: stats[i],
  }));
}

function buildTournament(raw) {
  const { teams, groupMatches, playoffMatches } = raw;
  const tiebreakWins = raw.tiebreakWins || [];
  const { rows: groupRows, stats: groupStats } = computeGroupStage(teams, groupMatches);
  teams.forEach((t, i) => { groupStats[t].tb = Number(tiebreakWins[i]) || 0; });
  const rank = rankTeams(teams, groupStats, groupRows);
  // Display order only: by rank, then alphabetically inside a shared rank.
  // The alphabet never decides a position - tied teams keep the same rank.
  const standings = teams.slice().sort((x, y) => rank[x] - rank[y] || byName(x, y));
  // A drawn group match is finished, so "complete" is not the same as "decided".
  const allDecided = groupRows.every(r => r.stats.over);
  // Before a single round is played every team ties on every tiebreak, so
  // every team shares rank 1. That is not a standing, and callers must not
  // present it as one.
  const anyGroupPlayed = groupRows.some(r => r.stats.played > 0);
  const ties = tiedGroups(teams, rank);
  // The playoffs can only be seeded when the group stage is over AND no two
  // teams share a rank.
  const seedingSettled = allDecided && ties.length === 0;
  const unresolvedTies = allDecided ? ties : [];
  const playoffs = computePlayoffs(rank, teams, playoffMatches, seedingSettled);
  const champion = playoffs[7].stats.decided
    ? (playoffs[7].stats.winnerSide === 'a' ? playoffs[7].teamA : playoffs[7].teamB)
    : null;
  const anyPlayoffPlayed = playoffs.some(p => p.stats.played > 0);
  // One word for where the tournament stands, shared by the hub and the pages.
  const phase = champion ? 'done'
    : !allDecided ? (anyGroupPlayed ? 'group' : 'upcoming')
    : !seedingSettled ? 'tiebreak'
    : 'playoffs';
  return { ...raw, teams, groupRows, groupStats, rank, standings, allDecided,
           anyGroupPlayed, anyPlayoffPlayed, seedingSettled, unresolvedTies,
           playoffs, champion, phase };
}

// The tournament a page was asked for: ?t=<id>, falling back to the first one.
function pickTournament(raw, id) {
  const list = (raw && raw.tournaments) || [];
  return list.find(t => t.id === id) || list[0] || null;
}

// Bridge for the Node-based parity test harness; harmless in the browser
// (module is undefined there, so this line never runs).
if (typeof module !== 'undefined') {
  module.exports = { byName, parseRound, seriesStats, computeGroupStage, rankTeams,
                     tiedGroups, computePlayoffs, buildTournament, pickTournament,
                     formatLabel, formatShort, slotsPerGame, gameCount,
                     SCHEDULE, PLAYOFF_PHASES };
}
