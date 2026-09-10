'use client';
import { useId } from 'react';
import type { Workspace } from '@/lib/model';
import { dateKey } from '@/lib/calendar-model';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
export function MeetingConnection({
  data,
  value,
  onChange,
  disabled = false,
}: {
  data: Workspace;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const controlId = useId();
  const options = [
    { id: 'none', name: 'Workspace meeting' },
    ...data.prospects
      .filter((p) => !p.convertedAt)
      .map((p) => ({ id: 'prospect:' + p.id, name: p.name + ' · Prospect' })),
    ...data.spaces.map((s) => ({
      id: 'space:' + s.id,
      name: s.name + ' · ' + s.type,
    })),
  ];
  return (
    <label htmlFor={controlId} className="meeting-connection">
      Connected to
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger
          id={controlId}
          aria-label="Meeting connection"
          disabled={disabled}
        >
          <SelectValue>
            {options.find((o) => o.id === value)?.name ||
              'Choose a prospect or client'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem value={o.id} key={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
export function meetingConnection(value: string) {
  return {
    prospectId: value.startsWith('prospect:') ? value.slice(9) : null,
    spaceId: value.startsWith('space:') ? value.slice(6) : null,
  };
}
export function meetingStartsAt(day: string, time: string) {
  const date = new Date(day + 'T' + time + ':00');
  if (
    !day ||
    !time ||
    Number.isNaN(date.getTime()) ||
    dateKey(date) !== day ||
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` !==
      time
  )
    throw new Error('Choose a valid meeting date and time.');
  return date.toISOString();
}
