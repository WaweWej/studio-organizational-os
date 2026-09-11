CREATE TABLE `slackInbound` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `slack_inbound_by_time` ON `slackInbound` (`org`,`createdAt`);--> statement-breakpoint
CREATE TABLE `slackMessages` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`refId` text NOT NULL,
	`body` text NOT NULL,
	`createdAt` text NOT NULL,
	`deliveryStatus` text DEFAULT 'not_connected' NOT NULL,
	`deliveryError` text DEFAULT '' NOT NULL,
	`deliveryClaim` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `slack_messages_by_status` ON `slackMessages` (`org`,`deliveryStatus`,`createdAt`);