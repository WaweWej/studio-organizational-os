CREATE TABLE `blueprints` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`spaceId` text,
	`projectId` text,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`parentId` text,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE TABLE `resourceLinks` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`resourceId` text NOT NULL,
	`targetType` text NOT NULL,
	`targetId` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `links_by_target` ON `resourceLinks` (`org`,`targetType`,`targetId`);--> statement-breakpoint
CREATE TABLE `resourceUpgrades` (
	`org` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`folderId` text,
	`owner` text NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`mime` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`fileKey` text DEFAULT '' NOT NULL,
	`shared` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`lastMutation` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `resources_by_kind` ON `resources` (`org`,`kind`,`archived`);--> statement-breakpoint
CREATE TABLE `vaultConfig` (
	`org` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`salt` text NOT NULL,
	`verifier` text NOT NULL,
	`iterations` integer NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vaultEntries` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`sealed` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
