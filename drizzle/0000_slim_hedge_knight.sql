CREATE TABLE `activities` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`taskId` text NOT NULL,
	`body` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `activities_by_task` ON `activities` (`org`,`taskId`);--> statement-breakpoint
CREATE TABLE `documents` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`collection` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`color` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`taskId` text NOT NULL,
	`body` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `notes_by_task` ON `notes` (`org`,`taskId`);--> statement-breakpoint
CREATE TABLE `notices` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`taskId` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`read` integer NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `notices_by_recipient` ON `notices` (`org`,`recipient`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`spaceId` text,
	`description` text NOT NULL,
	`due` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `projects_by_space` ON `projects` (`org`,`spaceId`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`taskId` text NOT NULL,
	`version` integer NOT NULL,
	`reviewer` text NOT NULL,
	`decision` text NOT NULL,
	`feedback` text NOT NULL,
	`createdAt` text NOT NULL,
	`snapshot` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `reviews_by_task` ON `reviews` (`org`,`taskId`,`version`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`brief` text NOT NULL,
	`owner` text NOT NULL,
	`meeting` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`projectId` text,
	`assignee` text NOT NULL,
	`reviewer` text NOT NULL,
	`stage` text NOT NULL,
	`description` text NOT NULL,
	`due` text NOT NULL,
	`priority` text NOT NULL,
	`blocked` text NOT NULL,
	`deliverable` text NOT NULL,
	`delivery` text NOT NULL,
	`version` integer NOT NULL,
	`revision` integer NOT NULL,
	`position` integer NOT NULL,
	`updatedAt` text NOT NULL,
	`lastMutation` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `tasks_by_assignee` ON `tasks` (`org`,`assignee`,`stage`);--> statement-breakpoint
CREATE INDEX `tasks_by_project` ON `tasks` (`org`,`projectId`);--> statement-breakpoint
CREATE TABLE `tools` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`projectId` text NOT NULL,
	`owner` text NOT NULL,
	`url` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
