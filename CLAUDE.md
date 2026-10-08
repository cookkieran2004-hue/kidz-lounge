# kidz-lounge

Frontend for Kidz Lounge, a staff-only scheduling and patient-management app for a pediatric therapy clinic. It covers:

- daily and weekly schedules, recurring appointments, out-of-office
- patient charts, documents, allergy and immunization alerts
- tasks, chat, time off (PTO/UPTO by employment type), staff admin, help-desk tickets

The backend is the sibling repo `../kidz-lounge-api`, a single AWS Lambda with Postgres. **Read its CLAUDE.md for the data model and the time-off rules.** Most behavior questions ("where does this task go?", "how is PTO earned?") are answered in the API, not here.

## Working with Kieran (how we've been doing things)

- **Shipping = commit + push to `main`**, which deploys to production:
  - **Frontend:** Vercel. Check `https://api.github.com/repos/cookkieran2004-hue/kidz-lounge/commits/<sha>/status` until it reports `success`.
  - **API:** GitHub Actions to Lambda.
  - When both change, push the **API first**.
  - End commit messages with the `Co-Authored-By` trailer.
- **Kieran pushes, not Claude** (since Sept 27 2026). Build and verify, report what changed, and list the changed files (flag new untracked files, say when the API must go first, and give any migration command). Don't commit or push, and don't offer to. Push only when he explicitly asks.
  - When he says something "isn't working" right after pushing, check the deploy status first and remind him to reload: an open tab keeps the old bundle.
  - A layout change once had to be reverted, so don't hand over UI you haven't looked at.
- **Verify UI before handing it over.** No login to the real app is available. Instead:
  - Run a throwaway mock API (a Node `http` server in the session scratchpad serving the endpoints the page needs) and start Vite against it: `VITE_API_URL=http://localhost:8787 npx vite --port 5199`.
  - Put a temporary `__mytime_preview.html` in the project root (it's in `.gitignore`: one was once committed by accident). It sets `sessionStorage.kidz_lounge_token`, loads the route in an `<iframe>`, and injects a style hiding the auto-opening task drawer (`[style*="z-index: 9990"],[style*="z-index: 9991"]{display:none!important}`).
  - Screenshot with headless Chrome (`--headless=new --screenshot --virtual-time-budget=...`), or `--dump-dom` with a script that clicks and prints results.
  - For phone width, size the iframe to 390px: headless Chrome's window has a minimum width.
  - **Delete the preview file and stop the servers afterwards.**
- **No database or AWS access from here.** Kieran runs migrations and scripts himself (see the API's CLAUDE.md) and makes AWS console changes such as EventBridge triggers. Give numbered, click-by-click steps, and confirm results from what he pastes back.
- **Tell him when to reload.** An open tab keeps the old bundle after a deploy, so tell him to reload after shipping.
- **Ask before decisions that affect people's balances, pay or data.** Examples: resets, retroactive recalculation, what counts as hours worked. Use a short multiple-choice question with a recommended option. For everything else, pick a sensible default, say so, and keep going.

## UI preferences he's set

- **Show names, not usernames**, anywhere the UI says who did something. Use `useStaffNames()` from `src/staffDirectory.js`, which includes archived staff. Exception: the task detail popup keeps "For <username>".
- **One page scroll.** Don't nest scroll areas in pages. The schedule grids grow to full height, with sticky column headers.
- **Sticky header stack** (`src/stickyLayout.js`): the nav bar sticks on every page. The daily and weekly schedules' headers (title through the specialty bubbles) stick below it, and the grids' column names stick below those (`top: STACK_TOP`). Heights are measured live into `--kl-nav-h` / `--kl-page-header-h`. A new sticky element must sit below the stack, not at `top: 0`.
- **Grids always fit the screen.** No sideways scrolling: columns share the width, and the provider filter chips narrow what's shown.
- **Schedule colors are consistent everywhere.** Time-off and OOO colors come from `oooBlockColors` / `statusColor` in `SchedulePage.jsx`, via `src/timeTypes.js` (`timeTypeStyle`, `sessionStyle`). Never hard-code another palette for PTO/UPTO/Lunch/Meeting or session status.
- **Things on schedule events stay neutral** and shouldn't stand out, e.g. the grey dashed "Set room" pill.
- **Dates and times** always use `DateField` / `TimeField` from `SchedulePage.jsx` (the appointment form's picker), never `<input type="date|time">`. Times are **always 8:00 AM - 6:00 PM in 15-minute steps**, everywhere (6 PM only as :00), with no per-field hour range. The options:
  - `min`/`max` (limit the dates)
  - `yearNav` (birthdays and hire dates)
  - `clearable`
  - `floating` (for inline rows)
  - `style` (match the surrounding inputs)
- **Web addresses in typed text are clickable.** Wrap anything people typed (comments, notes, chat, task details, agendas, tickets) in `<Linkify text={...} />` (`src/Linkify.jsx`, which opens links in a new tab and never renders HTML). Don't use it inside a `<button>` (a link can't go inside one) or in editable fields.
- **No zoom on phones:** iOS zooms in when a field under 16px is focused. `src/index.css` forces inputs, selects and textareas to 16px below 1024px wide and on touch screens. Don't fight it with smaller inline sizes, and never set `maximum-scale` on the viewport (it blocks pinch-zoom).
- **Phone numbers** are US 10-digit, formatted as you type, `(555) 555-5555`, never free text. Use `phoneDigits` / `formatPhone` from `src/phone.js`.
- **Staff profile → Account and role** (Admin and Developer) also shows and edits phone and email, and lists their credentials with `CredentialsPanel` (from `MyProfilePage.jsx`, `username` prop) to add, edit or remove.
- **Deleting** asks inline ("Delete this? Delete / Keep"), not a browser `confirm()`.
- **Professional, not playful.** This is a business tool. Kieran rejected an earlier design as "too fun" and "very AI". Avoid:
  - descriptions under page or section titles (e.g. "Time off balances, your schedule and requests."). Headers are just the title. Leave out `PageHeader`'s `subtitle`, `Card`'s `subtitle` and `SectionCard`'s `hint` unless they carry real information, such as "Week of Sep 28"
  - greetings ("Good evening, Jamie")
  - gradients and drop shadows
  - colored stripes, oversized serif numbers and emoji-like flourishes
  - pill-shaped everything
- **Personal pages use the plain business look** (My time, My profile):
  - tokens in `src/uiTokens.js`: neutral greys, `ACCENT` purple only for primary actions, links and the selected tab, and `TONES` for status
  - components in `src/dashboardUi.jsx`: `PageHeader`, `Card` (white, 1px border, 8px radius), `StatStrip`/`Stat` (figures in one panel with dividers), `Tag` (small, square-ish), `UnderlineTabs`, and `buttonStyle(variant)`
  - lists and tables with thin row dividers
  - numbers with tabular figures (`NUMERIC`)
  - sentence case, and no ALL-CAPS labels

## Commands

- `npm run dev`: the Vite dev server. It needs `VITE_API_URL` in `.env` pointing at the deployed API Gateway. There's no local backend.
- `npm run build` / `npm run preview`
- `npm run lint`: about 165 existing problems, mostly `react-refresh/only-export-components`, `no-unused-vars` and `react-hooks/set-state-in-effect`. Don't fix them as part of an unrelated change, and **don't add new ones**: compare a file's count before and after (`git stash` it).
  - To avoid `set-state-in-effect`, fetch in the effect and set state in the `.then` callback.
  - Put shared constants in non-component modules (like `timeTypes.js`).
- No tests.
- Deployed on Vercel (`vercel.json` rewrites everything to `index.html` for client-side routing, and sets security headers on every response: HSTS, a Content-Security-Policy, `X-Frame-Options: DENY`, nosniff, `Referrer-Policy: no-referrer` and Permissions-Policy). **The CSP only allows the app itself, the API Gateway (`*.execute-api.us-east-2.amazonaws.com`) and S3 (`*.s3*.amazonaws.com`).** Anything new loaded from elsewhere (fonts, scripts, images, APIs) must be added to it, or the browser blocks it. The app can't be embedded in a frame (`frame-ancestors 'none'`).

## Stack & structure

- React 19, react-router-dom 7, Vite, plain JSX (no TypeScript). `@supabase/supabase-js` is installed but unused. Shared styles are in `src/index.css` (`App.css` is an unused template leftover).
- `src/api.js`: every backend call goes through `api.*` → `request()`.
  - The JWT is kept in **sessionStorage** on purpose: a reload keeps you logged in, and closing the tab logs you out.
  - GETs retry on 429/502/503/504 and network errors. Writes never retry.
  - Errors are thrown as `Error` with `.status` and `.data`. The message is the server's `error` string, written to be shown to users. A 409 with `data.negativeBalance` means "confirm and resend".
  - Add new endpoints here, grouped under the existing `// ---- Section ----` comments.
- `src/App.jsx`: routes. Wrap pages in `RequireAuth` or `RequireAdmin` (Admin and Developer) from `ProtectedRoute.jsx`. `/support` is public. The global providers are `AuthProvider`, `PendingTimeOffProvider`, `TasksProvider` and `ChatProvider`.
- `src/pages/`: one file per page, and some are very large (`SchedulePage.jsx` has about 3.4k lines, `ManageDataPage.jsx` about 2.6k). Search inside them before adding new files. Other pages import shared pieces from them: `DateField`, `TimeField`, `AppointmentModal`, `OOOModal`, `formatSlotLabel` and `dateToInputValue` from `SchedulePage.jsx`, and `TimeOffTab` and `BRAND` from `StaffPage.jsx`.
- **Audit log** (Admin > Audit log, Developers only, `src/pages/admin/AuditLogTab.jsx`): the HIPAA record of sign-ins and changes to patient data (not views), with filters and a CSV export. `logout(reason)` in `AuthContext` tells the server first, so sign-outs are logged ('idle' for the 30-minute timeout).
- **User manuals** (footer > User manual, `/manual`, open to everyone): Markdown in `public/manuals/` (`staff.md`, `reception.md`, `admin.md`, with shared pages in `shared/` and screenshots in `img/`), loaded by `src/manual.js`, built into a PDF in the browser (`src/manualPdf.js`, pdfmake: cover, contents with page numbers, sections on new pages) and shown in `src/PdfViewer.jsx` (pdf.js; one continuous scrolling column of pages, drawn lazily). Download PDF and Print use that PDF. Both libraries load only on the manual page. The CSP allows `worker-src 'self' blob:` for pdf.js's worker. `public/manuals/README.md` explains the format (`<!-- include: -->`, `<!-- only: role -->`). **When a change alters how a screen works or looks, update the matching manual page and retake its screenshot** using the mock server, which has only made-up staff and patients. Never screenshot real patient data.
- **Provider specialty** is picked with `src/SpecialtyPicker.jsx` (ST / OT / PT / SI from `src/disciplines.js`, several allowed, saved as "ST/OT"). Never a free-text input.
- **The HOLD placeholder patient** (`isHoldPatient`) can be booked with several providers at once, so it's never a "same patient" conflict. Provider and room conflicts still apply.
- **Schedule** (`SchedulePage.jsx`, `WeeklySchedulePage.jsx`):
  - The daily Provider grid has discipline filter chips (All / ST / OT / PT / SI), parsed from each provider's `specialty` and remembered in `localStorage` per user (`kl.schedule.providerFilter.<username>`).
  - Room-less sessions show a "Set room" pill (`AppointmentCard`'s `setRoom` prop).
  - Quick-edit menus close on page scroll but not on scrolling inside them (`data-kl-dropdown`).
- **Waitlist** (`WaitlistPage.jsx`, `/waitlist`): the average wait (per patient, by their oldest referral) at the top right, specialty tabs with Add to waitlist beside them, search, an "Available on" day filter and an "On the list / History" switch. The status tag is itself a menu (Scheduled / Removed move the entry to History). Adding uses a patient search with a New patient button (the shared `PatientModal`), and picking several specialties adds one entry each. "Schedule appointment" opens `AppointmentModal` with `prefill.patientName` and the preferred provider, and marks the entry Scheduled once it's saved (`prefill.fromWaitlist`). Anywhere else, after a **new** appointment is created (not Canceled), `AppointmentModal` checks the patient's waitlist entries for the provider's specialties and asks whether to mark them Scheduled (`finishNewAppointment`). Scheduled also sets the patient On Program on the server. Disciplines come from `src/disciplines.js`, shared with the schedule's filter chips.
- **My time** (`MyTimePage.jsx`):
  - balance cards with each person's weekly PTO rate, and a forecast
  - a week timeline whose blocks open the schedule's own popups: `AppointmentModal`, or `OOOModal`, which takes `requestOnly`/`onEdit` for request-only blocks
  - "Coming up", My hours
  - balance history (`src/TimeOffHistory.jsx`, also on staff profiles)
  - the request list (`TimeOffTab` in `compact` mode, with card rows)
- **Admin** time off (`TimeOffManageTab` in `StaffPage.jsx`):
  - request cards with Approve/Deny and the effect on the balance
  - tabs Pending/Upcoming/Past/Denied/Balances, and a name filter. Balances (`src/TimeOffBalancesBoard.jsx`, `GET /time-off/balances/all`) lists every active employee's employment type, PTO (salaried only), UPTO used this year and pending hours; click a PTO balance to set a new total with an optional reason (recorded as an adjustment)
  - staff profiles have `src/TimeOffBalanceEditor.jsx`: PTO "Set as of a date" (`api.setPtoAsOf`) and Adjust, plus UPTO used this year
  - sort (usual / newest / oldest / type) and type filter on the request lists
- **Employment type** (`src/employment.js`, mirrors the API's `lib/employment.js`): salaried = PTO + UPTO, hourly = UPTO, neither = none. Set on New staff and the profile's Account and role. The request form only offers allowed types (from `getTimeOffPolicy`); My time shows PTO only for salaried, UPTO as "Unlimited" with hours used. Weekly accrual and monthly UPTO are paused, so there's no projection.
- **Live updates use polling, not sockets.** Tasks poll every 60s, chat conversations every 15s, open chat messages every 5s, support counts every 60s, patient alerts every 5 min, and the schedule every 30s.
- Patients are routed and fetched **by name** (`/patients/:name`, `api.getPatient(name)`) but updated and deleted by id. Always `encodeURIComponent` names.
- Dates are plain `'YYYY-MM-DD'` strings from the API. Don't turn them into `Date` objects and back, because timezone shifts will corrupt them. Build local dates with `dateToInputValue`, not `toISOString()`.
- PTO/UPTO request costs: use a request's `charged_hours` (scheduled hours), falling back to clock hours only for old requests. For a new span, ask the API (`api.getTimeOffEstimate`).

## Styling

- Mostly inline `style={{...}}` objects.
- **Brand colors:** `BRAND` / `BRAND_SERIF` are exported from `src/pages/StaffPage.jsx` (purple palette). The admin pages re-export them, plus `INK`, `HAIRLINE`, `DANGER` and others, from `src/pages/admin/adminUi.js`. Dashboard pages use `src/dashboardUi.jsx`. Reuse these instead of adding new hex values.
- **Alert colors and icons** are in `src/patientAlerts.jsx`.
- **Responsive layout:** `useIsMobile()` (breakpoint 1024px; pages often pass 768). Use `minmax(0, 1fr)` grid columns so content can't push a card wider than the screen. The daily schedule shows a "use the weekly view" message on phones. The patient Data Table goes full-screen on phones, with 16px inputs so iOS doesn't zoom.

## Conventions & gotchas

- Staff display names: preferred name, then first + last, then username.
- **Roles** (`src/roles.js`, mirroring the API's `lib/roles.js`): Staff, Reception, Admin, Developer. Use `canManage(user)` for admin-level work outside the Admin area (Reception included) and `canAdminister(user)` for the Admin area and time-off approvals. Never compare `user.role` to a string. Show roles with `roleLabel`. Case manager pickers use `caseManagerChoices` (no Developers).
- The support inbox is for **Developers only** (`canSeeSupportTickets` in `src/supportCount.js`, mirrored in the API).
- **Comments explain *why*,** often including the bug a line prevents. Keep that style.
- `.env` is tracked in git despite being a secrets file. It currently holds only `VITE_API_URL`. Never add real secrets to it, since `VITE_*` values ship to the browser anyway.

## Billing (Oct 2026)

- `/billing` (`src/pages/BillingPage.jsx`, nav "Billing"): one provider's month laid out like the paper billing invoice, from `api.getBillingSheet` (kidz-lounge-api `routes/billing.js`). Same access as the Weekly view. Key: X provided, A child absent, PA provider absent, H holiday, Z emergency closure, M make-up; a dot = booked, day not over. Admin/Developer tick Reviewed.
- **Caseload rule** (API `lib/caseload.js`): a patient is on a provider's caseload, and that provider is a current provider, with any appointment with them from today on or in the current calendar month (any status). It drives the billing sheet's rows (which follow the schedule), the chart's Care Team "Current Providers" (`patient.care_team` from `GET /patients/:name`), the patient list's care team, and the staff profile's Caseload tab (patients via `api.getProviderCaseload`, side by side with the next two weeks of appointments). Past appointments can be edited and deleted by anyone; a past-date lock with approvals was tried and removed in Oct 2026.
- Office closures have a type (Holiday / Emergency closure) in Admin → Office hours, which sets H vs Z on the sheet.

## Patient programs and mandates (Oct 2026)

- In the patient form, clicking a program opens its mandate per service (`src/ProgramPlanEditor.jsx`, helpers in `src/programPlan.js`): sessions per week × minutes, and a service can only be under one program at a time. Editing an existing patient's programs asks "Program changes start on" (default today). For a patient's first change, while they only have the old free-text mandate (`isFirstChange`), `ChangeStartChoice` also offers "Replace the old mandate for all dates" (the default), which sends `effective_from: null`. Earlier appointments keep the old program and mandate for billing. The patient chart lists the history under "Programs and mandates". Insurance, P and PP programs have an optional Billing code (C-1 ... C-6, C-#) in the same pop-up, dated with the program; billing shows it as the program, or just a red # when unset. Admins and Developers get a Delete on each entry there (inline Delete / Keep) to fix mistakes; deleting a current entry brings back the one it replaced. In the Patients data table, the Program and Mandate cells open the same editor in a window (`ProgramPlanDialog`), saved through the table's password-confirmed patient save as `program_plan`.
- Before the API has `PatientPrograms`, `getPatientPrograms` returns `available: false` and the form falls back to the old Program chips and Mandate box.

## Make-ups (Oct 2026)

- Make Up and MUS are no longer statuses. A Canceled or No Show appointment's window has **Schedule make up** (`AppointmentModal` opens a second `AppointmentModal` with `prefill.makeupFor`: same patient and provider by default, one time only, no repeat), saved with `makeup_for`. Cards and chart rows show a green MUS tag on an appointment with a live make-up (`apt.makeup`) and a green MU on a make-up (`apt.is_makeup`). Billing counts a completed make-up as a session but not as scheduled, and leaves out a missed one (API CLAUDE.md).

## Offsite setting (Oct 2026)

- Picking Offsite (appointment window or the card's quick room menu) requires Center, School or Home (`OffsiteSettingButtons`). It's stored in `treatment_area` as "Offsite (School): location" / "Offsite (Home)" (`makeOffsiteArea(location, setting)`, parsed by `isOffsite` / `offsiteLocation` / `offsiteSetting`); older "Offsite" / "Offsite: location" values still read as offsite with no setting. Billing's Setting column shows C / S / H from it (in-office rooms are C).
