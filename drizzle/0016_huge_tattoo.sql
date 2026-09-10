CREATE TABLE `googleConnections` (
	`org` text NOT NULL,
	`actor` text NOT NULL,
	`token` text NOT NULL,
	`account` text NOT NULL,
	`calendarId` text DEFAULT '' NOT NULL,
	`selected` text DEFAULT '[]' NOT NULL,
	`timeZone` text DEFAULT 'UTC' NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`lastSync` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`lease` text DEFAULT '' NOT NULL,
	`leaseUntil` integer DEFAULT 0 NOT NULL,
	`createAttempt` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`org`, `actor`)
);
--> statement-breakpoint
CREATE TABLE `googleExports` (
	`org` text NOT NULL,
	`actor` text NOT NULL,
	`sourceKey` text NOT NULL,
	`calendarId` text NOT NULL,
	`eventId` text NOT NULL,
	`fingerprint` text NOT NULL,
	PRIMARY KEY(`org`, `actor`, `sourceKey`)
);
--> statement-breakpoint
CREATE TABLE `googleOAuthStates` (
	`org` text NOT NULL,
	`actor` text NOT NULL,
	`id` text NOT NULL,
	`browserHash` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`org`, `actor`, `id`)
);
--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `googleCalendarId` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `googleEventId` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `googleUrl` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `googleStart` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `googleEnd` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `calendar_google_source` ON `calendarEvents` (`org`,`actor`,`googleCalendarId`,`googleEventId`);