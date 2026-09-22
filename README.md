# KOTAO — Kick-Off Tournaments And Opens

The official website of the **KOTAO** tournaments: six teams, a round-robin
group stage, and double-elimination playoffs.

**▶ Live site: <https://snow0ntop.github.io/Kick-Off-Tournaments-And-Opens/>**

## What's on the site

- **Home** — every KOTAO tournament, past, running and upcoming
- **Overview** — one tournament's status, group leader, latest results and what's next
- **Group Stage** — full standings, head-to-head grid and every matchday
- **Playoffs** — the double-elimination bracket and all playoff results
- **Format & Rules** — how that tournament works, tiebreakers included

Each tournament carries its own match format, and its Format & Rules page is
written from the format it actually uses — down to the tiebreak order, which
differs between them.

## How it works

Results are recorded by the tournament admins and published here
automatically. Standings, tiebreakers and the bracket are recalculated from the
raw round scores on every page load, so the site always follows the official
rules.

The site is plain HTML, CSS and JavaScript, hosted for free on GitHub Pages —
no build step, no backend, no login.

## For admins

Results are published with the organizers' `update-site.bat` tool.
**Do not edit `data/data.js` by hand**: it is regenerated on every update, so
any manual change would be overwritten. The full admin guide ships with the
organizers' tournament folder.
