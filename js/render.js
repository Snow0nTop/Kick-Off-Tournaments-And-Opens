// Shared rendering helpers, used by every page's own small inline script.

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --------------------------------------------------------------- navigation
// Every page but the hub belongs to one tournament, carried in the address as
// ?t=<id>. The nav is built here so the id follows the visitor from page to
// page and no link can be left behind when a tournament is added.
function currentId() {
  return new URLSearchParams(location.search).get('t') || '';
}

function href(page, id) {
  return id ? page + '?t=' + encodeURIComponent(id) : page;
}

function renderNav(active, t) {
  const host = document.getElementById('nav');
  if (!host) return;
  const id = t ? t.id : '';
  const links = [
    ['overview.html', 'overview', 'Overview'],
    ['group-stage.html', 'group', 'Group Stage'],
    ['playoffs.html', 'playoffs', 'Playoffs'],
    ['rules.html', 'rules', 'Format &amp; Rules'],
  ];
  host.innerHTML = `
    <a class="brand" href="index.html">
      <img class="tlogo brand-logo" src="logos/kotao.webp" alt=""> KOTAO</a>
    ${t ? `<span class="nav-sep">/</span><span class="nav-tourney">${esc(t.name)}</span>` : ''}
    <nav class="navlinks">
      ${t ? links.map(([p, k, label]) =>
        `<a href="${href(p, id)}" class="${k === active ? 'active' : ''}">${label}</a>`).join('')
        : ''}
      <a href="index.html" class="${active === 'hub' ? 'active' : ''}">All tournaments</a>
    </nav>`;
}

// ---------------------------------------------------------------- team logos
// A logo file is named after its team, stripped down to letters and digits:
// "Sand Monkey FC" -> logos/sandmonkeyfc.webp. Two sizes exist: the plain name
// (96px, for everything inline) and a "-lg" variant (256px, for the hero and
// the champion banner).
//
// A team with no matching file falls back to a monogram badge of the same size,
// so renaming a team in a workbook never breaks a layout - it just loses the
// crest until someone drops in a file with the matching name.
const LOGO_SLUGS = new Set([
  'blizzardsfc', 'bmfc', 'califc', 'cerruanosfc', 'crownfc', 'kotao', 'sandmonkeyfc',
]);

function teamSlug(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // "Éclair" -> "Eclair"
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function monogram(name) {
  const words = String(name || '').replace(/\bFC\b/gi, '').trim().split(/\s+/);
  return words.slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

// opts: { cls, lg, named }  -  `named` labels the image for screen readers and
// adds a tooltip, for the few places that show a logo with no name beside it.
function logoHtml(name, opts) {
  opts = opts || {};
  const cls = 'tlogo' + (opts.cls ? ' ' + opts.cls : '');
  if (!name) return `<span class="${cls} tlogo-empty"></span>`;
  const label = opts.named ? ` title="${esc(name)}"` : '';
  const slug = teamSlug(name);
  if (!LOGO_SLUGS.has(slug)) {
    return `<span class="${cls} tlogo-mono"${label}>${esc(monogram(name))}</span>`;
  }
  return `<img class="${cls}" src="logos/${slug}${opts.lg ? '-lg' : ''}.webp"` +
         ` alt="${opts.named ? esc(name) : ''}"${label}>`;
}

// Logo + name, the pairing used almost everywhere. An undecided slot reads
// "TBD" everywhere on the site - never a blank, and never a guess.
function teamHtml(name, opts) {
  opts = opts || {};
  const cls = 'tname' + (opts.nameCls ? ' ' + opts.nameCls : '') + (name ? '' : ' tbd');
  return logoHtml(name, opts) + `<span class="${cls}">${esc(name || 'TBD')}</span>`;
}

// Stamps the footer with when the data was last published. For spectators it
// signals how fresh the page is; for an admin it is the confirmation that a
// publish actually landed - a stamp that did not move means it did not.
function renderUpdatedStamp(iso) {
  const host = document.getElementById('updated-stamp');
  if (!host) return;
  if (!iso) { host.textContent = ''; return; }
  const d = new Date(iso);
  if (isNaN(d)) { host.textContent = ''; return; }
  const abs = d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  let rel;
  if (mins < 1) rel = 'just now';
  else if (mins < 60) rel = `${mins} min ago`;
  else if (mins < 60 * 24) rel = `${Math.round(mins / 60)} h ago`;
  else rel = `${Math.round(mins / 1440)} d ago`;
  host.innerHTML = `Results last updated <span title="${esc(abs)}">${esc(rel)}</span> &middot; ${esc(abs)}`;
}

const PHASE_LABEL = {
  upcoming: 'Upcoming', group: 'Group Stage', tiebreak: 'Tiebreak Pending',
  playoffs: 'Playoffs', done: 'Completed',
};

function statusPillHtml(status) {
  let cls = 'pending';
  if (status === 'Finished') cls = 'finished';
  else if (/to play$/.test(status)) cls = 'next';
  else if (/^Still level/.test(status)) cls = 'level';
  else if (status === 'All rounds played - no winner') cls = 'error';
  return `<span class="status-pill ${cls}">${esc(status)}</span>`;
}

function pillRank(n) {
  return `<span class="pos-pill p${n}">${n}</span>`;
}

// A tournament's own match format, taken from its first group match. It is
// what decides which columns the standings carry and how a score reads.
function fmtOf(t) {
  return (t.groupRows[0] && t.groupRows[0].stats.format) || { kind: 'bo', bo: 3 };
}

// In the aggregate format goals win matches, so the standings lead with them.
function isAgg(t) {
  return fmtOf(t).kind === 'agg';
}

// -------------------------------------------------------------------- hub
function renderTournamentCards(container, raw) {
  container.innerHTML = '';
  (raw.tournaments || []).forEach(entry => {
    const t = buildTournament(entry);
    const done = t.phase === 'done';
    const card = el('a', 'tcard' + (done ? ' done' : ''));
    card.href = href('overview.html', t.id);
    const played = [1, 2, 3, 4, 5].filter(
      d => t.groupRows.filter(r => r.matchday === d).every(r => r.stats.over)).length;
    const sample = t.groupRows[0].stats.format;
    card.innerHTML = `
      <div class="tcard-top">
        <img class="tlogo tcard-logo" src="logos/kotao.webp" alt="">
        <div>
          <div class="tcard-name">${esc(t.name)}</div>
          <div class="tcard-tag">${esc(t.tagline || '')}</div>
        </div>
        <span class="badge ${done ? 'gold' : t.phase === 'upcoming' ? '' : 'live'}">${
          done ? '\u{1F3C6} ' : t.phase === 'upcoming' ? '' : '● '
        }${PHASE_LABEL[t.phase]}</span>
      </div>
      <div class="tcard-meta">
        <span>${esc(t.when || '')}</span>
        <span>${esc(formatLabel(sample))}</span>
        <span>${t.teams.length} teams</span>
        <span>Matchdays ${played}/5</span>
      </div>
      <div class="tcard-foot">
        ${t.champion
          ? `<span class="tcard-champ">Champion <span class="team-id">${teamHtml(t.champion, { cls: 'md' })}</span></span>`
          : `<span class="tcard-teams">${t.teams.slice().sort(byName)
               .map(n => logoHtml(n, { cls: 'sm', named: true })).join('')}</span>`}
        <span class="tcard-go">View →</span>
      </div>`;
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------- standings
function renderStandingsTable(container, t, opts) {
  opts = opts || {};
  // With nothing played the ranking is just the alphabet in disguise, so it is
  // shown as an unordered participant list rather than a fake standing.
  const ranked = t.anyGroupPlayed;
  const agg = isAgg(t);
  const pending = new Set([].concat(...t.unresolvedTies.map(g => g.teams)));
  const rows = t.standings.map(team => {
    const d = t.groupStats[team];
    // teams level on every criterion share this number - the alphabet only
    // decides which of them is printed first, never who is placed higher
    const n = t.rank[team];
    const flag = pending.has(team) ? '<span class="tie-flag">Tiebreak match pending</span>' : '';
    const goals = `<td class="num">${d.gf}-${d.ga}</td>
      <td class="num">${d.gd >= 0 ? '+' : ''}${d.gd}</td>`;
    const rounds = `<td class="num">${d.rw}-${d.rl}</td>
      <td class="num">${d.rd >= 0 ? '+' : ''}${d.rd}</td>`;
    return `<tr${pending.has(team) ? ' class="tied"' : ''}>
      <td class="rank-cell ${ranked && n <= 4 ? 'top4' : ''}">${
        ranked ? pillRank(n) : '<span class="pos-pill tbd">&ndash;</span>'}</td>
      <td class="team"><div class="team-cell"><span class="team-id">${teamHtml(team)}</span>${flag}</div></td>
      <td class="num">${d.mp}</td>
      <td class="num">${d.mw}-${d.ml}</td>
      ${opts.compact ? '' : (agg ? goals + rounds : rounds + goals)}
    </tr>`;
  }).join('');
  // the columns run in ranking order, so the table reads like the tiebreak list
  const gcols = '<th class="num">Goals (F-A)</th><th class="num">Goal +/-</th>';
  const rcols = '<th class="num">Rounds (W-L)</th><th class="num">Round +/-</th>';
  const head = opts.compact
    ? '<tr><th>#</th><th>Team</th><th class="num">MP</th><th class="num">W-L</th></tr>'
    : `<tr><th>#</th><th>Team</th><th class="num">MP</th><th class="num">Matches (W-L)</th>
        ${agg ? gcols + rcols : rcols + gcols}</tr>`;
  container.innerHTML = `<div class="table-scroll"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  if (!opts.compact) {
    const legend = el('div', 'legend', ranked
      ? (agg
          ? 'Tiebreak order: matches won &gt; goal difference &gt; round difference &gt; head-to-head. '
            + 'Goals are what win a match, so they rank above rounds.'
          : 'Tiebreak order: matches won &gt; round difference &gt; rounds won &gt; goal difference &gt; goals scored &gt; head-to-head. ')
        + 'Teams level on all of these share a rank.'
      : 'No matches played yet &mdash; teams are listed alphabetically, not ranked.');
    container.appendChild(legend);
  }
}

// Shown wherever the playoffs are waiting on a tiebreak match - only possible
// when three or more teams are level and beat each other in a circle. Returns
// null when there is nothing to announce.
function tieNoticeEl(t) {
  if (!t.unresolvedTies.length) return null;
  const list = t.unresolvedTies.map(g =>
    `<li><strong>${g.teams.map(esc).join(', ')}</strong> &mdash; level for place ${g.rank}</li>`).join('');
  return el('div', 'tie-notice', `
    <div class="tie-title">Playoff seeding on hold</div>
    <p>The group stage is over, but these teams are level on every criterion, head-to-head
       included. They will play a tiebreak match, and the bracket fills in once it is recorded.</p>
    <ul>${list}</ul>`);
}

// -------------------------------------------------------------- head-to-head
function renderHeadToHead(container, t) {
  const alpha = t.teams.slice().sort(byName);
  const agg = isAgg(t);
  const seriesOf = {};
  t.groupRows.forEach(r => {
    seriesOf[r.teamA + '|' + r.teamB] = { s: r.stats, flip: false };
    seriesOf[r.teamB + '|' + r.teamA] = { s: r.stats, flip: true };
  });
  // Column headers are the one genuinely cramped spot - six of them across a
  // narrow grid - so they carry the crest alone, with the name as a tooltip.
  let head = '<tr><th></th>' +
    alpha.map(a => `<th class="h2h-col">${logoHtml(a, { cls: 'md', named: true })}</th>`).join('') +
    '</tr>';
  let rows = alpha.map(rowTeam => {
    const cells = alpha.map(colTeam => {
      if (rowTeam === colTeam) return '<td class="diag">/</td>';
      const e = seriesOf[rowTeam + '|' + colTeam];
      if (!e || e.s.played === 0) return '<td></td>';
      const ra = e.flip ? e.s.rb : e.s.ra, rb = e.flip ? e.s.ra : e.s.rb;
      const ga = e.flip ? e.s.gb : e.s.ga, gb = e.flip ? e.s.ga : e.s.gb;
      // whichever number decides the match is the one that colours the cell
      const [a, b] = agg ? [ga, gb] : [ra, rb];
      const cls = a > b ? 'win' : (a < b ? 'loss' : '');
      // rounds on top, goals underneath in a smaller size - goals win the match
      return agg
        ? `<td class="${cls}"><span class="h2h-r">${ra}-${rb}</span>` +
          `<span class="h2h-g">${ga}-${gb}</span></td>`
        : `<td class="${cls}">${ra}-${rb}</td>`;
    }).join('');
    return `<tr><td class="rowlabel"><span class="team-id">${teamHtml(rowTeam)}</span></td>${cells}</tr>`;
  }).join('');
  container.innerHTML = `<div class="table-scroll"><table class="h2h"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

// -------------------------------------------------------------------- matchdays
function renderMatchdays(container, t) {
  const byDay = {};
  t.groupRows.forEach(r => (byDay[r.matchday] = byDay[r.matchday] || []).push(r));
  container.innerHTML = '';
  Object.keys(byDay).sort((a, b) => a - b).forEach(day => {
    const wrap = el('div', 'matchday');
    wrap.appendChild(el('h3', null, `Matchday ${day}`));
    const panel = el('div', 'panel');
    byDay[day].forEach(r => panel.appendChild(matchRow(r.teamA, r.teamB, r.stats, r.rounds)));
    wrap.appendChild(panel);
    container.appendChild(wrap);
  });
}

// The played rounds of a match, in order. A multi-game series (the Grand
// Final) keeps its games visibly apart, so "2-1" reads as two games to one
// rather than as a round score.
function roundsStripHtml(s, rounds) {
  const per = slotsPerGame(s.format), n = gameCount(s.format);
  const parts = [];
  for (let g = 0; g < n; g++) {
    const slots = (rounds || []).slice(g * per, (g + 1) * per).filter(Boolean);
    if (slots.length) parts.push(slots.map(r => `<span>${esc(r)}</span>`).join(''));
  }
  return parts.join('<span class="gdiv"></span>');
}

// The second line under a score, naming the numbers the headline is not
// showing. An aggregate match is won on goals, so its rounds go here; a
// best-of-matches series shows the goals behind its match wins.
function subScoreHtml(s) {
  if (!s.played || s.format.kind !== 'agg') return '';
  return s.multi
    ? `<div class="subscore">Goals ${s.ga}&ndash;${s.gb}</div>`
    : `<div class="subscore">Rounds ${s.ra}&ndash;${s.rb}</div>`;
}

function matchRow(teamA, teamB, s, rounds) {
  const row = el('div', 'match-row');
  const aWin = s.decided && s.winnerSide === 'a';
  const bWin = s.decided && s.winnerSide === 'b';
  row.appendChild(el('div', 'side', teamHtml(teamA, { cls: 'md', nameCls: 'win-name' + (aWin ? ' winner' : '') })));
  const mid = el('div', null,
    `<div class="score">${s.played ? s.wa : '-'}<span class="sep">:</span>${s.played ? s.wb : '-'}</div>
     ${subScoreHtml(s)}
     <div class="rounds-strip">${roundsStripHtml(s, rounds)}</div>`);
  row.appendChild(mid);
  row.appendChild(el('div', 'side right', teamHtml(teamB, { cls: 'md', nameCls: 'win-name' + (bWin ? ' winner' : '') })));
  row.appendChild(el('div', 'status', statusPillHtml(s.status)));
  return row;
}

// ------------------------------------------------------------------- bracket
function bracketMatchHtml(p) {
  const aWin = p.stats.decided && p.stats.winnerSide === 'a';
  const bWin = p.stats.decided && p.stats.winnerSide === 'b';
  const row = (name, score, isWinner, origin) => `
    <div class="brow ${isWinner ? 'winner' : ''} ${!name ? 'tbd' : ''}">
      ${logoHtml(name, { cls: 'sm' })}
      <span class="nm"${!name && origin ? ` title="${esc(origin)}"` : ''}>${esc(name || 'TBD')}</span>
      <span class="sc" title="${esc(scoreUnit(p.format))} won">${
        name && p.stats.played ? score : ''}</span>
    </div>`;
  return `<div class="bmatch">
    ${row(p.teamA, p.stats.wa, aWin, p._fromA)}
    ${row(p.teamB, p.stats.wb, bWin, p._fromB)}
  </div>`;
}

function renderBracket(container, t) {
  const byCode = {};
  t.playoffs.forEach(p => byCode[p.code] = p);
  // Where each slot's team will come from, mirroring the wiring in
  // computePlayoffs(). A slot that is still TBD carries this as a tooltip, so
  // an empty bracket stays readable without cluttering it with long labels.
  const ORIGIN = {
    'UB-SF1': ['Group stage #1', 'Group stage #4'],
    'UB-SF2': ['Group stage #2', 'Group stage #3'],
    'LB-QF1': ['Group stage #5', 'Loser of Upper Bracket Semifinal 1'],
    'LB-QF2': ['Group stage #6', 'Loser of Upper Bracket Semifinal 2'],
    'UB-F':   ['Winner of Upper Bracket Semifinal 1', 'Winner of Upper Bracket Semifinal 2'],
    'LB-SF':  ['Winner of Lower Bracket Quarterfinal 1', 'Winner of Lower Bracket Quarterfinal 2'],
    'LB-F':   ['Loser of Upper Bracket Final', 'Winner of Lower Bracket Semifinal'],
    'GF':     ['Winner of Upper Bracket Final', 'Winner of Lower Bracket Final'],
  };
  t.playoffs.forEach(p => {
    const o = ORIGIN[p.code] || [];
    p._fromA = o[0]; p._fromB = o[1];
  });

  const head = (title, p, marginCls) =>
    `<div class="round-head ${marginCls || ''}"><span class="title">${title}</span>` +
    `<div class="bo">${esc(formatShort(p.format))}</div></div>`;
  const round = (p, cls) => `<div class="round ${cls}">${bracketMatchHtml(p)}</div>`;
  const pair = (p1, p2, cls) => `<div class="round pair ${cls}">${bracketMatchHtml(p1)}${bracketMatchHtml(p2)}</div>`;

  container.innerHTML = `
    <div class="bracket-scroll">
      <div class="bk-top-headers">
        ${head('Upper Bracket Semifinals', byCode['UB-SF1'], 'mr-long')}
        ${head('Upper Bracket Final', byCode['UB-F'], 'mr-stub')}
        ${head('Grand Final', byCode['GF'], '')}
      </div>
      <div class="bracket-outer">
        <div class="half-stack">
          <div class="bk-row ub-row">
            ${pair(byCode['UB-SF1'], byCode['UB-SF2'], '')}
            ${round(byCode['UB-F'], 'single')}
          </div>
          <div class="bk-row lb-heads">
            ${head('Lower Bracket Quarterfinals', byCode['LB-QF1'])}
            ${head('Lower Bracket Semifinal', byCode['LB-SF'])}
            ${head('Lower Bracket Final', byCode['LB-F'])}
          </div>
          <div class="bk-row lb-row">
            ${pair(byCode['LB-QF1'], byCode['LB-QF2'], '')}
            ${round(byCode['LB-SF'], 'single out')}
            ${round(byCode['LB-F'], 'single')}
          </div>
        </div>
        <div class="gf-spine"></div>
        <div class="gf-col">${round(byCode['GF'], '')}</div>
      </div>
    </div>
    ${t.champion ? `<div class="champion-banner">
      ${logoHtml(t.champion, { cls: 'xl', lg: true })}
      <div class="label">Champion</div>
      <div class="name">${esc(t.champion)}</div>
    </div>` : ''}
  `;
}

function renderPlayoffList(container, t) {
  container.innerHTML = '';
  const panel = el('div', 'panel');
  t.playoffs.forEach(p => {
    // without the phase name these rows are indistinguishable from each other
    // before the teams are known - eight identical "TBD vs TBD" lines
    panel.appendChild(el('div', 'match-kind',
      `${esc(p.name)} &middot; ${esc(formatLabel(p.format))}`));
    panel.appendChild(matchRow(p.teamA, p.teamB, p.stats, p.rounds));
  });
  container.appendChild(panel);
}
