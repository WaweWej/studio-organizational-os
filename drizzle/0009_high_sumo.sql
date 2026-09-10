CREATE TABLE `dailyPlanTasks` (
	`org` text NOT NULL,
	`planId` text NOT NULL,
	`taskId` text NOT NULL,
	PRIMARY KEY(`org`, `planId`, `taskId`)
);
--> statement-breakpoint
CREATE TABLE `dailyPlans` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`day` text NOT NULL,
	`actor` text NOT NULL,
	`sourceText` text NOT NULL,
	`summary` text NOT NULL,
	`createdAt` text NOT NULL,
	`fingerprint` text NOT NULL,
	`lastMutation` text NOT NULL,
	`deliveryStatus` text DEFAULT 'not_connected' NOT NULL,
	`deliveryError` text DEFAULT '' NOT NULL,
	`deliveryClaim` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `plans_by_day` ON `dailyPlans` (`org`,`actor`,`day`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `plannedFor` text DEFAULT '' NOT NULL;