# Portfolio layout

The public site is a browsable engineering portfolio. CV documents and print
exports are maintained separately, outside this repository. Do not embed a
hidden document, link to a private local file, or add a secret document route.
Everything committed here, including HTML source, is public.

## Reading order and actions

The hero contains the introduction and existing portrait. **View projects** is
the primary action; LinkedIn, GitHub, and X are quieter social links. Navigation
targets Projects, Experience, Skills, and Contact in reading order. At 760 px
and below the hero uses a smaller portrait and reduced padding.

Education and How I work appear once in a compact supporting section after
Skills. Retain `#education` and `#how-i-work` for deep links. The portrait and
supporting content must not dominate the introduction or delay selected work.

The introduction and Contact include the confirmed X profile,
`https://x.com/AlanFong93`, with an inline decorative SVG, visible X text, and
an accessible X profile label. All social icons inherit link color.

## Selected Work and visual evidence

Network Sandbox and ops-guard are full Selected Work cards outside disclosure
controls. Do not repeat them in the remaining project catalogue. Use restrained
depth and slightly larger headings to distinguish these cards.

- Network Sandbox uses a real screenshot from the live demo in `assets/`, with
  the home-network starter loaded. Label it as a screenshot.
- ops-guard uses a labelled inline SVG schematic of evidence, preconditions,
  approval, execution under operator policy, and audit logging. Telegram
  approval is optional and tied to the particular change. Model risk assessment
  stays separate and cannot authorize execution. Do not imply this drawing is
  an actual product interface or a new demonstration of runtime correctness.

Project cards lead with purpose, engineering approach, and established
contribution. Keep material scope and availability limitations visible.
Actions precede technology tags. A working **Live Demo** is the teal primary
action, with **GitHub Repo** outlined; repository-only cards use a primary
repository action. GitHub SVGs are decorative and inherit action text color.

## Project groups

After selected work use independent native `details`/`summary` controls:

1. More Public Projects: local-judge and jiandu, 2 projects, open by default.
2. Featured Employer Work: 8 projects, closed by default.
3. Internal Business Systems: 4 systems in one overview, closed by default.
4. Private Personal Projects: 3 projects, closed by default.
5. Private Utilities & Tools: 5 tools, closed by default.

Each summary retains its title, count, description, and disclosure arrow when
closed. Multiple groups can be open. Keep counts aligned with actual content.
Use tinted headers and a subtle child rail, with less indentation on mobile.
Experience, Skills, and supporting profile details stay outside these groups.

Architecture disclosures stay within cards. Render Mermaid only when all
ancestor disclosures are open; opening either disclosure must render newly
visible diagrams. Preserve diagram source and explicit label line breaks.
Serialize renders and theme resets to support rapid theme changes. Use the
teal/slate palette instead of legacy fixed pastel node styles. On small screens,
diagrams scroll horizontally within their cards at readable sizes. Scroll
regions are keyboard-focusable and retain visible focus outlines.

## Content boundaries

State employer confidentiality once at the employer-work heading. Preserve
distinctions between sole authorship, primary authorship, and project leadership.
Do not claim unmeasured savings or absolute guarantees. Setup instructions and
stale test counts belong in project READMEs. Keep Meadow's two concrete career
bullets visible. Describe intended benefits as intentions where not measured.

Employer work leads with the project board and asset-management service; do not
duplicate the asset case in internal systems. The asset case describes the
particular service, not the wider company estate. Personal n8n integrations
belong with JoJo. Private cases have no invented public demos or repository links.

ops-guard execution requires an operator-owned execution catalog and policy;
advisory models do not authorize it. local-judge's implemented interfaces do not
establish representative live-model usefulness. Mobility World has modelled
travel times, not observed traffic or calibrated congestion; hardware-performance
acceptance remains outstanding. JoJo's specialist runtime does not imply a public
multi-tenant service. Network Sandbox does not certify production networks or
emulate vendor defaults, and does not model radio coverage.

## Visual language

Keep one project column with restrained borders. Teal is the single action
accent: `#0f766e` with white text in light mode, `#2dd4bf` with dark text in dark
mode. Secondary text uses `#475569` / `#b0bdd0`. Group headers use `#eef2f6` /
`#1a2438`; dark chips use `#243247`. Verify text against its actual surface.

The theme toggle uses CSS-switched sun/moon SVGs and a destination-specific
accessible label. Buttons and architecture controls have 44 px minimum hit
areas. Keep keyboard focus and reduced-motion support. Experience is
chronological with formal titles and a subordinate scope line. Skills use
compact definition rows rather than additional project-like cards.

## Verification

Check at 320, 390, 768, and 1440 px, in both themes. Verify navigation, mobile
menu closing, all disclosure orders, rapid theme switching, image loading,
diagram readability, and absence of document-download or print controls.
The public homepage source must contain no private document payload.
