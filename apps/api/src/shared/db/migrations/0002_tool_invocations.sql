CREATE TABLE `tool_invocations` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`step_id` varchar(36) NOT NULL,
	`tool_name` varchar(100) NOT NULL,
	`idempotency_key` varchar(160) NOT NULL,
	`status` varchar(30) NOT NULL DEFAULT 'pending',
	`phase` varchar(40) NOT NULL DEFAULT 'created',
	`input_hash` varchar(64) NOT NULL,
	`input_preview` json,
	`output_ref` varchar(160),
	`error_code` varchar(80),
	`error_message` text,
	`started_at` datetime(3),
	`heartbeat_at` datetime(3),
	`finished_at` datetime(3),
	`retry_count` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `tool_invocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tool_invocations_idempotency` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_tool_invocations_run_id` ON `tool_invocations` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_invocations_step_id` ON `tool_invocations` (`step_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_invocations_status` ON `tool_invocations` (`status`);
