import type { ReactNode } from "react";
import { Link } from "react-router";

// DRAFT privacy policy. It describes what this codebase actually does; the [bracketed] parts are
// for whoever runs the app to fill in. Review it (ideally with someone who knows the rules where
// you operate) before publishing. It is not legal advice. See docs/DEPLOYMENT.md.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-subheading font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-body text-muted [&_strong]:text-text">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-caption font-medium text-primary">
        ← Habits
      </Link>
      <h1 className="mt-4 text-title font-semibold">Privacy</h1>
      <p className="mt-2 text-caption text-muted">Last updated [date]</p>

      <p className="mt-6 text-body">
        Habits is run by [your name or company]. This page explains what we store when you use it, why, and what
        you can do about it. In short: we keep what's needed to track your habits, we don't sell it or show ads, and
        you can download or delete all of it at any time.
      </p>

      <Section title="What we store">
        <p>
          <strong>Your account:</strong> your email address, the name you give (optional), and your password, stored
          only as a one-way hash that can't be turned back into the password. Also your timezone, which day your week
          starts on and your theme choice.
        </p>
        <p>
          <strong>Your habits:</strong> the habits you create, their schedules and reminder times, every day you check
          one off (with any amount or note you add), and when you archive a habit.
        </p>
        <p>
          <strong>Your devices, if you turn on notifications:</strong> an address and keys your browser gives us so we
          can send it reminders. We store one per device and delete it when you turn notifications off, log out, or
          the device stops accepting them.
        </p>
        <p>
          <strong>Sign-in sessions:</strong> a record of each device you're logged in on, so you can stay logged in
          and so logging out or resetting your password can end those sessions.
        </p>
        <p>
          <strong>Technical logs:</strong> our servers record requests, including IP addresses, to keep the service
          secure (for example to limit repeated login attempts) and to fix problems. [State how long your hosting
          keeps logs.]
        </p>
      </Section>

      <Section title="What we don't do">
        <p>
          We don't sell your data, show ads, or use third-party analytics or tracking. We only email you when you ask
          (a password reset link).
        </p>
      </Section>

      <Section title="Cookies and storage">
        <p>
          We use <strong>one cookie</strong>, which keeps you logged in. It's essential for the app to work, can't be
          read by the page's scripts, and is only sent to our own server. Your browser also remembers your theme so
          the app doesn't flash the wrong colours when it opens, and it stores the app's files so the app can start
          offline. None of these are used for tracking.
        </p>
      </Section>

      <Section title="Who helps us run Habits">
        <p>These services handle data on our behalf, only to provide Habits:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Vercel</strong> serves the app, and <strong>Render</strong> runs our server and database.
          </li>
          <li>
            <strong>Resend</strong> sends password reset emails.
          </li>
          <li>
            <strong>Your browser's push service</strong> (from Google, Apple, Mozilla or Microsoft, depending on your
            device) delivers reminder notifications. The reminder is encrypted so only your device can read it.
          </li>
          <li>
            [If you turn on error tracking:] <strong>Sentry</strong> receives reports when something breaks. They
            contain technical details about the error, not your account, habits, cookies or anything you typed.
          </li>
        </ul>
        <p>[Say where these services store data, e.g. the regions you chose.]</p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your data while you have an account. When you delete your account, everything above is deleted from
          our database straight away. Copies in our database backups are removed as those backups expire after [backup
          retention period].
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          <strong>Download everything</strong> in Settings → Your data → Export data.
        </p>
        <p>
          <strong>Delete your account</strong> and all its data in Settings → Account → Delete account.
        </p>
        <p>
          <strong>Turn notifications off</strong> in Settings → Reminders, or in your browser's settings.
        </p>
        <p>
          For anything else, including questions about this page or your data, contact us at [contact email].
          [Add any rights and contacts that apply where you operate, for example a data protection authority.]
        </p>
      </Section>

      <Section title="Children">
        <p>Habits isn't aimed at children under [13/16, depending on where you operate].</p>
      </Section>

      <Section title="Changes">
        <p>If we change this page, we'll update the date at the top. [Say how you'll tell people about big changes.]</p>
      </Section>
    </main>
  );
}
