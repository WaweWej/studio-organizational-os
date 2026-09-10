CREATE TABLE `clientRemovals` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`prospectId` text,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	`mutation` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
