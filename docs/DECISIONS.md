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

## Scope
- Deferred to v1.1: Google sign-in, offline check-offs, onboarding slides. Reminders are v1 but last.
- Write streak unit tests alongside the streak logic (step 4), not at the end.
