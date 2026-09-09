CREATE TABLE `prospectEvents` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`prospectId` text NOT NULL,
	`taskId` text,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	`fingerprint` text DEFAULT '' NOT NULL,
	`lastMutation` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `events_by_prospect` ON `prospectEvents` (`org`,`prospectId`);--> statement-breakpoint
CREATE TABLE `prospects` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`nameKey` text NOT NULL,
	`owner` text NOT NULL,
	`stage` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`lastMutation` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_by_name` ON `prospects` (`org`,`nameKey`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `prospectId` text;