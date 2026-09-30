# Testing

## Automated

Run everything CI runs:

```bash
npm run typecheck
npm test -w server
npm test -w client
```

**Server** (`server/tests`, Vitest + Supertest, against Postgres):

- `progress.test.ts`: streaks and stats as pure functions. New habits, missed days, weekday and
  times-per-week schedules, the week start day, archived periods, measured goals, and just before
  and after midnight.
- `auth`, `habits`, `completions`, `me`, `stats`, `push`: every endpoint, including validation, the
  7-day editing window in the user's timezone, token rotation and reuse detection, password reset,
  and export and deletion.
- `ownership.test.ts`: every habit route tried by a second user, which must get "not found".
- `reminders.test.ts`: when reminders fire (timezones, the late window, schedules, weekly targets),
  one notification per person, dead devices removed, and no double-sends from overlapping runs.
- `mailer.test.ts`: the request sent to Resend.

By default they use an in-memory Postgres (PGlite), so no setup is needed. CI and
`TEST_DATABASE_URL=...` run them against real Postgres.

**App** (`client/src/test`, Vitest + React Testing Library + MSW): the real app in a simulated
browser, against a fake API that records every request.

- Signing up (sends the device's timezone, starts onboarding, validates first).
- Creating a habit (the exact data sent, suggestions, amount goals, missing fields).
- Checking habits off (instant tick, rollback on a server error and when offline, Undo, the
  all-done celebration, the first-habit prompt).
- The privacy page, the error page (including the one-time reload after a deploy), and a check that
  `vercel.json`'s Content Security Policy still matches `index.html`.

## Manual checklist

Things automated tests can't cover. Do these on the deployed app before launch and after big changes.

**On a real phone (iPhone and Android if you can)**

- [ ] Install to the home screen; it opens full screen with the right icon and name.
- [ ] Turn notifications on, send a test, and receive a real reminder at its time.
- [ ] Tap targets are comfortable; nothing is hidden under the notch or the home bar.
- [ ] Rotate the phone; the layout still works.

**Themes and display**

- [ ] Light, dark and System in Settings; switch the phone's theme while the app is open.
- [ ] Reload in dark mode: no flash of light theme.
- [ ] Browser zoom at 200% and the phone's largest text size: nothing overlaps or is cut off.

**Slow and flaky connections**

- [ ] In the browser's developer tools, throttle to "Slow 3G": loading states show, taps still feel
      instant, and nothing is ticked twice.
- [ ] Go offline and tick a habit: it goes back with a "Can't reach the server" message; the list
      stays on screen.
- [ ] Offline, reopen the installed app: it opens (showing it can't refresh) rather than failing to load.

**Accessibility**

- [ ] Keyboard only (Tab, Shift+Tab, Enter, Space, arrow keys in pickers): every action is reachable
      and focus is always visible.
- [ ] A screen reader (VoiceOver on iPhone/Mac, TalkBack on Android, NVDA on Windows): page changes
      are announced, check buttons say whether they're done, and the calendar reads each day.

**Time and dates**

- [ ] Change your timezone in Settings; Today's date follows it.
- [ ] Around midnight: yesterday's unfinished habits don't show as broken streaks until the day ends,
      and the Today screen rolls over to the new day.
- [ ] A reminder set near a daylight-saving change arrives at the right local time.

**Accounts**

- [ ] Reset your password from the email; other devices are logged out.
- [ ] Log in on two devices, log out on one; the other stays logged in, and the logged-out device
      stops getting reminders.
- [ ] Export your data; delete your account; you can't log in again.
