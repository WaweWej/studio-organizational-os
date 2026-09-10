CREATE TABLE `taskDeletions` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	`mutation` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `archived` integer DEFAULT 0 NOT NULL;
