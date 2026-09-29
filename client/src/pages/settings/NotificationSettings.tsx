import { BellOff, BellRing, Share } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "../../lib/push";

type Status = { kind: "checking" } | { kind: PushSupport } | { kind: "blocked" } | { kind: "off" } | { kind: "on" };

/**
 * Turns reminder notifications on or off for this device, and explains honestly when they can't
 * be used here (unsupported browser, iPhone not installed, permission blocked).
 */
export function NotificationSettings() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const support = await pushSupport();
    if (support !== "ready") return setStatus({ kind: support });
    if (Notification.permission === "denied") return setStatus({ kind: "blocked" });
    setStatus({ kind: (await currentSubscription()) ? "on" : "off" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast({ message: errorMessage(error), tone: "error" });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const turnOn = () =>
    run(async () => {
      const result = await enablePush();
      if (result === "enabled") toast({ message: "Notifications are on for this device" });
      if (result === "not-configured") toast({ message: "Notifications aren't set up on the server yet.", tone: "error" });
    });

  const turnOff = () =>
    run(async () => {
      await disablePush();
      toast({ message: "Notifications are off for this device" });
    });

  const sendTest = () =>
    run(async () => {
      await api("/push/test", { method: "POST" });
      toast({ message: "Test sent. It should arrive in a few seconds." });
    });

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="text-body text-muted">
        Reminders arrive as notifications at the time you set on each habit, only on days it's due and only if
        it isn't done yet. Set times on a habit's <Link to="/habits" className="font-medium text-primary">edit screen</Link>.
      </p>

      {status.kind === "checking" && <p className="text-caption text-muted">Checking this device…</p>}

      {status.kind === "on" && (
        <>
          <p className="flex items-center gap-2 text-body font-medium">
            <BellRing size={18} className="text-success" aria-hidden="true" /> On for this device
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void sendTest()} disabled={busy}>
              Send a test
            </Button>
            <Button variant="ghost" onClick={() => void turnOff()} disabled={busy}>
              Turn off
            </Button>
          </div>
        </>
      )}

      {status.kind === "off" && (
        <Button onClick={() => void turnOn()} loading={busy} className="self-start">
          <BellRing size={18} aria-hidden="true" /> Turn on notifications
        </Button>
      )}

      {status.kind === "blocked" && (
        <Notice icon={<BellOff size={18} aria-hidden="true" />}>
          Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.
        </Notice>
      )}

      {status.kind === "needs-install" && (
        <Notice icon={<Share size={18} aria-hidden="true" />}>
          On iPhone and iPad, notifications only work once Habits is on your Home Screen. In Safari, tap Share, then
          "Add to Home Screen", open Habits from there and turn notifications on here.
        </Notice>
      )}

      {status.kind === "unsupported" && (
        <Notice icon={<BellOff size={18} aria-hidden="true" />}>
          This browser can't receive notifications. Try Chrome, Edge, Firefox or Safari, or install Habits on your phone.
        </Notice>
      )}

      {status.kind === "no-worker" && (
        <Notice icon={<BellOff size={18} aria-hidden="true" />}>
          Notifications aren't available in this window. They work in the installed app and in the published site;
          if you've just opened the site, reload the page once.
        </Notice>
      )}
    </div>
  );
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-control bg-surface-2 px-3 py-2 text-body">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <span>{children}</span>
    </p>
  );
}
