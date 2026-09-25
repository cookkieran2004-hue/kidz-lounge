# kidz-lounge

Frontend for Kidz Lounge, a staff-only scheduling and patient-management app for a pediatric therapy clinic. It covers:

- daily and weekly schedules, recurring appointments, out-of-office
- patient charts, documents, allergy and immunization alerts
- tasks, chat, time off, staff admin, help-desk tickets

The backend is the sibling repo `../kidz-lounge-api`, a single AWS Lambda with Postgres. Read its CLAUDE.md for the data model. Most behavior questions ("where does this task go?", "who can see X?") are answered in the API, not here.

## Commands

- `npm run dev`: Vite dev server. Needs `VITE_API_URL` in `.env`, which points at the deployed API Gateway. There's no local backend.
- `npm run build` / `npm run preview`
- `npm run lint`: ESLint currently reports around 170 existing problems, mostly `react-refresh/only-export-components`, `no-unused-vars` and `react-hooks/set-state-in-effect`. Don't try to fix them all as part of an unrelated change. Just avoid adding new ones.
- No tests.
- Deployed on Vercel (`vercel.json` rewrites everything to `index.html` for client-side routing).

## Stack & structure

- React 19, react-router-dom 7, Vite, plain JSX (no TypeScript). `@supabase/supabase-js` is installed but unused.
- `src/api.js`: every backend call goes through `api.*` → `request()`.
  - The JWT is kept in **sessionStorage** on purpose: a reload keeps you logged in, and closing the tab logs you out.
  - GETs retry on 429/502/503/504 and network errors. Writes never retry.
  - Errors are thrown as `Error` with `.status` and `.data`, and the message is the server's `error` string, which is written to be shown to users.
  - Add new endpoints here, grouped under the existing `// ---- Section ----` comments.
- `src/App.jsx`: routes. Wrap pages in `RequireAuth` or `RequireAdmin` from `ProtectedRoute.jsx`. `/support` is public. The global providers are `AuthProvider`, `PendingTimeOffProvider`, `TasksProvider` and `ChatProvider`.
- `src/pages/`: one file per page, and some are very large (`SchedulePage.jsx` has about 3.1k lines, `ManageDataPage.jsx` about 2.5k). Search inside them before adding new files. `src/pages/admin/` holds the staff directory and profile pages.
- **Live updates use polling, not sockets.** Tasks poll every 60s, chat conversations every 15s, open chat messages every 5s, support counts every 60s, and patient alerts every 5 min.
- Patients are routed and fetched **by name** (`/patients/:name`, `api.getPatient(name)`) but updated and deleted by id. Always `encodeURIComponent` names.
- Dates are plain `'YYYY-MM-DD'` strings from the API. Don't turn them into `Date` objects and back, because timezone shifts will corrupt them.

## Styling

- Mostly inline `style={{...}}` objects, with little CSS (`App.css`, `index.css`).
- Brand colors: `BRAND` / `BRAND_SERIF` are exported from `src/pages/StaffPage.jsx` (purple palette). The admin pages re-export them, plus `INK`, `HAIRLINE`, `DANGER` and others, from `src/pages/admin/adminUi.js`. Reuse these instead of adding new hex values.
- Alert colors and icons are in `src/patientAlerts.jsx`.
- Responsive layout: `useIsMobile()` (breakpoint 1024px).

## Conventions & gotchas

- Staff display names use preferred name, then first + last, then username. On the client, use `useStaffDirectory()` / `staffName()` from `src/staffDirectory.js`.
- The support inbox belongs to a single hardcoded user, `SUPPORT_OWNER = 'KJC135'` (`src/supportCount.js`, and mirrored in the API).
- Comments explain *why*, often including the bug a line prevents. Keep that style.
- `.env` is tracked in git despite being a secrets file. It currently holds only `VITE_API_URL`. Never add real secrets to it, since `VITE_*` values ship to the browser anyway.
