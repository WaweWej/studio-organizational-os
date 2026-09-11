'use client';
import { Database, ArrowUpRight, Plug, ScanLine } from 'lucide-react';
import type { Workspace } from '@/lib/model';

export default function ConnectionCoverage({
  data,
  ready,
  openTools,
}: {
  data: Workspace;
  ready: boolean;
  openTools: () => void;
}) {
  const tools = data.resources.filter((r) => r.kind === 'tool' && !r.archived);
  return (
    <div className="coverage-view">
      <header>
        <p className="os-overline">Systems / Coverage</p>
        <h1>What Studio can see.</h1>
        <p>
          The useful brief starts with knowing where its information comes from.
        </p>
      </header>
      <section className="coverage-card">
        <Database size={24} />
        <div>
          <h2>Workspace records</h2>
          <p>
            Tasks, projects, meetings, decisions, connected resources, and
            review history.
          </p>
        </div>
        <span className="coverage-status">
          {ready ? 'Available' : 'Loading'}
        </span>
      </section>
      <section className="coverage-card">
        <ScanLine size={24} />
        <div>
          <h2>Context & intelligence</h2>
          <p>
            Briefs assemble saved records. A language model and autonomous
            actions are not connected yet.
          </p>
        </div>
        <span className="coverage-status neutral">Record-based</span>
      </section>
      <section className="coverage-sources">
        <h2>External sources</h2>
        <p>Connection status comes from the saved workspace settings.</p>
        {[
          ['Monday', 'Existing boards, lead records, and automations'],
          ['Slack', 'Team updates, decisions, and review notifications'],
          ['Google Drive', 'Shared files and source documents'],
          ['Google Calendar', 'Personal calendars and meeting synchronization'],
          ['InSMS', 'Lead follow-up and messaging flow status'],
        ].map(([name, purpose]) => (
          <div className="coverage-source" key={name}>
            <Plug size={17} />
            <span>
              <strong>{name}</strong>
              <small>{purpose}</small>
            </span>
            <span>
              {name === 'Google Calendar'
                ? data.googleCalendar?.connected
                  ? data.googleCalendar.error
                    ? 'Needs attention'
                    : 'Connected'
                  : 'Connect in Calendar'
                : name === 'Google Drive'
                  ? data.googleDrive?.connected
                    ? data.googleDrive.access === 'full'
                      ? 'Connected · uploads and browsing'
                      : 'Connected · uploads only'
                    : data.googleDrive?.configured
                      ? 'Connect in Library'
                      : 'Not connected'
                  : name === 'Slack'
                  ? [
                      data.slackCoverage?.plan && 'plan delivery',
                      data.slackCoverage?.events && 'workspace events',
                      data.slackCoverage?.inbound && 'inbound capture',
                    ].filter(Boolean).length
                    ? [
                        data.slackCoverage?.plan && 'plan delivery',
                        data.slackCoverage?.events && 'workspace events',
                        data.slackCoverage?.inbound && 'inbound capture',
                      ]
                        .filter(Boolean)
                        .join(' · ') +
                      (data.slackCoverage?.undelivered
                        ? ` · ${data.slackCoverage.undelivered} undelivered`
                        : '')
                    : 'Not connected'
                  : 'Not connected'}
            </span>
          </div>
        ))}
      </section>
      <button className="coverage-tools" onClick={openTools}>
        <span>
          <strong>
            {tools.length} custom {tools.length === 1 ? 'tool' : 'tools'}{' '}
            registered
          </strong>
          <small>
            Links and uploaded tools live in the Library. Registration does not
            imply live monitoring.
          </small>
        </span>
        <ArrowUpRight size={20} />
      </button>
    </div>
  );
}
