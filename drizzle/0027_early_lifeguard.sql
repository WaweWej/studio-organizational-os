ALTER TABLE `calendarEvents` ADD `prospectId` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendarEvents` ADD `prospectLink` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `prospects` ADD `contactEmail` text DEFAULT '' NOT NULL;