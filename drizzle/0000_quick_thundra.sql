CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`school` text NOT NULL,
	`year` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_school_year` ON `reports` (`school_id`,`year`);--> statement-breakpoint
CREATE INDEX `reports_year` ON `reports` (`year`);