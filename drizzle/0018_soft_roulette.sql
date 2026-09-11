CREATE TABLE `driveFolders` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`spaceId` text DEFAULT '' NOT NULL,
	`folderId` text NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_folders_by_space` ON `driveFolders` (`org`,`spaceId`);--> statement-breakpoint
ALTER TABLE `googleConnections` ADD `scopes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `resources` ADD `driveFileId` text DEFAULT '' NOT NULL;