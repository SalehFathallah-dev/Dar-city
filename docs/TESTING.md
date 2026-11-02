# Testing

## Automated

| Command | What it covers |
|---|---|
| `npm test` | Date format DD/MM/YYYY, age, BMI, days-lost, date ranges, monthly trend, dashboard statistics, incidence (never invented), CSV quoting/BOM/formula injection |
| `npm run test:db` | **A**: loads pre-upgrade single-club data, runs the multi-club migration (row counts must match), then all RLS and club-isolation tests. **B**: migration → rollback (all records kept) → re-apply. **C**: fresh install + DEMO data (2 clubs) + DEMO removal |
| `npm run build` | Strict TypeScript type-check + production build |

`test:db` verifies: profile auto-creation (inactive), physician full access, player ID & BMI generation, **duplicate jersey prevention**, jersey reuse after archiving,
medical-history versioning, unsigned clearance rejected, pain score range, RTP/injury player mismatch rejected, RTP sets return date, rehab phase change requires approval,
assistant cannot edit injuries / issue clearances / edit others' follow-ups, **coach & manager cannot read any clinical table**, emergency contacts hidden from coach,
inactive user sees nothing and cannot self-escalate, admin manages users without clinical access, anonymous access denied, storage policies, audit logging.

Club isolation tests: existing records all on Dar City with original IDs, club creation (incl. creator access), per-club Player IDs and jersey numbers,
forged `club_id` ignored, records cannot be moved between clubs, seasons cannot cross clubs, Dar City staff cannot see any Club B row, file,
season or availability (nor call the RPC for it), a Club B user cannot see or write Dar City data, the physician overview spans both clubs,
audit entries are club-tagged, brand settings editable by the physician only, inactive clubs block registrations, coaches cannot create clubs.

A browser smoke test (Playwright, 62 checks – including club switching, isolation, dual-logo PDFs, combined vs single-club CSV, club registration: every route on desktop, physician workflows, PDF/CSV output, coach restrictions, mobile layout) was also run during development against a mocked API.

## Manual checklist (run on your Supabase project before go-live)

- [ ] After migration 4: Dar City shows all previous players, injuries, examinations and reports unchanged
- [ ] Medical brand logo on login, sidebar, header, dashboard and every PDF; Dar City logo appears as the club logo
- [ ] Register a second club with its own logo; switch to it – empty roster, own Player IDs, own dashboard
- [ ] A coach assigned only to club B cannot see club A at all
- [ ] Every PDF shows both logos, clearly separated; CSV exports carry Club ID / Club Name

- [ ] Physician can sign in; a new dashboard user without a role sees "Access pending approval"
- [ ] Register a player – Player ID generated, age & BMI shown
- [ ] Edit the player; try a jersey number already used by an active player → blocked
- [ ] Upload a player photo; it appears on the profile
- [ ] Record medical history, then update it – version 2 shown, version 1 still viewable
- [ ] Create a pre-season examination with a signed clearance → appears under Medical Clearance
- [ ] Record an injury from a phone (target 1–2 minutes) with initial treatment and availability
- [ ] Add two follow-ups; compare them; recovery chart shows pain trend
- [ ] Start rehabilitation, add sessions, approve a phase change
- [ ] Record an RTP decision "Cleared for Competition" → injury closed, return date set, availability updated
- [ ] Update availability with "share" unticked – coach still sees the previous approved status
- [ ] Upload a PDF and an image to an injury; open them (signed link); try a .docx → rejected
- [ ] Generate each of the 13 PDF reports; check logo, reference number, page numbers
- [ ] Export each CSV and open in Excel – special characters display correctly
- [ ] Sign in as Head Coach and Team Manager – no diagnoses, medications or notes anywhere; /injuries redirects
- [ ] Sign in as Assistant – can add follow-ups but cannot edit injuries or issue clearance
- [ ] Audit Log shows the changes above with previous/updated values
- [ ] Install the PWA on Android and iPhone; check the offline banner
