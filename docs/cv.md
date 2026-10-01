# Detailed CV

`cv.html` is the editable, public-safe source for `Alan-Fong-CV.pdf`. The portfolio
links to the PDF as **Detailed CV (PDF)** near the one-page résumé action.
The HTML document also provides browser printing and a return-to-portfolio link.

## Content and attribution

The detailed CV covers professional responsibilities and progression, selected
employer projects, public/personal engineering, skills, and education. It is a
curated professional record, not a copy of private career notes. The existing
private career record remains the comprehensive source; do not publish salary,
workplace disputes, referees' details, client identities, or hardware inventories.

Preserve these distinctions:

- Sole author: C# asset-management application; rebuilt packaging service and
  frontend.
- Led with a collaborator: Telegram support bot and VM-management control plane.
- Primary author: printer service, broadcast service, and warehouse contributions.
- Contributor: follow-up tooling. Do not turn that into ownership of the system.
- Seven is the team's peak size, not current headcount or direct reports.
- Meadow includes part-time work during the degree and the return after the
  2018 internship. Its existing warranty application was maintained/extended,
  not originally authored by Alan.
- The degree title is **Bachelor of Software Engineering (Hons)**, verified
  against the certificate; detailed education may include Second Class Upper
  Division and the conferment date, 27 May 2018.

Employer code remains private. Public-project limits must stay aligned with
their repositories. The separate one-page résumé retains its own print layout.

## Regenerating the PDF

Export `cv.html` with Chromium browser printing or Playwright `page.pdf`:

- `preferCSSPageSize: true`, `scale: 1`, `displayHeaderFooter: false`.
- A4 portrait; CSS supplies 14 mm vertical and 16 mm horizontal page margins.
- `printBackground: true`; body text 14 px (10.5 pt), metadata 12 px (9 pt).
- Save the result as `Alan-Fong-CV.pdf` in the repository root.

Three logical sections begin on separate pages. Do not force a one-page limit
or hide overflow; page count may grow with substantive career additions.
Verify the actual PDF's page count, selectable text, working links, page breaks,
and final education lines. Check that entries stay together and that the hero
download link serves the generated PDF. Update source and PDF together.
