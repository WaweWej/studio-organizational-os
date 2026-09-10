CREATE TABLE `calendarEvents` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`time` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`fingerprint` text NOT NULL,
	`lastMutation` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `calendar_by_date` ON `calendarEvents` (`org`,`date`);--> statement-breakpoint
CREATE TABLE `calendarHistory` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`eventId` text NOT NULL,
	`snapshot` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `dueTime` text DEFAULT '' NOT NULL;