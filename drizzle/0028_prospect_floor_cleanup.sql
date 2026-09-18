-- One-time cleanup: the prospecting law gained a date floor (events dated
-- 2026-09-16 or later). Prospects created by the unfloored law from
-- already-held meetings are removed, strictly: automatically created
-- (calendar provenance only), still at stage New, never converted, and
-- linked exclusively to events before the floor. Their provenance notes
-- and event stamps are cleared so history reads truthfully.
DELETE FROM `prospects` WHERE `stage` = 'New'
  AND (`convertedAt` = '' OR `convertedAt` IS NULL)
  AND (`clientId` IS NULL OR `clientId` = '')
  AND EXISTS (SELECT 1 FROM `calendarEvents` ce WHERE ce.`org` = `prospects`.`org` AND ce.`prospectId` = `prospects`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `calendarEvents` ce2 WHERE ce2.`org` = `prospects`.`org` AND ce2.`prospectId` = `prospects`.`id` AND ce2.`date` >= '2026-09-16')
  AND NOT EXISTS (SELECT 1 FROM `prospectEvents` pe WHERE pe.`org` = `prospects`.`org` AND pe.`prospectId` = `prospects`.`id` AND NOT (pe.`kind` = 'context' AND pe.`body` LIKE 'Sales meeting from the calendar:%'));
--> statement-breakpoint
DELETE FROM `prospectEvents` WHERE `kind` = 'context' AND `body` LIKE 'Sales meeting from the calendar:%'
  AND NOT EXISTS (SELECT 1 FROM `prospects` p WHERE p.`org` = `prospectEvents`.`org` AND p.`id` = `prospectEvents`.`prospectId`);
--> statement-breakpoint
UPDATE `calendarEvents` SET `prospectId` = '', `prospectLink` = ''
  WHERE `prospectLink` = 'auto'
  AND (`date` < '2026-09-16'
    OR NOT EXISTS (SELECT 1 FROM `prospects` p WHERE p.`org` = `calendarEvents`.`org` AND p.`id` = `calendarEvents`.`prospectId`));
