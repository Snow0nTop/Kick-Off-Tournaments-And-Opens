// Tournament computation engine. Mirrors the KOTAO workbooks' formulas exactly:
// same round-robin schedule, same match formats, same tiebreak order, same
// double-elimination seeding chain. Only raw scores are stored in data.js -
// everything else (standings, seeding, the bracket) is derived here, so the
// site can never drift from a workbook's own logic.
//
// Two match formats exist, and a tournament uses one of them throughout:
//
//   agg   a match is 4 rounds - 2 hosted in the EST region, 2 in GMT - and the
//         team with more GOALS added up across them wins it. Rounds won do not
//         decide anything. A round may end level, and then it is worth half a
//         win to each side, so rounds read 2.5-1.5 as readily as 3-1.
//         In the GROUP STAGE the four rounds are all there is: level on goals
//         means the match is DRAWN, worth a point to each side (3/1/0).
//         In the PLAYOFFS a draw is impossible - level on goals means two more
//         rounds, one per region, again and again, so a match runs 4, 6, 8 ...
//         The group format carries `draw: true`; the playoff one does not.
//   bo    a best-of series. First to ceil(bo/2) ROUNDS takes the match, and the
//         remaining rounds are not played. An odd bo means no draw.
//
// Both can be wrapped in a best-of-N-matches series (the Grand Final), where
// each match won is worth one point and the first to a majority takes it.

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

// The tiebreak chain a format ranks on, before head-to-head. Head-to-head,
// a second head-to-head pass and the custom tiebreak match are appended to
// both - see rankTeams(). There is deliberately no alphabetical last resort.
const CHAINS = {
  // a group match can be drawn, so points lead; then matches won, because two
  // teams on equal points have not necessarily won the same number; then goals,
  // which are what win a match, and only then rounds
  agg: ['pts', 'mw', 'gd', 'rd'],
  // rounds decide a match, so round difference comes first
  bo:  ['mw', 'rd', 'rw', 'gd', 'gf'],
};

// A workbook whose TEAMS block is still empty - an event announced before its
// line-up is known. Every slot still needs its own identity, or six blank names
// would collapse into one team in the standings and one row in the head-to-head
// grid. Each empty slot therefore gets a marker name, and the site prints TBD
// wherever one turns up. The marker is deliberately printable: if it ever
// escaped to the screen it would be obvious rather than invisible.
const BLANK_PREFIX = '@@slot-';
const BLANK = i => BLANK_PREFIX + (i + 1);

function isBlankTeam(name) {
  return !name || String(name).startsWith(BLANK_PREFIX);
}

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
// How many round slots one match of this format reserves in the workbook.
function slotsPerGame(fmt) {
  return fmt.kind === 'bo' ? fmt.bo : fmt.slots;
}

function gameCount(fmt) {
  return fmt.games || 1;
}

// What the site calls this format, in full.
function formatLabel(fmt) {
  if (!fmt) return '';
  const one = fmt.kind === 'bo' ? 'Best of ' + fmt.bo
                                : fmt.rounds + ' rounds, most goals wins';
  if (gameCount(fmt) > 1) {
    const each = fmt.kind === 'bo' ? 'Best of ' + fmt.bo : fmt.rounds + ' rounds';
    return 'Best of ' + fmt.games + ' · ' + each + ' each';
  }
  return one;
}

// The short version, for the cramped bracket headers.
function formatShort(fmt) {
  if (!fmt) return '';
  if (gameCount(fmt) > 1) return 'Best of ' + fmt.games;
  return fmt.kind === 'bo' ? 'Best of ' + fmt.bo : fmt.rounds + ' rounds';
}

// What the headline score of a match counts, for labels and tooltips.
function scoreUnit(fmt) {
  if (gameCount(fmt) > 1) return 'matches';
  return fmt && fmt.kind === 'agg' ? 'goals' : 'rounds';
}

// ------------------------------------------------------------------- series
// One match. `format` says how it is played; `rounds` is the flat list of
// round slots as the workbook lays them out (for a best-of-matches series, one
// match's slots after another).
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
    let wa = 0, wb = 0, na = 0, nb = 0, n = 0;
    for (const s of slots) {
      const sc = parseRound(s);
      if (!sc) continue;
      n++;
      na += sc[0]; nb += sc[1];
      if (sc[0] > sc[1]) wa++;
      else if (sc[1] > sc[0]) wb++;
      // a level round is shared: half a win each, so a four-round match can
      // read 2.5-1.5. Only the aggregate format allows it; a best-of round
      // goes to sudden death and credits nobody if one somehow slips in
      else if (fmt.kind === 'agg') { wa += 0.5; wb += 0.5; }
    }
    played += n;
    ra += wa; rb += wb; ga += na; gb += nb;

    // is this match finished, and who took it?
    let over, winner = null;
    if (fmt.kind === 'bo') {
      over = Math.max(wa, wb) >= toWinRounds || n >= fmt.bo;
      if (wa >= toWinRounds) winner = 'a';
      else if (wb >= toWinRounds) winner = 'b';
    } else if (fmt.draw) {
      // group stage: the four rounds are the whole match, level or not
      over = n >= fmt.rounds;
      if (over && na !== nb) winner = na > nb ? 'a' : 'b';
    } else {
      // complete only on a whole block: the base 4, then every extra pair
      const whole = n >= fmt.rounds && (n - fmt.rounds) % fmt.extra === 0;
      over = whole && na !== nb;
      if (over) winner = na > nb ? 'a' : 'b';
    }
    if (winner === 'a') gamesA++;
    else if (winner === 'b') gamesB++;
    games.push({ wa, wb, ga: na, gb: nb, played: n, over, winner });

    // The first unplayed slot of the first unfinished match, series-wide. Once
    // the series is won there is no next round, and later matches stay empty.
    if (!next && !over && n < per && Math.max(gamesA, gamesB) < toWinGames) {
      next = g * per + n + 1;
    }
  }

  const multi = nGames > 1;
  const decided = multi ? Math.max(gamesA, gamesB) >= toWinGames
                        : games[0].winner !== null;
  const winnerSide = decided ? (multi ? (gamesA > gamesB ? 'a' : 'b') : games[0].winner)
                             : null;
  // the headline score counts whatever actually decides this match
  const wa = multi ? gamesA : (fmt.kind === 'agg' ? ga : ra);
  const wb = multi ? gamesB : (fmt.kind === 'agg' ? gb : rb);
  const over = decided || (multi ? games.every(g => g.over) : games[0].over);
  // a group match left level on goals after its four rounds; nothing else here
  // can end this way, because every other format plays on until it is split
  const drawn = !multi && over && !decided;

  let status;
  if (played === 0) status = 'Not started';
  else if (decided) status = 'Finished';
  // only a format that allows draws reports one; anywhere else a match that is
  // over with no winner is a mistyped level round, and must still say so
  else if (drawn && fmt.draw) status = 'Drawn';
  else if (!next) status = fmt.kind === 'agg' ? 'Still level - play two more rounds'
                                              : 'All rounds played - no winner';
  else if (multi) {
    const g = Math.ceil(next / per), r = next - (g - 1) * per;
    status = `Match ${g}, round ${r} to play`;
  } else status = `Round ${next} to play`;

  return { wa, wb, ra, rb, ga, gb, played, decided, winnerSide, drawn, over,
           next, games, multi, format: fmt, status };
}

function computeGroupStage(teams, groupMatches) {
  // groupMatches[i] = {a, b, format, rounds} with a/b as 1-based positions in
  // `teams`, in calendar order (matchday 1's three matches, then matchday 2's...).
  const stats = {};
  teams.forEach(t => stats[t] =
    { mp: 0, mw: 0, md: 0, ml: 0, rw: 0, rl: 0, gf: 0, ga: 0 });

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
        } else if (s.drawn) {
          da.md++; db.md++;
        }
      }
    });
  });
  teams.forEach(t => {
    const d = stats[t];
    d.rd = d.rw - d.rl;
    d.gd = d.gf - d.ga;
    d.pts = d.mw * 3 + d.md;            // win 3, draw 1, loss 0
  });
  return { rows, stats };
}

// Ranks the teams on that format's chain (see CHAINS), then head-to-head, then
// the custom tiebreak match - exactly as in the workbooks.
//
// Head-to-head is a mini-league: among teams level on the chain, count how many
// of those teams each one beat - a drawn match counts for neither. Two level
// teams are split by the match they played unless that match was itself drawn;
// a circle survives it too - three or more level teams that beat each other in
// turn (A>B, B>C, C>A). Those teams play a custom tiebreak match, recorded by
// admins as "tiebreak match wins".
function rankTeams(teams, stats, rows, chain) {
  chain = chain || CHAINS.bo;
  // Head-to-head is applied twice, like UEFA: first among all teams level on
  // the chain, then again among those still level after that. A pair left over
  // from a four-way tie (wins 2-2-1-1) is therefore always split by the match
  // the two of them played.
  const h2hPass = (field, levelOf) => {
    teams.forEach(t => { stats[t][field] = 0; });
    (rows || []).forEach(r => {
      if (!r.stats.decided) return;
      const w = r.stats.winnerSide === 'a' ? r.teamA : r.teamB;
      const l = r.stats.winnerSide === 'a' ? r.teamB : r.teamA;
      if (levelOf(w) === levelOf(l)) stats[w][field]++;
    });
  };
  const level = t => chain.map(k => stats[t][k]).join('|');
  h2hPass('h2h', level);
  h2hPass('h2h2', t => level(t) + '|' + stats[t].h2h);
  const key = t => chain.map(k => stats[t][k])
    .concat([stats[t].h2h, stats[t].h2h2, stats[t].tb || 0]);
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
  const { groupMatches, playoffMatches } = raw;
  const teams = (raw.teams || []).map((n, i) => {
    const name = n == null ? '' : String(n).trim();
    return name || BLANK(i);
  });
  const namedTeams = teams.filter(t => !isBlankTeam(t)).length;
  const tiebreakWins = raw.tiebreakWins || [];
  const { rows: groupRows, stats: groupStats } = computeGroupStage(teams, groupMatches);
  teams.forEach((t, i) => { groupStats[t].tb = Number(tiebreakWins[i]) || 0; });
  const kind = (groupMatches[0] && groupMatches[0].format &&
                groupMatches[0].format.kind) || 'bo';
  const rank = rankTeams(teams, groupStats, groupRows, CHAINS[kind]);
  // Display order only: by rank, then alphabetically inside a shared rank.
  // The alphabet never decides a position - tied teams keep the same rank.
  const standings = teams.slice().sort((x, y) => rank[x] - rank[y] || byName(x, y));
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
  return { ...raw, teams, namedTeams, kind, chain: CHAINS[kind], groupRows, groupStats,
           rank, standings, allDecided, anyGroupPlayed, anyPlayoffPlayed, seedingSettled,
           unresolvedTies, playoffs, champion, phase };
}

// The tournament a page was asked for: ?t=<id>, falling back to the first one.
function pickTournament(raw, id) {
  const list = (raw && raw.tournaments) || [];
  return list.find(t => t.id === id) || list[0] || null;
}

// Bridge for the Node-based parity test harness; harmless in the browser
// (module is undefined there, so this line never runs).
if (typeof module !== 'undefined') {
  module.exports = { byName, isBlankTeam, parseRound, seriesStats, computeGroupStage, rankTeams,
                     tiedGroups, computePlayoffs, buildTournament, pickTournament,
                     formatLabel, formatShort, scoreUnit, slotsPerGame, gameCount,
                     SCHEDULE, PLAYOFF_PHASES, CHAINS };
}
