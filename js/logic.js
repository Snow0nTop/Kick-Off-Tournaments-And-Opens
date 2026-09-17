// Tournament computation engine. Mirrors the KOTAO workbook's formulas exactly:
// same round-robin schedule, same BO/to-win rule, same tiebreak order, same
// double-elimination seeding chain. Only raw scores are stored in data.js -
// everything else (standings, seeding, the bracket) is derived here, so the
// site can never drift from the workbook's own logic.

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

function parseRound(s) {
  if (typeof s !== 'string' || s.indexOf('-') === -1) return null;
  const i = s.indexOf('-');
  const a = parseInt(s.slice(0, i), 10);
  const b = parseInt(s.slice(i + 1), 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return [a, b];
}

// One series (a "match" in KOTAO's vocabulary): 3, 5 or 7 rounds.
function seriesStats(rounds, bo) {
  let wa = 0, wb = 0, ga = 0, gb = 0, played = 0;
  for (const s of rounds || []) {
    const sc = parseRound(s);
    if (!sc) continue;
    played++;
    ga += sc[0]; gb += sc[1];
    if (sc[0] > sc[1]) wa++;
    else if (sc[1] > sc[0]) wb++;
    // a genuine draw ("2-2") should never occur - sudden death replaces it -
    // but if one slips in, it simply doesn't credit a round win to either side
  }
  const toWin = Math.ceil(bo / 2);
  const decided = Math.max(wa, wb) >= toWin;
  const next = decided || played >= bo ? 0 : played + 1;
  let status;
  if (played === 0) status = 'Not started';
  else if (decided) status = 'Finished';
  else if (next === 0) status = 'All rounds played - no winner';
  else status = `Round ${next} to play`;
  return { wa, wb, ga, gb, played, toWin, decided, next, status,
           winnerSide: decided ? (wa > wb ? 'a' : 'b') : null };
}

function computeGroupStage(teams, groupMatches) {
  // groupMatches[i] = {a, b, bo, rounds} with a/b as 1-based team numbers,
  // in SCHEDULE order (matchday 1's three matches, then matchday 2's, ...).
  const stats = {};
  teams.forEach(t => stats[t] = { mp: 0, mw: 0, ml: 0, rw: 0, rl: 0, gf: 0, ga: 0 });

  const rows = [];
  let idx = 0;
  SCHEDULE.forEach((day, dayIdx) => {
    day.forEach(([a, b]) => {
      const m = groupMatches[idx++];
      const teamA = teams[a - 1], teamB = teams[b - 1];
      const s = seriesStats(m.rounds, m.bo);
      rows.push({ matchday: dayIdx + 1, teamA, teamB, bo: m.bo, rounds: m.rounds, stats: s });
      if (s.played > 0) {
        const da = stats[teamA], db = stats[teamB];
        da.mp++; db.mp++;
        da.rw += s.wa; da.rl += s.wb; db.rw += s.wb; db.rl += s.wa;
        da.gf += s.ga; da.ga += s.gb; db.gf += s.gb; db.ga += s.ga;
        if (s.decided) {
          if (s.winnerSide === 'a') { da.mw++; db.ml++; } else { db.mw++; da.ml++; }
        }
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
// workbook. There is deliberately no alphabetical last resort.
//
// Head-to-head is a mini-league: among teams level on the first five
// criteria, count how many of those teams each one beat. Two level teams have
// always met once the group stage is over, and no match can end drawn, so the
// winner of that match goes ahead. Only a circle - three or more level teams
// that beat each other in turn (A>B, B>C, C>A) - survives it; those teams play
// a custom tiebreak match, recorded by admins as "tiebreak match wins".
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
    .map(r => ({ rank: r, teams: byRank[r].slice().sort() }));
}

// Resolves the double-elimination bracket from the ranked standings and the
// raw playoff round scores. Returns one entry per phase with team names
// (once known), the series stats, and winner/loser.
function computePlayoffs(rankByTeam, teams, playoffMatches, seedingSettled) {
  const byRank = {};
  teams.forEach(t => byRank[rankByTeam[t]] = t);

  const stats = playoffMatches.map(m => seriesStats(m.rounds, m.bo));
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
    bo: playoffMatches[i].bo,
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
  const standings = teams.slice().sort((x, y) => rank[x] - rank[y] || (x < y ? -1 : x > y ? 1 : 0));
  const allDecided = groupRows.every(r => r.stats.decided);
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
  return { teams, groupRows, groupStats, rank, standings, allDecided, anyGroupPlayed,
           seedingSettled, unresolvedTies, playoffs, champion };
}

// Bridge for the Node-based parity test harness; harmless in the browser
// (module is undefined there, so this line never runs).
if (typeof module !== 'undefined') {
  module.exports = { parseRound, seriesStats, computeGroupStage, rankTeams, tiedGroups,
                     computePlayoffs, buildTournament, SCHEDULE, PLAYOFF_PHASES };
}
