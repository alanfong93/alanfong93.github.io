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
decorative GitHub SVG, matching the existing site icon. Its fill inherits the
button text color in either theme; it is hidden from assistive technology.
