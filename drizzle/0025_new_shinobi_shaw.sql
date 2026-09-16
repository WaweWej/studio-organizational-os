ALTER TABLE `calendarEvents` ADD `attendees` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `contactEmail` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `calendarEvents` SET `spaceId` = '', `spaceLink` = '' WHERE `spaceLink` = 'auto';
