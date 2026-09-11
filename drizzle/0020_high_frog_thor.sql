CREATE TABLE `fileBlobs` (
	`org` text NOT NULL,
	`key` text NOT NULL,
	`fingerprint` text DEFAULT '' NOT NULL,
	`bytes` blob NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `key`)
);
