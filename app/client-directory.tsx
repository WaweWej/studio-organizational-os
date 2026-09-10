'use client';
/* eslint-disable next/no-img-element -- Brand covers are served directly; no image proxy is configured. */

import { taskSpaceId } from '@/lib/task-context';
import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Workspace } from '@/lib/model';

export default function ClientDirectory({
  data,
  openSpace,
}: {
  data: Workspace;
  openSpace: (id: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const ordered = [...data.spaces].sort((a, b) => a.name.localeCompare(b.name));
  const spaces = ordered.filter(
    (s) =>
      filter === 'all' ||
      (filter === 'owned' ? s.type === 'Owned platform' : s.type === 'Client'),
  );
  return (
    <div className="client-directory">
      <header className="spaces-heading">
        <h1>Spaces</h1>
        <span>{data.spaces.length}</span>
      </header>
      <div className="cd-index-bar">
        <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
          <TabsList variant="line" className="cd-filter">
            <TabsTrigger value="all">All spaces</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="owned">Our own platforms</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {!spaces.length && (
        <p className="spaces-empty">
          {filter === 'owned'
            ? 'No platforms yet.'
            : filter === 'clients'
              ? 'No clients yet.'
              : 'No spaces yet.'}
        </p>
      )}
      <div className="cd-grid">
        {spaces.map((space, index) => {
          const projects = data.projects.filter((p) => p.spaceId === space.id);
          const tasks = data.tasks.filter(
            (t) => t.stage !== 'Done' && taskSpaceId(data, t) === space.id,
          );
          const next = data.meetings
            .filter((m) => m.spaceId === space.id && m.status === 'Planned')
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
          return (
            <button
              className={`cd-story ${index === 0 && filter === 'all' ? 'cd-story-featured' : ''} cd-type-${space.brandStyle} ${space.coverUrl ? 'cd-with-image' : 'cd-typographic'}`}
              key={space.id}
              onClick={() => openSpace(space.id)}
              style={{ '--story-color': space.color } as CSSProperties}
            >
              <div className="cd-story-art">
                {space.coverUrl && (
                  <img
                    src={space.coverUrl}
                    alt=""
                    loading={index > 0 ? 'lazy' : 'eager'}
                  />
                )}
                <div className="cd-story-tint" />
                <span className="cd-story-number">
                  {String(
                    ordered.findIndex((s) => s.id === space.id) + 1,
                  ).padStart(2, '0')}{' '}
                  / {space.type}
                </span>
                <div className="cd-story-wordmark">
                  {space.logoUrl && <img src={space.logoUrl} alt="" />}
                  <h2>{space.name}</h2>
                  {space.tagline && <p>{space.tagline}</p>}
                </div>
                <span className="cd-enter">
                  <ArrowUpRight size={24} />
                </span>
              </div>
              <div className="cd-story-caption">
                <div>
                  <span>
                    {projects.length}{' '}
                    {projects.length === 1 ? 'project' : 'projects'}
                  </span>
                  <i />
                  <span>{tasks.length} open tasks</span>
                  {next && (
                    <>
                      <i />
                      <span>
                        Meeting{' '}
                        {new Date(next.startsAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </>
                  )}
                </div>
                <span>
                  Enter space
                  <ArrowRight size={15} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
