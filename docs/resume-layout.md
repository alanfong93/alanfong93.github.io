# One-page résumé

The portfolio is the full record. `#resume-print` in `index.html` is a curated
one-page résumé, exported by the Résumé (PDF) button using browser printing.

## Content priorities

Keep contact links, a short summary, grouped core skills, current employer/title
and dates, five substantive current-role achievements, concise earlier roles,
two selected public projects, the degree, and certification.

Prioritize operational ownership, demonstrated engineering, and leadership:
the C# asset-management system, packaging service, support bot/control plane,
business automation, and team development. Distinguish sole authorship from
project leadership; seven is the team's peak size, not its current size.

Detailed tool lists, separate process/security bullets, internship duties,
and local-judge/jiandu descriptions belong on the full portfolio. The printed
header links there. Do not add every new project to the résumé automatically.

## Print contract and verification

- A4 portrait, 100% scale, zero browser margins, browser headers/footers off.
- CSS `@page` sets A4; the résumé supplies its own 12 mm vertical and 15 mm
  horizontal padding. Body text is 14 px (10.5 pt).
- Do not use fixed-height clipping, hidden overflow, or whole-page shrinking
  to disguise extra content. Trim lower-priority content before reducing type.
- After print-content or layout edits, export an actual Chromium PDF with
  `preferCSSPageSize: true`, `scale: 1`, and `displayHeaderFooter: false`.
  Verify exactly one A4 page, selectable text, contact/project links, complete
  final education lines, and no clipped content. Inspect the rendered page.
- Browser print settings can override CSS paper size, margins, or scale;
  arbitrary paper/settings are outside this print contract.

Repository buttons use the visible label **GitHub Repo** and an inline,
decorative GitHub SVG, matching the existing site icon. All repository buttons
use the teal primary style; a separate Live Demo button uses the outlined style.
The SVG fill inherits the button text color in either theme; it is hidden from
assistive technology.

## Portfolio copy

Project cards lead with the implemented capability and its engineering approach,
usually in two short paragraphs. Keep material limits where they affect what a
visitor can try or reasonably infer. Setup instructions, routine privacy
reassurance, duplicated impact statements, and stale test counts belong in the
project README rather than the portfolio. Avoid absolute delivery guarantees or
unmeasured savings. State employer confidentiality once at the work-section
heading, and keep authorship and leadership wording consistent with the résumé.

## Project groups

Use independent native `details`/`summary` controls in this order:

1. Public Personal Projects — open by default (4 projects).
2. Featured Employer Work — closed by default (6 projects).
3. Internal Business Systems — closed by default (5 systems in one overview).
4. Personal AI Projects — closed by default (2 projects).
5. Private Utilities & Tools — closed by default (5 tools).

Each summary retains its title, count, short description, and disclosure arrow
when closed. Multiple groups may be open at once. Keep counts aligned with the
content when adding or removing projects. Skills, Experience, Education, and
the one-page résumé do not belong inside these controls.

Architecture disclosures remain nested within their cards. Render Mermaid only
when both the group and architecture disclosure are open; opening either must
also render any newly visible, unprocessed diagram. Collapsing groups must not
affect résumé printing.
