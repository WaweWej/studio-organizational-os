ALTER TABLE `tasks` ADD `focusFor` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reviewRequired` integer DEFAULT 1 NOT NULL;