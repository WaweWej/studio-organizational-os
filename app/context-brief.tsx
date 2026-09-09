'use client';
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  AlertCircle,
  ScanLine,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { buildClientBrief } from '@/lib/workspace-brief';
import type { Workspace } from '@/lib/model';
import { RelatedResources } from './resource-library';
import { readableDate, useWorkspaceClock } from './today';

export default function ContextBrief({
  data,
  spaceId,
  close,
  openSpace,
  openTask,
  openProject,
  openMeeting,
}: {
  data: Workspace;
  spaceId: string | null;
  close: () => void;
  openSpace: (id: string) => void;
  openTask: (id: string, focus?: 'brief' | 'work') => void;
  openProject: (id: string) => void;
  openMeeting: (spaceId: string, meetingId: string) => void;
}) {
  const now = useWorkspaceClock();
  const brief = buildClientBrief(data, spaceId || '', now);
  const { space, upcoming, previous } = brief;
  const go = (action: () => void) => {
    close();
    action();
  };
  return (
    <Sheet open={!!space} onOpenChange={(open) => !open && close()}>
      <SheetContent className="context-brief-sheet">
        <SheetHeader>
          <SheetTitle>
            <ScanLine size={16} /> Client brief
          </SheetTitle>
          <SheetDescription>
            Assembled from saved records ·{' '}
            {now.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </SheetDescription>
        </SheetHeader>
        {space && (
          <>
            <div className="brief-brand" style={{ borderColor: space.color }}>
              <p className="os-overline">{space.type} / Meeting preparation</p>
              <h2>{space.name}</h2>
              <p>{space.tagline || space.brief}</p>
              <button onClick={() => go(() => openSpace(space.id))}>
                Enter client space <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="brief-content">
              <section className="brief-meeting-callout">
                <CalendarDays size={20} />
                <div>
                  <small>
                    {upcoming
                      ? readableDate(upcoming.startsAt, true)
                      : 'No upcoming meeting recorded'}
                  </small>
                  <h3>{upcoming?.title || 'The client context is ready.'}</h3>
                </div>
                <button
                  className="os-button os-button-dark"
                  onClick={() =>
                    go(() =>
                      upcoming
                        ? openMeeting(space.id, upcoming.id)
                        : openSpace(space.id),
                    )
                  }
                >
                  {upcoming ? 'Open meeting notes' : 'Plan a meeting'}
                  <ArrowRight size={15} />
                </button>
              </section>
              <div className="brief-two-col">
                <section>
                  <h3 className="brief-label">What matters to them</h3>
                  <p className="brief-prose">
                    {space.wants || 'Their goals have not been recorded yet.'}
                  </p>
                  {space.needs && (
                    <>
                      <h4 className="brief-sublabel">What they need from us</h4>
                      <p className="brief-prose">{space.needs}</p>
                    </>
                  )}
                  <button
                    className="brief-source"
                    onClick={() => go(() => openSpace(space.id))}
                  >
                    Source: client profile <ArrowUpRight size={12} />
                  </button>
                </section>
                <section>
                  <h3 className="brief-label">On the agenda</h3>
                  <p className="brief-prose">
                    {upcoming?.agenda ||
                      'No agenda recorded. Use the open work below to shape the conversation.'}
                  </p>
                  {upcoming && (
                    <button
                      className="brief-source"
                      onClick={() =>
                        go(() => openMeeting(space.id, upcoming.id))
                      }
                    >
                      Source: upcoming meeting <ArrowUpRight size={12} />
                    </button>
                  )}
                </section>
              </div>
              <section className="brief-section">
                <div className="desk-section-heading">
                  <h3>Last time, we agreed</h3>
                  {previous && (
                    <span className="section-caption">
                      {readableDate(previous.startsAt)}
                    </span>
                  )}
                </div>
                <p className="brief-prose">
                  {previous?.decisions ||
                    (previous
                      ? 'No decisions were captured at the last completed meeting.'
                      : 'No completed meeting is recorded yet.')}
                </p>
                {previous && (
                  <button
                    className="brief-source"
                    onClick={() => go(() => openMeeting(space.id, previous.id))}
                  >
                    Read {previous.title} <ArrowUpRight size={12} />
                  </button>
                )}
              </section>
              <section className="brief-section">
                <div className="desk-section-heading">
                  <h3>Bring into the conversation</h3>
                  <span className="section-caption">
                    From current task states
                  </span>
                </div>
                {brief.blocked.map((t) => (
                  <button
                    className="brief-work-row"
                    key={t.id}
                    onClick={() => go(() => openTask(t.id))}
                  >
                    <AlertCircle size={17} />
                    <span>
                      <strong>{t.title}</strong>
                      <small>{t.blocked}</small>
                    </span>
                    <span className="brief-state">Blocked</span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
                {brief.reviews
                  .filter((t) => !t.blocked.trim())
                  .map((t) => (
                    <button
                      className="brief-work-row"
                      key={t.id}
                      onClick={() => go(() => openTask(t.id, 'work'))}
                    >
                      <CheckCheck size={17} />
                      <span>
                        <strong>{t.title}</strong>
                        <small>
                          {data.members.find((m) => m.id === t.reviewer)
                            ?.name || 'Assigned reviewer'}{' '}
                          · version {t.version}
                        </small>
                      </span>
                      <span className="brief-state">In review</span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                {!brief.blocked.length && !brief.reviews.length && (
                  <p className="brief-prose">
                    No recorded blockers or pending reviews for this client.
                  </p>
                )}
              </section>
              <section className="brief-section">
                <div className="desk-section-heading">
                  <h3>Delivery, at a glance</h3>
                  <span className="section-caption">
                    Completed tasks / total
                  </span>
                </div>
                {brief.projects.map((p) => (
                  <button
                    className="brief-project"
                    key={p.id}
                    onClick={() => go(() => openProject(p.id))}
                  >
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.due
                          ? `Due ${readableDate(p.due)}${p.overdue ? ' · overdue' : ''}`
                          : 'No project deadline set'}
                      </small>
                    </span>
                    <span className="brief-progress">
                      <span
                        style={{
                          width: `${p.total ? (p.done / p.total) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span>
                      {p.done}/{p.total}
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
                {!brief.projects.length && (
                  <p className="brief-prose">No projects are connected yet.</p>
                )}
                {brief.deadlines.length > 0 && (
                  <details className="brief-deadlines">
                    <summary>
                      {brief.deadlines.length} open task{' '}
                      {brief.deadlines.length === 1 ? 'deadline' : 'deadlines'}
                    </summary>
                    {brief.deadlines.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => go(() => openTask(t.id))}
                      >
                        <span>{t.title}</span>
                        <time>{readableDate(t.due)}</time>
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </details>
                )}
              </section>
              <section className="brief-section">
                <div className="desk-section-heading">
                  <h3>
                    {previous
                      ? 'Recorded since the last meeting'
                      : 'Recent recorded changes'}
                  </h3>
                </div>
                {brief.changes.slice(0, 5).map((event) => (
                  <button
                    className="brief-event"
                    key={`${event.source}:${event.id}`}
                    onClick={() =>
                      go(() =>
                        event.source === 'task'
                          ? openTask(event.sourceId!)
                          : event.sourceId
                            ? openMeeting(space.id, event.sourceId)
                            : openSpace(space.id),
                      )
                    }
                  >
                    <span className="activity-dot" />
                    <span>
                      {event.body}
                      <small>
                        {readableDate(event.createdAt, true)} ·{' '}
                        {data.members.find((m) => m.id === event.actor)?.name ||
                          'Workspace'}
                      </small>
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                {!brief.changes.length && (
                  <p className="brief-prose">
                    No activity has been recorded in this period.
                  </p>
                )}
                {brief.changes.length > 5 && (
                  <p className="section-caption">
                    Showing the latest 5 of {brief.changes.length} recorded
                    changes.
                  </p>
                )}
              </section>
              <RelatedResources target={{ type: 'space', id: space.id }} />
              <p className="brief-provenance">
                This brief reflects saved workspace records. Campaign
                performance, external messages, and automation health are not
                included until their sources are connected.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
