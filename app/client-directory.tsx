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
  const ordered = [...data.spaces].sort((a, b) => {
    const rank = (id: string) =>
      ['nord', 'harbor', 'juniper'].includes(id)
        ? ['nord', 'harbor', 'juniper'].indexOf(id)
        : 10 + data.spaces.findIndex((s) => s.id === id);
    return rank(a.id) - rank(b.id);
  });
  const spaces = ordered.filter(
    (s) =>
      filter === 'all' ||
      (filter === 'owned' ? s.type === 'Owned platform' : s.type === 'Client'),
  );
  return (
    <div className="client-directory">
      <div className="cd-edition">
        <span>STUDIO / THE CLIENT JOURNAL</span>
        <span>{data.demo ? 'SAMPLE COLLECTION' : 'OUR COLLECTIVE WORK'}</span>
      </div>
      <header className="cd-masthead">
        <div>
          <h1>
            Good <em>company.</em>
            <sup>{String(data.spaces.length).padStart(2, '0')}</sup>
          </h1>
          <p>The brands we build. The worlds we work in.</p>
        </div>
        <span className="cd-masthead-note">
          A home for every story.
          <br />A place to move it forward.
        </span>
      </header>
      <div className="cd-index-bar">
        <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
          <TabsList variant="line" className="cd-filter">
            <TabsTrigger value="all">All spaces</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="owned">Our own platforms</TabsTrigger>
          </TabsList>
        </Tabs>
        <span>
          {String(spaces.length).padStart(2, '0')} SPACES / EXPLORE THE INDEX
        </span>
      </div>
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
                  <p>
                    {space.tagline ||
                      (space.type === 'Owned platform'
                        ? 'Our ideas. Out in the world.'
                        : 'The next chapter starts here.')}
                  </p>
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
      <footer className="cd-colophon">
        <strong>studio.</strong>
        <span>Different worlds. One shared workspace.</span>
        <span>END OF INDEX / {String(spaces.length).padStart(2, '0')}</span>
      </footer>
    </div>
  );
}
