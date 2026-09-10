export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  account: string;
  status: string;
  calendarId: string;
  selected: string[];
  timeZone: string;
  lastSync: string;
  error: string;
};
export type GoogleCalendar = {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  timeZone?: string;
  accessRole?: string;
};
export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};
export type GoogleConnection = {
  org: string;
  actor: string;
  token: string;
  account: string;
  calendarId: string;
  selected: string;
  timeZone: string;
  status: string;
  lastSync: string;
  error: string;
  lease: string;
  leaseUntil: number;
  createAttempt: number;
};
