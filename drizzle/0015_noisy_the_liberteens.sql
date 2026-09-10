CREATE TABLE `workspaceTransfers` (
	`org` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`recordCount` integer NOT NULL,
	`createdAt` text NOT NULL,
	`mutation` text NOT NULL
);
