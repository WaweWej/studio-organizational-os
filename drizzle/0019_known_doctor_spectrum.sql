ALTER TABLE `meetings` ADD `recurrence` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `recurrenceOf` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrenceOf` text DEFAULT '' NOT NULL;