CREATE TABLE `report_versions` (
	`version_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` text NOT NULL,
	`replaced_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `report_versions_report` ON `report_versions` (`report_id`);