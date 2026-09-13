CREATE TABLE `workspaceMembers` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`email` text NOT NULL,
	`userId` text DEFAULT '' NOT NULL,
	`memberId` text NOT NULL,
	`displayName` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`invitedBy` text NOT NULL,
	`createdAt` text NOT NULL,
	`acceptedAt` text DEFAULT '' NOT NULL,
	`revokedAt` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `memberships_by_user` ON `workspaceMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `memberships_by_email` ON `workspaceMembers` (`email`);