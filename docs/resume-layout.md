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

Retain two Meadow bullets: progression, leadership, and after-sales operations;
then concrete automation and service-system improvements. Keep the internship
to a single line rather than compressing the earlier leadership role into it.

## Print contract and verification

- A4 portrait, 100% scale, zero browser margins, browser headers/footers off.
- CSS `@page` sets A4; the résumé supplies its own 12 mm vertical and 15 mm
  horizontal padding. Body text is 14 px (10.5 pt).
- Contact details and employment metadata are 12 px (9 pt), in dark slate.
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

Project cards lead with a concise purpose sentence, followed by the engineering
approach and Alan's contribution where established. Public-project status or
scope sits in a visibly separate paragraph when a material boundary applies;
actions precede supporting technology tags. Keep limits where they affect what
a visitor can try or reasonably infer. Setup instructions, routine privacy
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

Use a tinted summary background to distinguish group headers from project cards.
Indent group content with a subtle left border; reduce the indent on mobile to
preserve reading space. Apply this hierarchy only to the project groups, not
the Experience section or printed résumé.

Architecture disclosures remain nested within their cards. Render Mermaid only
when both the group and architecture disclosure are open; opening either must
also render any newly visible, unprocessed diagram. Collapsing groups must not
affect résumé printing.

## Screen hierarchy and visual language

The document and navigation follow Introduction, Projects, Experience, Skills /
How I Work, Education, then Contact. Projects immediately follow a compact
introduction; the portrait supports the text rather than dominating it. The
hero provides **Print / Save résumé** (browser printing, with a print icon),
**View projects**, and quieter social links. Contact includes the email already
published in the résumé.

Use off-white/charcoal in light mode and dark slate in dark mode. Teal is the
single action accent: `#0f766e` with white action text in light mode, `#2dd4bf`
with dark action text in dark mode. Secondary text uses `#475569` / `#b0bdd0`;
group surfaces use `#eef2f6` / `#243247`. Check text against its actual surface,
including hover, focus, and both themes, rather than assuming token contrast.

Retain one project column, restrained borders, tinted group headers, and the
child rail. Remove redundant context/AI badges; retain meaningful in-progress
labels. Architecture controls are quieter than external actions. Experience is
a chronological list with formal job titles and a subordinate scope line;
skills use compact definition rows rather than more project-like cards.
Education is a separate section. Screen redesigns must not couple the résumé
to disclosure states or change its content priorities.
