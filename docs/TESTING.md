# Testing

## Automated

| Command | What it covers |
|---|---|
| `npm test` | Date format DD/MM/YYYY, age, BMI, days-lost, date ranges, monthly trend, dashboard statistics, incidence (never invented), CSV quoting/BOM/formula injection |
| `npm run test:db` | Creates a throw-away PostgreSQL cluster, applies all migrations, loads DEMO data and runs 14 test groups (below), then verifies DEMO removal |
| `npm run build` | Strict TypeScript type-check + production build |

`test:db` verifies: profile auto-creation (inactive), physician full access, player ID & BMI generation, **duplicate jersey prevention**, jersey reuse after archiving,
medical-history versioning, unsigned clearance rejected, pain score range, RTP/injury player mismatch rejected, RTP sets return date, rehab phase change requires approval,
assistant cannot edit injuries / issue clearances / edit others' follow-ups, **coach & manager cannot read any clinical table**, emergency contacts hidden from coach,
inactive user sees nothing and cannot self-escalate, admin manages users without clinical access, anonymous access denied, storage policies, audit logging.

A browser smoke test (Playwright, 45 checks: every route on desktop, physician workflows, PDF/CSV output, coach restrictions, mobile layout) was also run during development against a mocked API.

## Manual checklist (run on your Supabase project before go-live)

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
