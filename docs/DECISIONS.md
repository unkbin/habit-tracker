# Design decisions

Agreed after the spec review on 2026-09-29. These override the original spec where they differ.
Give this file to the AI alongside the spec at the start of each session.

## Dates and time
- Weekdays are integers **0-6, 0 = Sunday** (same as JS `Date#getDay`). Applies to
  `habits.target_weekdays` and `users.week_start_day`.
- Dates the user sees (`completions.date`, `habits.start_date`, pause dates) are Postgres `DATE`
  values holding the user's **local** calendar date. Instants use `timestamptz`.
- "Today" is always computed from the timezone currently saved on the user. It is set
  automatically at signup from `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Check-offs
- The client sends the local date it is checking off. The server rejects dates in the future
  (in the user's timezone, allowing a small clock-skew margin) and dates more than **7 days** back.
- `POST /habits/:id/completions` is an upsert and `DELETE` succeeds if already gone, so retries and
  the offline queue are safe. Queued offline check-offs keep the local date from when they were tapped.
- Measurable habits: `habits.target_value` (+ optional `unit`) and `completions.value`. A habit with
  `target_value = null` is yes/no. A habit can't switch between yes/no and measured after creation
  (its past completions wouldn't fit); the target amount can change.
- Removing a check-off is limited to the same 7-day window. Check-offs before a habit's start date
  are rejected, as are check-offs on archived habits (409 `habit_archived`).
- Check-offs on unscheduled days (e.g. a Tuesday for a Mon/Wed/Fri habit) are allowed and stored.
  They count towards totals but can't save a streak.
- The clock-skew allowance for "future" dates is 10 minutes.

## Streaks and stats (derived, never stored)
- Editing a habit's frequency re-scores all its history against the new schedule. Accepted for v1.
- Days before `start_date` never count as misses.
- The current streak stays alive while today is still in progress: it counts through the most
  recent scheduled day that was completed, and today only breaks it once today is over.
- Archiving **pauses** the streak. Each archive/unarchive is a `habit_pauses` row; paused dates are
  skipped, not counted as misses. A habit is archived while it has a pause with `end_date = null`
  (at most one, enforced by a partial unique index).
- X-times-per-week habits: the streak counts consecutive weeks (starting on the user's week start
  day) where the target was met. The current week doesn't count against it until it ends.
- Completion rate = completed scheduled days / scheduled days in the window. Best/worst weekday is
  measured the same way, relative to scheduled days.
- Implemented in `server/src/domain/progress.ts` (pure functions, unit-tested in
  `tests/progress.test.ts`). Details settled while building it:
  - A day that was done still counts even if it falls in an archived period (e.g. done, then
    archived the same day). Archived days that weren't done are skipped.
  - A measured habit's day counts only when the amount reached the target; partial amounts are
    shown but are misses.
  - Times-per-week: a week the habit only partly existed for (its first week, or partly archived)
    needs only as many check-offs as it had available days. A fully archived week is skipped.
  - Times-per-week completion rate expects `timesPerWeek x available days / 7`, capped at 100%.
    Chart buckets (weeks, months) are tallied per habit over the whole bucket, then summed, so a
    weekly habit isn't judged day by day.
- `GET /today` lists active habits that have started and are due today (weekly habits every day).
  Each item has `done` (checked off today) and `satisfied` (done, or this week's target already met);
  the summary counts `satisfied`, so a met weekly habit doesn't block "all done".
- `GET /stats/overview` covers active habits only: rates for 7/30/90 days, 30 daily counts,
  12 weeks, 6 months, a weekday breakdown over the last 90 days, best/worst weekday (null unless
  the rates differ) and every habit ranked by 30-day rate.

## Auth
- Access token is short-lived and kept **in memory** on the client (never localStorage).
- Refresh token is an httpOnly cookie. Only its SHA-256 hash is stored (`sessions`). Tokens rotate
  on every refresh; reuse of an old token revokes its whole `family_id`.
- Frontend and API are served from the **same site** (e.g. `app.example.com` + `api.example.com`,
  or `/api` proxied through Vercel rewrites) so the cookie is first-party.
- Reset tokens are hashed, single-use, short-lived; using one revokes all the user's sessions.
  Forgot-password returns the same response whether or not the email exists.
- Emails are stored lowercased (enforced by a check constraint).
- Access tokens last 15 minutes, refresh tokens 30 days (renewed on each refresh). Access tokens
  are stateless, so one stays valid for up to 15 minutes after logout or a password reset.
- Two refreshes racing with the same cookie look like token reuse and log the user out. The
  frontend must run only one refresh at a time **across tabs** (Web Locks API: navigator.locks).
- Signup returns 409 for an existing email. That reveals the email is registered; accepted for v1
  (rate limited). Login and forgot-password do not reveal it.
- Rate limits are in memory (per server instance): login 10/15 min, signup 5/hour,
  forgot-password 5/hour, reset-password 10/15 min, per IP.
- Errors are JSON: { "error": { "code", "message", "fields"? } }. The frontend switches on code.

## Reminders
- `habits.reminder_time` is local wall-clock `"HH:MM"`; `habits.last_reminded_on` makes the
  scheduler send each reminder exactly once per local day. Skip habits already done today.
- Run the scheduler as a Render Cron Job or always-on worker, not inside a free web service that sleeps.
- One `push_subscriptions` row per device, unique on `endpoint`; delete on a 404/410 from the push service.

## API
- Register `PATCH /habits/reorder` before `PATCH /habits/:id`. Reorder takes `{ ids }`; listed habits
  get positions 0..n-1 and any unlisted ones keep their relative order after them.
- Another user's habit answers 404 `habit_not_found`, exactly like a missing one.
- Archive and restore via `PATCH /habits/:id { archived }`. Restoring closes the pause on the day
  before; archiving and restoring on the same day leaves no pause.
- Changing `reminderTime` resets `last_reminded_on`.
- `DELETE /me` requires `{ password }` and answers 403 `incorrect_password` (not 401, which the
  frontend treats as "logged out").
- Unique-constraint races answer 409 `conflict`; rows vanishing mid-request answer 404.

## Frontend
- The app calls the API at `/api/*` on its own origin: the Vite dev server proxies it, and in
  production the host must rewrite `/api/*` to the API. So the refresh cookie path is `/api/auth`
  (`COOKIE_PATH`), and CORS barely matters.
- The access token lives only in memory in `client/src/api/client.ts`. On a 401 the client refreshes
  once (single-flight in the tab, serialised across tabs with `navigator.locks`) and retries. On page
  load the session is restored from the refresh cookie.
- Colours are semantic tokens in `client/src/index.css` (`bg-surface`, `text-muted`, ...), switched for
  dark mode by `<html data-theme>`. Components never use raw colours, except a habit's own colour.
- Check-offs are optimistic. Each tap is resolved against the latest cached data, not the tapped
  card's props, and applied to the cache synchronously, so rapid taps build on each other (three
  quick "+1" taps add 3). A failed save restores the previous data and shows an error toast.
- Server data lives in TanStack Query; keys are in `client/src/api/endpoints.ts`.

## Scope
- Deferred to v1.1: Google sign-in, offline check-offs, onboarding slides. Reminders are v1 but last.
- Write streak unit tests alongside the streak logic (step 4), not at the end.
