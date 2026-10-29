CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`active_slot_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`active_slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_active_slot_unique` ON `bookings` (`active_slot_id`);--> statement-breakpoint
CREATE INDEX `bookings_email_created_idx` ON `bookings` (`email`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`email` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slots` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL
);
