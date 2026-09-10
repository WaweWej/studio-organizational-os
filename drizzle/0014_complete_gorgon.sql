PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meetings` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`spaceId` text,
	`prospectId` text,
	`participants` text DEFAULT '' NOT NULL,
	`fingerprint` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`startsAt` text NOT NULL,
	`agenda` text NOT NULL,
	`notes` text NOT NULL,
	`decisions` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`updatedAt` text NOT NULL,
	`lastMutation` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_meetings`("org", "id", "spaceId", "prospectId", "participants", "fingerprint", "title", "startsAt", "agenda", "notes", "decisions", "status", "revision", "updatedAt", "lastMutation") SELECT "org", "id", "spaceId", NULL, '', '', "title", "startsAt", "agenda", "notes", "decisions", "status", "revision", "updatedAt", "lastMutation" FROM `meetings`;--> statement-breakpoint
DROP TABLE `meetings`;--> statement-breakpoint
ALTER TABLE `__new_meetings` RENAME TO `meetings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `meetings_by_space` ON `meetings` (`org`,`spaceId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `meetings_by_prospect` ON `meetings` (`org`,`prospectId`,`startsAt`);--> statement-breakpoint
CREATE TABLE `__new_spaceEvents` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`spaceId` text,
	`prospectId` text,
	`meetingId` text,
	`body` text NOT NULL,
	`snapshot` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_spaceEvents`("org", "id", "spaceId", "prospectId", "meetingId", "body", "snapshot", "actor", "createdAt") SELECT "org", "id", "spaceId", NULL, "meetingId", "body", "snapshot", "actor", "createdAt" FROM `spaceEvents`;--> statement-breakpoint
DROP TABLE `spaceEvents`;--> statement-breakpoint
ALTER TABLE `__new_spaceEvents` RENAME TO `spaceEvents`;--> statement-breakpoint
CREATE INDEX `events_by_space` ON `spaceEvents` (`org`,`spaceId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `meetingId` text;