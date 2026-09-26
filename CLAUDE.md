# kidz-lounge

Frontend for Kidz Lounge, a staff-only scheduling and patient-management app for a pediatric therapy clinic. It covers:

- daily and weekly schedules, recurring appointments, out-of-office
- patient charts, documents, allergy and immunization alerts
- tasks, chat, time off (weekly PTO accrual), staff admin, help-desk tickets

The backend is the sibling repo `../kidz-lounge-api`, a single AWS Lambda with Postgres. **Read its CLAUDE.md for the data model and the time-off rules.** Most behavior questions ("where does this task go?", "how is PTO earned?") are answered in the API, not here.

## Working with Kieran (how we've been doing things)

- **Shipping = commit + push to `main`**, which deploys to production:
  - **Frontend:** Vercel. Check `https://api.github.com/repos/cookkieran2004-hue/kidz-lounge/commits/<sha>/status` until it reports `success`.
  - **API:** GitHub Actions to Lambda.
  - When both change, push the **API first**.
  - End commit messages with the `Co-Authored-By` trailer.
- **When to ship without asking:**
  - Small, specific requests ("change the color", "get rid of X", "fix Y"): build, verify, then ship and report.
  - New features or bigger UI changes: build and verify, describe what changed, then **ask** before shipping. He says "ship it" / "push".
  - A layout change once had to be reverted, so don't ship UI you haven't looked at.
- **Verify UI before handing it over.** No login to the real app is available. Instead:
  - Run a throwaway mock API (a Node `http` server in the session scratchpad serving the endpoints the page needs) and start Vite against it: `VITE_API_URL=http://localhost:8787 npx vite --port 5199`.
  - Put a temporary `__mytime_preview.html` in the project root. It sets `sessionStorage.kidz_lounge_token`, loads the route in an `<iframe>`, and injects a style hiding the auto-opening task drawer (`[style*="z-index: 9990"],[style*="z-index: 9991"]{display:none!important}`).
  - Screenshot with headless Chrome (`--headless=new --screenshot --virtual-time-budget=...`), or `--dump-dom` with a script that clicks and prints results.
  - For phone width, size the iframe to 390px: headless Chrome's window has a minimum width.
  - **Delete the preview file and stop the servers afterwards.**
- **No database or AWS access from here.** Kieran runs migrations and scripts himself (see the API's CLAUDE.md) and makes AWS console changes such as EventBridge triggers. Give numbered, click-by-click steps, and confirm results from what he pastes back.
- **Tell him when to reload.** An open tab keeps the old bundle after a deploy, so tell him to reload after shipping.
- **Ask before decisions that affect people's balances, pay or data.** Examples: resets, retroactive recalculation, what counts as hours worked. Use a short multiple-choice question with a recommended option. For everything else, pick a sensible default, say so, and keep going.

## UI preferences he's set

- **Show names, not usernames**, anywhere the UI says who did something. Use `useStaffNames()` from `src/staffDirectory.js`, which includes archived staff. Exception: the task detail popup keeps "For <username>".
- **One page scroll.** Don't nest scroll areas in pages. The schedule grids grow to full height, with sticky column headers.
- **Grids always fit the screen.** No sideways scrolling: columns share the width, and the provider filter chips narrow what's shown.
- **Schedule colors are consistent everywhere.** Time-off and OOO colors come from `oooBlockColors` / `statusColor` in `SchedulePage.jsx`, via `src/timeTypes.js` (`timeTypeStyle`, `sessionStyle`). Never hard-code another palette for PTO/UPTO/Lunch/Meeting or session status.
- **Things on schedule events stay neutral** and shouldn't stand out, e.g. the grey dashed "Set room" pill.
- **Dates and times** always use `DateField` / `TimeField` from `SchedulePage.jsx` (the appointment form's picker), never `<input type="date|time">`. Times are **always 8:00 AM - 6:00 PM in 15-minute steps**, everywhere (6 PM only as :00), with no per-field hour range. The options:
  - `min`/`max` (limit the dates)
  - `yearNav` (birthdays and hire dates)
  - `clearable`
  - `floating` (for inline rows)
  - `style` (match the surrounding inputs)
- **Phone numbers** are US 10-digit, formatted as you type, `(555) 555-5555`, never free text.
- **Deleting** asks inline ("Delete this? Delete / Keep"), not a browser `confirm()`.
- **Professional, not playful.** This is a business tool. Kieran rejected an earlier design as "too fun" and "very AI". Avoid:
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
- Deployed on Vercel (`vercel.json` rewrites everything to `index.html` for client-side routing).

## Stack & structure

- React 19, react-router-dom 7, Vite, plain JSX (no TypeScript). `@supabase/supabase-js` is installed but unused. Shared styles are in `src/index.css` (`App.css` is an unused template leftover).
- `src/api.js`: every backend call goes through `api.*` → `request()`.
  - The JWT is kept in **sessionStorage** on purpose: a reload keeps you logged in, and closing the tab logs you out.
  - GETs retry on 429/502/503/504 and network errors. Writes never retry.
  - Errors are thrown as `Error` with `.status` and `.data`. The message is the server's `error` string, written to be shown to users. A 409 with `data.negativeBalance` means "confirm and resend".
  - Add new endpoints here, grouped under the existing `// ---- Section ----` comments.
- `src/App.jsx`: routes. Wrap pages in `RequireAuth` or `RequireAdmin` from `ProtectedRoute.jsx`. `/support` is public. The global providers are `AuthProvider`, `PendingTimeOffProvider`, `TasksProvider` and `ChatProvider`.
- `src/pages/`: one file per page, and some are very large (`SchedulePage.jsx` has about 3.4k lines, `ManageDataPage.jsx` about 2.6k). Search inside them before adding new files. Other pages import shared pieces from them: `DateField`, `TimeField`, `AppointmentModal`, `OOOModal`, `formatSlotLabel` and `dateToInputValue` from `SchedulePage.jsx`, and `TimeOffTab` and `BRAND` from `StaffPage.jsx`.
- **Schedule** (`SchedulePage.jsx`, `WeeklySchedulePage.jsx`):
  - The daily Provider grid has discipline filter chips (All / ST / OT / PT / SI), parsed from each provider's `specialty` and remembered in `localStorage` per user (`kl.schedule.providerFilter.<username>`).
  - Room-less sessions show a "Set room" pill (`AppointmentCard`'s `setRoom` prop).
  - Quick-edit menus close on page scroll but not on scrolling inside them (`data-kl-dropdown`).
- **My time** (`MyTimePage.jsx`):
  - balance cards with each person's weekly PTO rate, and a forecast
  - a week timeline whose blocks open the schedule's own popups: `AppointmentModal`, or `OOOModal`, which takes `requestOnly`/`onEdit` for request-only blocks
  - "Coming up", My hours
  - balance history (`src/TimeOffHistory.jsx`, also on staff profiles)
  - the request list (`TimeOffTab` in `compact` mode, with card rows)
- **Admin** time off (`TimeOffManageTab` in `StaffPage.jsx`):
  - request cards with Approve/Deny and the effect on the balance
  - tabs Pending/Upcoming/Past/Denied, and a name filter
  - staff profiles have balance cards with an in-place Adjust
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
- The support inbox belongs to a single hardcoded user, `SUPPORT_OWNER = 'KJC135'` (`src/supportCount.js`, and mirrored in the API).
- **Comments explain *why*,** often including the bug a line prevents. Keep that style.
- `.env` is tracked in git despite being a secrets file. It currently holds only `VITE_API_URL`. Never add real secrets to it, since `VITE_*` values ship to the browser anyway.
