CREATE TABLE `apiTokens` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`tokenHash` text NOT NULL,
	`prefix` text NOT NULL,
	`scopes` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text NOT NULL,
	`lastUsedAt` text DEFAULT '' NOT NULL,
	`revokedAt` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_by_hash` ON `apiTokens` (`tokenHash`);