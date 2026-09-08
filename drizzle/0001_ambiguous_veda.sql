CREATE TABLE `meetings` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`spaceId` text NOT NULL,
	`title` text NOT NULL,
	`startsAt` text NOT NULL,
	`agenda` text NOT NULL,
	`notes` text NOT NULL,
	`decisions` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`updatedAt` text NOT NULL,
	`lastMutation` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `meetings_by_space` ON `meetings` (`org`,`spaceId`,`startsAt`);--> statement-breakpoint
CREATE TABLE `spaceEvents` (
	`org` text NOT NULL,
	`id` text NOT NULL,
	`spaceId` text NOT NULL,
	`meetingId` text,
	`body` text NOT NULL,
	`snapshot` text NOT NULL,
	`actor` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`org`, `id`)
);
--> statement-breakpoint
CREATE INDEX `events_by_space` ON `spaceEvents` (`org`,`spaceId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `spaces` ADD `tagline` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `wants` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `needs` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `audience` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `voice` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `website` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `coverUrl` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `logoUrl` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `brandStyle` text DEFAULT 'sans' NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD `lastMutation` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `meetingId` text;
--> statement-breakpoint
-- Enrich only the untouched sample Nord & Form space; real client edits are preserved.
UPDATE spaces SET "tagline"='Considered design. Everyday living.',"wants"='Build desire for the autumn collection and turn interest into qualified enquiries.',"needs"='A clear path from the first ad to a booked conversation. Lead quality matters more than volume.',"audience"='Design-conscious homeowners who value natural materials and things made to last.',"voice"='Calm, confident, human. Show the craftsmanship. Give the materials room to speak.',"coverUrl"='/images/nord-form-cover.png',"brandStyle"='serif' WHERE id='nord' AND brief='Considered design. Everyday living. Calm, confident, human. Lead with materials and craftsmanship.' AND revision=0;
--> statement-breakpoint
INSERT OR IGNORE INTO meetings (org,"id","spaceId","title","startsAt","agenda","notes","decisions","status","revision","updatedAt") SELECT org,'nord-next','nord','Autumn launch · working session','2026-09-10T08:00:00.000Z','Review the landing page direction
Agree the campaign concepts
Check lead quality and the booking journey','','','Planned',0,'2026-09-08T09:30:22.595Z' FROM spaces WHERE id='nord' AND brief='Considered design. Everyday living. Calm, confident, human. Lead with materials and craftsmanship.' AND revision=0;
--> statement-breakpoint
INSERT OR IGNORE INTO meetings (org,"id","spaceId","title","startsAt","agenda","notes","decisions","status","revision","updatedAt") SELECT org,'nord-kickoff','nord','Autumn collection · direction','2026-09-03T08:00:00.000Z','Align on the creative direction and launch priorities.','The client responded to the quieter visual direction. They want fewer, stronger pieces of content and a landing page that lets the materials speak.','Use material close-ups as the creative foundation.
Keep one clear enquiry call to action.
Review lead quality alongside campaign results.','Completed',0,'2026-09-08T09:30:22.595Z' FROM spaces WHERE id='nord' AND brief='Considered design. Everyday living. Calm, confident, human. Lead with materials and craftsmanship.' AND revision=0;
