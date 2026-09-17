# KOTAO Tournament

The official tracker and public website for the KOTAO tournament: six teams, a
round-robin group stage, and double-elimination playoffs.

- **Admins** keep every result in an Excel workbook.
- **The website** is a static, read-only page generated from that workbook:
  standings, match reports, head-to-head, and the bracket. There is no login and
  nothing on the site can be edited — a deliberate choice, so no account system
  is needed.

---

## Contents

- [Folder layout](#folder-layout)
- [Quick start](#quick-start)
- **Admin guide**
  1. [First-time setup on a new computer](#1-first-time-setup-on-a-new-computer)
  2. [The three workbooks](#2-the-three-workbooks)
  3. [Inside the workbook](#3-inside-the-workbook)
  4. [Ranking and ties](#4-ranking-and-ties)
  5. [Publishing with update-site.bat](#5-publishing-with-update-sitebat)
  6. [What the site shows, and when](#6-what-the-site-shows-and-when)
  7. [Starting a new season](#7-starting-a-new-season)
  8. [Backups](#8-backups)
  9. [Troubleshooting](#9-troubleshooting)
- **Under the hood**
  - [How the data flows](#how-the-data-flows)
  - [Previewing other states](#previewing-other-states)
  - [Team crests](#team-crests)
  - [Hosting](#hosting)
  - [Known gaps](#known-gaps)

---

## Folder layout

```
KOTAO/
├── README.md               this guide
├── update-site.bat         double-click to publish results  ← admins use this
├── workbooks/
│   ├── KOTAO_2026.xlsx     THE OFFICIAL TOURNAMENT           ← admins type here
│   ├── KOTAO_empty.xlsx    blank backup / template - never type in it
│   └── KOTAO_example.xlsx  a complete demo tournament, random results
├── website/                the site itself - linked to the GitHub repository
│   ├── index.html          Overview
│   ├── group-stage.html    Standings, head-to-head, matchdays
│   ├── playoffs.html       Bracket and playoff results
│   ├── rules.html          Format & rules, written for players
│   ├── data/data.js        the results - written by update-site.bat
│   ├── css/  js/           styling and page logic
│   ├── logos/              team crests, generated - do not edit by hand
│   ├── favicon.png, apple-touch-icon.png
│   └── .git/               hidden - the link to GitHub, never delete it
├── tools/
│   ├── export_data.py      workbook -> website/data/data.js (run by the .bat)
│   ├── make_logos.py       crest artwork -> website/logos/
│   └── test_parity.js      optional check of the site's engine (needs Node.js)
└── assets/
    └── crests/             original crest artwork (~1 MB each), kept out of the site
```

---

## Quick start

After every match:

1. Open **`workbooks/KOTAO_2026.xlsx`**, type the round scores, press **Ctrl+S**.
2. Double-click **`update-site.bat`**. It reads the workbook and sends the
   results to GitHub by itself; the live site updates a minute or two later.
3. Open the site, press **Ctrl+F5**, and check the footer shows the time you
   ran the .bat.

The live site: <https://snow0ntop.github.io/Kick-Off-Tournaments-And-Opens/>

That is the whole routine. The rest of this guide explains every piece and how to
recover when something looks wrong.

---

# Admin guide

## 1. First-time setup on a new computer

Publishing needs Python, Git and a GitHub account. Viewing the site needs
nothing but a browser.

1. Install **Python 3** from <https://www.python.org/downloads/>.
   On the first installer screen, tick **"Add python.exe to PATH"**.
2. Open a terminal (Start menu → *Terminal*) and run once:

   ```
   python -m pip install openpyxl
   ```

3. Install **Git for Windows** from <https://git-scm.com> (the default options
   are fine).
4. Have a **GitHub account**, and ask the repository owner to add you under the
   repository's **Settings → Collaborators**. Accept the invitation e-mail.
5. Copy the whole `KOTAO` folder to the computer — **including the hidden
   `website/.git` folder**, which is what links the site to GitHub (copying the
   `KOTAO` folder as a whole takes it along). The folder can live anywhere.
6. Run `update-site.bat` once. The first time, a browser window asks you to
   sign in to GitHub; after that it never asks again on that computer.

If the hidden folder got lost, recreate the link from the `KOTAO` folder in a
terminal:

```
git clone https://github.com/Snow0nTop/Kick-Off-Tournaments-And-Opens.git website
```

(rename or delete the old `website` folder first).

Only whoever maintains the crests also needs `python -m pip install pillow`
(see [Team crests](#team-crests)).

If anything is missing, `update-site.bat` says so and publishes nothing.

> **One workbook for all admins.** Each copy of the `KOTAO` folder publishes
> *its own* `KOTAO_2026.xlsx`, and the last one published wins. Agree on a
> single person entering results, or keep the workbook in one shared place
> (e.g. a shared OneDrive or Google Drive folder) and always publish from the
> up-to-date file.

## 2. The three workbooks

All three live in `workbooks/`. **Only the first one is official.**

| File | Role |
|---|---|
| **`KOTAO_2026.xlsx`** | **The official tournament.** Real team names; scores are added as matches are played. This is the only file `update-site.bat` publishes. |
| `KOTAO_empty.xlsx` | Blank backup — `Team 1` to `Team 6`, no scores, every formula intact. Never type in it; copy it when a fresh workbook is needed (see [Starting a new season](#7-starting-a-new-season)). |
| `KOTAO_example.xlsx` | A complete demo tournament filled with random results, to see how everything looks once decided. Its results mean nothing — never publish it as the real thing. |

## 3. Inside the workbook

Each workbook has two sheets: **Tournament**, where admins work, and
**Calculations**, which nobody types in. Every block on the Tournament sheet has
a grey note under its title explaining it.

### What you type, and what is calculated

**Type only in the shaded (yellow) cells.** Everything else is a formula; the
sheet is not locked, so typing over one would silently replace it.

| Rows | Block | You type | Calculated for you |
|---|---|---|---|
| 7–12 | **Teams** | Column **B**: the six team names, in alphabetical order. Column **C**: tiebreak match wins — only in the rare case in [Ranking and ties](#4-ranking-and-ties) | A name out of alphabetical order turns **red** |
| 16–22 | **Group stage standings** | nothing | Rank, matches, rounds, goals, and a **Tie** column that flags a tiebreak match still to be played |
| 26–32 | **Head to head** | nothing | Rounds won by the row team against the column team (green = won that match, red = lost) |
| 37–51 | **Group stage match report** | Columns **D–F**: Round 1–3 scores. Column **H**: the BO format (3) | Team names, Result, Status |
| 56–63 | **Playoffs match report** | Columns **D–J**: Round 1–7 scores. Column **L**: the BO format (5 or 7) | Pairings, Result, Status |
| 53–74, columns O–Y | **Playoffs bracket** | nothing | The whole bracket, drawn from the playoffs match report |

Things worth knowing:

- **Team names drive everything.** Every other table reads rows 7–12, so
  renaming a team updates the standings, fixtures and bracket at once. It also
  changes which crest the website shows for that team — see
  [Team crests](#team-crests).
- **The team order is the calendar.** Fixtures come from each team's row number
  (team 1 meets team 2 on matchday 1, and so on). Names are kept in alphabetical
  order, and must be final **before** the schedule is announced — reordering them
  later moves fixtures to other matchdays.
- **Playoff pairings fill themselves in** once every group match has a winner
  *and* no two teams share a rank. Until then they are blank.
- **The Status column** reads `Not started`, `Round N to play`, `Finished`, or
  `All rounds played - no winner` (a data error — see below).

### How to type a score

One round per cell, as `goalsA-goalsB`, where Team A is the left-hand team:

```
3-1     Team A won that round, 3 goals to 1
0-2     Team B won it
```

Leave a round empty until it is played. Stop as soon as a team has enough round
wins — a Best of 3 that ends 2–0 uses Round 1 and Round 2 only.

| Format | Rounds needed to win |
|---|---|
| BO3 (group stage) | 2 |
| BO5 | 3 |
| BO7 | 4 |

> The score cells are formatted as **Text** on purpose: otherwise Excel quietly
> turns `2-1` into a date. Never change their format.

### The no-draw rule

A round never ends level. If it does, it is replayed as sudden death — first
goal wins — as many times as needed, and **only the decisive scoreline is
recorded**. Never type `2-2`.

### Colour coding

| Colour | Where | Meaning |
|---|---|---|
| Blue | match reports | The next round to be played in that match |
| Grey | match reports | A round that will never be played — the match is already decided |
| Red | match reports | A tied score was typed by mistake |
| Red | team names | A name is out of alphabetical order |
| Bold | playoffs | The winner of each playoff match |

### Never do this in the workbook

The website reads the workbook by **fixed cell positions**. These actions shift
cells and silently break publishing:

- inserting or deleting rows or columns;
- sorting, cutting or moving blocks, or renaming the sheets;
- typing over a formula (anything not shaded).

Changing a team *name* in place, or a score, is always safe.

### The Calculations sheet — look, don't touch

495 formulas: per-match stats, per-team totals, the head-to-head passes, seeds,
the playoff chain, and two flags — *Group stage complete* and *Seeding
settled*. It stays visible so anything can be audited.

In a French-language Excel, the flags read `VRAI` / `FAUX` instead of
`TRUE` / `FALSE`. That is only Excel's display language; the values are the same.

## 4. Ranking and ties

Teams are ranked on these criteria, in order:

1. Matches won
2. Round difference (rounds won − rounds lost)
3. Rounds won
4. Goal difference
5. Goals scored
6. **Head-to-head** — among the teams level on 1–5, the wins each one took off
   the others; then applied again to any teams still level.

**There is no alphabetical tiebreak.** A name never places a team higher. Teams
level on all six criteria **share a rank** (you may see 1, 2, 2, 4 …).

Head-to-head settles almost everything: once the group stage is over, any two
level teams have played each other, and no match can be drawn. The only tie it
cannot break is a **perfect circle** — three or more level teams that beat each
other in turn (A beat B, B beat C, C beat A).

When that happens:

1. The standings' **Tie** column shows *Tiebreak match needed*; the playoff
   pairings stay blank; the website shows *Playoff seeding on hold*.
2. The tied teams play a **custom tiebreak match**.
3. Type each tied team's wins from it in the **Teams** block, column **C**.
   Leave every other team's cell empty.
4. The ranks separate and the pairings fill in. Publish as usual.

During the group stage shared ranks are normal — teams that have not met yet can
be level — so nothing is flagged until every group match is finished.

## 5. Publishing with update-site.bat

The website never reads Excel. It reads one file, `website/data/data.js`.
`update-site.bat` rewrites that file from the **saved** workbook and sends it
to GitHub, which serves the live site. It never modifies the workbook.

What it does, in order:

1. Checks that Python and Git are installed, and that `website` is linked to
   GitHub.
2. Checks whether `KOTAO_2026.xlsx` is open in Excel. If so, it reminds you that
   only saved work is published and waits for a key press (Ctrl+C cancels).
3. **[1/3] Syncing with GitHub** — fetches anything another admin published.
4. **[2/3] Reading the workbook** — writes `website/data/data.js` and reports
   what it found.
5. **[3/3] Sending to GitHub** — commits and pushes the `website` folder. Any
   other change inside `website` (a new crest, for example) goes along too.

### Reading its output

```
Read teams   : ['Blizzards FC', 'Cali FC', 'Cerruanos FC', ...]
Rounds       : 27
Wrote        : website\data\data.js
Source       : workbooks\KOTAO_2026.xlsx
```

`Rounds` is the number of round scores found. **If it did not go up after you
entered results, they were not saved.**

| Message | Meaning |
|---|---|
| `REMINDER: KOTAO_2026.xlsx is open in Excel` | Only saved work is published. Press Ctrl+S in Excel first if needed. |
| `NOTE: that workbook is currently open in Excel` | Same reminder, printed by the script itself. Harmless if you saved first. |
| `WARNING: no scores found at all` | Normal before the first match. Otherwise the scores were not saved. |
| `ERROR: Python is not installed` | See [First-time setup](#1-first-time-setup-on-a-new-computer). |
| `ERROR: the openpyxl package is missing` | Run `python -m pip install openpyxl` once. |
| `ERROR: workbook not found` | `KOTAO_2026.xlsx` is not in the `workbooks` folder, or was renamed. |
| `ERROR: cannot read KOTAO_2026.xlsx` | Windows is blocking the file. Close it in Excel and run again. |
| `ERROR: Git is not installed` | Install Git for Windows, see [First-time setup](#1-first-time-setup-on-a-new-computer). |
| `ERROR: the website folder is not linked to GitHub` | The hidden `website/.git` folder is missing — see [First-time setup](#1-first-time-setup-on-a-new-computer). |
| `ERROR: could not sync with GitHub` | No internet connection, or GitHub is down. Try again later. |
| `ERROR: GitHub refused the upload` | Not signed in, or not a collaborator on the repository. |
| `Nothing changed - the site is already up to date` | Harmless: the published data was already identical. |
| `Published.` | Done. The live site shows it within a minute or two. |
| `NOTHING WAS PUBLISHED` | Always follows an ERROR line; the website was not changed. |

**The one rule: save first, publish second.** The script reads the disk, never
your screen — publishing before saving looks successful but ships the previous
results.

## 6. What the site shows, and when

The site can be published after every single match; it reads correctly at any
point of the tournament.

| Situation | What visitors see |
|---|---|
| Nothing played yet | Teams listed alphabetically with **–** instead of a position, and a note saying they are not ranked. Every bracket slot reads **TBD**. |
| Group stage under way | Real positions; teams level on everything share a number. Finished, in-progress and upcoming matches are all shown. |
| Group stage over, circular tie | A gold **Playoff seeding on hold** panel naming the teams, a *Tiebreak match pending* tag on them, and a bracket still on TBD. |
| Playoffs under way | Bracket filled as far as results allow; later slots read **TBD** (hover one to see where its team comes from). |
| Grand Final played | The champion's crest and name in a gold banner. |

### Match status pills

| Pill | Meaning |
|---|---|
| `Finished` | A team reached the round wins its format needs |
| `Round N to play` | The match is under way |
| `Not started` | No round played yet |
| `All rounds played - no winner` | Every round filled, nobody won — almost always a tied round typed by mistake. Fix it in the workbook. |

### "Results last updated"

Every page's footer shows when the results were last published:

```
Results last updated 12 min ago · 17 Sep 2026, 21:19
```

**If this time did not change, your publish did not go through.** It is stored
in UTC and shown in each visitor's own time zone and language.

## 7. Starting a new season

1. Move the finished `KOTAO_2026.xlsx` **out of** the `KOTAO` folder to keep it
   as an archive, so only one official workbook ever sits in `workbooks/`.
2. Copy `workbooks/KOTAO_empty.xlsx` and name the copy for the new season, e.g.
   `KOTAO_2027.xlsx`. Keep `KOTAO_empty.xlsx` itself untouched.
3. Type the six new team names in rows 7–12, **in alphabetical order**. No name
   should turn red.
4. Check the BO formats (column H for the group stage, column L for the
   playoffs).
5. Point the publisher at the new file: open `tools/export_data.py` in any text
   editor and change `KOTAO_2026.xlsx` on the `DEFAULT_SRC` line, and change
   the same name in `update-site.bat`.
6. Add crests for any new team (see [Team crests](#team-crests)).
7. Run `update-site.bat`: it should say `Rounds : 0`, and the site should show
   the new teams with **TBD** everywhere.

## 8. Backups

- Before each matchday, copy `KOTAO_2026.xlsx` somewhere safe (a shared drive,
  or with the date in the name).
- `website/data/data.js` is a complete record of every published result: even
  if the workbook were lost, the results could be retyped from it.
- `KOTAO_empty.xlsx` is the fallback if the official workbook's formulas ever
  get damaged: copy it, then retype the names and scores.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Site shows old results, footer time unchanged | Published before saving, the .bat did not say `Published.`, or GitHub is still updating | Ctrl+S, run the .bat again, wait two minutes, Ctrl+F5 |
| Site shows old results, footer time *did* change | Browser cache | Ctrl+F5 |
| A score turned into a date (`02-janv`) | The cell lost its Text format | Format the cell as Text, retype the score |
| `All rounds played - no winner` | A tied round was recorded | Replace it with the sudden-death result |
| A team name is red | Names are not in alphabetical order | Reorder them — before the schedule is announced |
| A team shows a grey monogram instead of its crest | No crest file matches the name | See [Team crests](#team-crests) |
| Playoff pairings blank, group stage not finished | Expected | They fill in automatically |
| Playoff pairings blank, group stage finished | A circular tie (see the *Tie* column) | Play the tiebreak match, enter it in column C |
| Two teams show the same position | Level on every criterion so far | Expected during the group stage |
| Standings show dashes | No match played yet | Expected |
| Publishing broke after editing the workbook | Rows or columns were inserted, deleted or moved | Undo the change (Ctrl+Z), restore a backup, or rebuild from `KOTAO_empty.xlsx` (see [Backups](#8-backups)) |

---

# Under the hood

## How the data flows

```
workbooks/KOTAO_2026.xlsx --tools/export_data.py--> website/data/data.js --> the 4 pages
      (admins edit)           (update-site.bat)       (raw results only)   (compute + draw)
```

Only raw inputs are exported: team names, round scores, BO formats and
tiebreak match wins. Each page recomputes the standings, tiebreaks, seeding and
bracket in `website/js/logic.js`, using the same rules as the workbook.

That is deliberate: the site never copies the workbook's *results*, it re-runs
the same calculation on the same inputs, so the two cannot drift apart. A
cell-by-cell model of the workbook formulas and `logic.js` were cross-checked
on thousands of random tournaments, including every kind of tie, with zero
differences.

`tools/test_parity.js` prints what the site will show for the current
`data.js` (standings, tie state, bracket); it needs Node.js and is only useful
to whoever edits `logic.js`.

## Previewing other states

These options rewrite `website/data/data.js` only — **the workbook is never
touched**. Run them from the `KOTAO` folder:

```
python tools/export_data.py --blank            teams and formats, no scores (launch day)
python tools/export_data.py --demo             a random half-played group stage
python tools/export_data.py --demo=playoffs    group stage done, playoffs halfway
python tools/export_data.py KOTAO_example.xlsx the complete demo tournament
python tools/export_data.py                    back to the real results
```

Each `--demo` run draws a new scenario that follows the tournament's rules.
**Always finish with the last command (or `update-site.bat`) before uploading**,
so a preview is never published by mistake.

## Team crests

Crests live in `website/logos/`, named after the team with everything but
letters and digits removed and accents dropped:

```
"Sand Monkey FC"  ->  website/logos/sandmonkeyfc.webp      96 px, used inline
                      website/logos/sandmonkeyfc-lg.webp  256 px, hero and champion banner
```

**The team name is the file name** — nothing else links them. Renaming a team
in the workbook therefore changes which crest it gets; a team with no matching
file shows a monogram badge of the same size instead.

To add or replace a crest:

1. Put the artwork (a PNG with a transparent background) in `assets/crests/`,
   named like the team without spaces, e.g. `NewTeamFC.png`.
2. From the `KOTAO` folder, run:

   ```
   python tools/make_logos.py NewTeamFC.png
   ```

   It trims the empty margin, centres the crest on a square canvas, and writes
   both sizes to `website/logos/`. Run it with no file name to rebuild all
   crests.
3. Add the new name (lower case, letters and digits only, e.g. `newteamfc`) to
   the `LOGO_SLUGS` list near the top of `website/js/render.js`.
4. Run `update-site.bat`: it publishes the new crest files and `render.js`
   along with the results.

## Hosting

The site is hosted for free on **GitHub Pages**:

- Repository: <https://github.com/Snow0nTop/Kick-Off-Tournaments-And-Opens>
- Live site: <https://snow0ntop.github.io/Kick-Off-Tournaments-And-Opens/>

The repository holds exactly the contents of the `website` folder — nothing
else from `KOTAO` (workbooks, tools, crest artwork) is ever published. The
`website` folder on each admin's computer is a Git copy of that repository,
which is how `update-site.bat` can push results by itself. GitHub rebuilds the
live site a minute or two after each push; it may keep serving the previous
version for up to ~10 minutes.

Repository settings that must stay as they are (**Settings → Pages**):

- *Source*: **Deploy from a branch**, branch **main**, folder **/ (root)**.
- *Custom domain*: **empty**, unless you own a real domain name. Setting one
  that does not exist makes the site unreachable.

Because the site is plain static files with no build step, it can move to
another static host (Cloudflare Pages, Netlify) at any time in a few minutes.

To look at the site locally, just double-click `website/index.html`.

## Known gaps

- **The no-draw rule is checked by the workbook**, not the site. A stray `2-2`
  appears on the site as `All rounds played - no winner` rather than as the
  specific mistake.
- **Publishing needs a computer with the folder**: results go live when an admin
  runs `update-site.bat`. Moving the results to a shared Google Sheet read live
  by the site would remove even that step; it was checked and is feasible, but
  not built.
