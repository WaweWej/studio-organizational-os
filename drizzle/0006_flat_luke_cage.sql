CREATE TABLE `captureEntries` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`sourceText` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`targetType` text NOT NULL,
	`targetId` text NOT NULL,
	`spaceId` text,
	`projectId` text,
	`taskId` text,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	`fingerprint` text DEFAULT '' NOT NULL,
	`lastMutation` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `captures_by_actor` ON `captureEntries` (`org`,`actor`,`createdAt`);