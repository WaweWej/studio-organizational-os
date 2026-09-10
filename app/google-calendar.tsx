'use client';
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type {
  GoogleCalendar,
  GoogleCalendarStatus,
} from '@/lib/google-calendar-types';

async function command(input: Record<string, unknown>) {
  const response = await fetch('/api/google-calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await response.json()) as GoogleCalendarStatus & {
    error?: string;
    url?: string;
  };
  if (!response.ok)
    throw new Error(result.error || 'Google Calendar could not connect.');
  return result;
}
export function useGoogleCalendarSync(
  enabled: boolean,
  refresh: () => Promise<void>,
) {
  useEffect(() => {
    if (!enabled) return;
    let running = false,
      stopped = false;
    const sync = async (force = false) => {
      if (running || stopped || document.visibilityState !== 'visible') return;
      running = true;
      try {
        await command({ action: 'sync', force });
      } catch {
        /* The server retains the sync failure; it appears with connection status. */
      } finally {
        if (!stopped) await refresh().catch(() => {});
        running = false;
      }
    };
    const changed = () => {
      void sync(true);
    };
    const visible = () => {
      void sync();
    };
    const timer = window.setInterval(visible, 60000);
    window.addEventListener('studio-work-saved', changed);
    document.addEventListener('visibilitychange', visible);
    void sync();
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('studio-work-saved', changed);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, refresh]);
}
export function GoogleCalendarControl({
  status,
  refresh,
}: {
  status?: GoogleCalendarStatus;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [zone, setZone] = useState('UTC');
  const [disconnecting, setDisconnecting] = useState(false);
  const load = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/google-calendar?calendars=1');
      const body = (await response.json()) as GoogleCalendarStatus & {
        calendars?: GoogleCalendar[];
      };
      if (!response.ok)
        throw new Error(body.error || 'Could not load calendars.');
      setCalendars(body.calendars || []);
      setSelected(body.selected || []);
      setZone(
        body.timeZone || new Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load calendars.');
    } finally {
      setBusy(false);
    }
  }, []);
  const show = () => {
    setOpen(true);
    setDisconnecting(false);
    void load();
  };
  const run = async (input: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const result = await command(input);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      await refresh();
      if (input.action === 'preferences') {
        await command({ action: 'sync', force: true });
        await refresh();
      }
      if (input.action === 'disconnect') setDisconnecting(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Google Calendar could not connect.',
      );
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" onClick={show}>
        <CalendarDays size={16} />
        Google Calendar
        {status?.error || status?.status === 'reconnect'
          ? ' · Needs attention'
          : status?.connected
            ? ' · Connected'
            : ''}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="fc-dialog google-calendar-dialog">
          <DialogHeader>
            <DialogTitle>Google Calendar</DialogTitle>
            <DialogDescription>
              Google meetings appear here. Studio meetings and deadlines appear
              in a dedicated Studio calendar.
            </DialogDescription>
          </DialogHeader>
          {!status?.configured ? (
            <p>Google connection setup is still in progress.</p>
          ) : !status.connected || status.status === 'reconnect' ? (
            <>
              <p>
                Choose your Google account, then approve calendar access. Studio
                can read your calendars and write to the calendar it creates.
              </p>
              <Button
                disabled={busy}
                onClick={() => void run({ action: 'connect' })}
              >
                {status?.status === 'reconnect'
                  ? 'Reconnect Google Calendar'
                  : 'Connect Google Calendar'}
              </Button>
            </>
          ) : (
            <>
              <p>{status.account}</p>
              <fieldset disabled={busy} className="google-calendar-list">
                <legend>Show in Studio</legend>
                {calendars.map((calendar) => (
                  <label key={calendar.id} htmlFor={'google-' + calendar.id}>
                    <Checkbox
                      id={'google-' + calendar.id}
                      checked={selected.includes(calendar.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked
                            ? [...new Set([...current, calendar.id])]
                            : current.filter((id) => id !== calendar.id),
                        )
                      }
                    />
                    <span>{calendar.summary}</span>
                  </label>
                ))}
                {!calendars.length && (
                  <p>{busy ? 'Loading calendars…' : 'No calendars loaded.'}</p>
                )}
              </fieldset>
              <label className="google-time-zone">
                Time zone for Studio deadlines
                <select
                  aria-label="Time zone for Studio deadlines"
                  disabled={busy}
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                >
                  {[
                    ...new Set([
                      zone,
                      new Intl.DateTimeFormat().resolvedOptions().timeZone,
                      'UTC',
                      ...Intl.supportedValuesOf('timeZone'),
                    ]),
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <div className="google-calendar-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: 'preferences',
                      selected,
                      timeZone: zone,
                    })
                  }
                >
                  Save & sync
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run({ action: 'sync', force: true })}
                >
                  <RefreshCw size={15} />
                  Sync now
                </Button>
              </div>
              <p className="google-calendar-detail">
                {status.lastSync
                  ? 'Last synced ' + new Date(status.lastSync).toLocaleString()
                  : 'First sync pending'}
                . Refreshes every minute while Studio is open, and after saved
                changes. Imports the past 90 days and next year.
              </p>
              <p className="google-calendar-detail">
                Edit Google meetings in Google; edit Studio work in Studio.
                Notes and decisions stay in Studio. Meetings without an end time
                appear as one hour. No invitations are sent.
              </p>
              {disconnecting ? (
                <div>
                  <p>
                    Stop syncing this account? Meeting notes stay in Studio and
                    the Studio calendar stays in Google.
                  </p>
                  <div className="google-calendar-actions">
                    <Button
                      disabled={busy}
                      variant="destructive"
                      onClick={() => void run({ action: 'disconnect' })}
                    >
                      Disconnect
                    </Button>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() => setDisconnecting(false)}
                    >
                      Keep connected
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  disabled={busy}
                  variant="ghost"
                  onClick={() => setDisconnecting(true)}
                >
                  Disconnect Google Calendar
                </Button>
              )}
            </>
          )}
          {(error || status?.error) && (
            <p role="alert">{error || status?.error}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
