CREATE TABLE `capability_route_decisions` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36),
	`session_id` varchar(36),
	`user_id` varchar(36),
	`input_hash` varchar(64) NOT NULL,
	`requested_agent_id` varchar(100),
	`resolved_agent_id` varchar(100),
	`route_type` varchar(30) NOT NULL,
	`confidence` decimal(5,4) NOT NULL,
	`reason` text NOT NULL,
	`source` varchar(30) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `capability_route_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
	`recovery_payload` json,
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
CREATE TABLE `workflow_runs` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`workflow_id` varchar(100) NOT NULL,
	`status` varchar(30) NOT NULL,
	`current_stage_id` varchar(100),
	`waiting_human_stage_id` varchar(100),
	`stage_results` json NOT NULL,
	`error` json,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `workflow_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `metadata` json;--> statement-breakpoint
ALTER TABLE `runs` ADD `idempotency_key` varchar(160);--> statement-breakpoint
ALTER TABLE `runs` ADD `checkpoint_payload` json;--> statement-breakpoint
ALTER TABLE `runs` ADD CONSTRAINT `uq_runs_idempotency_user` UNIQUE(`idempotency_key`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_capability_route_run_id` ON `capability_route_decisions` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_capability_route_session_id` ON `capability_route_decisions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_capability_route_user_id` ON `capability_route_decisions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_capability_route_created_at` ON `capability_route_decisions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tool_invocations_run_id` ON `tool_invocations` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_invocations_step_id` ON `tool_invocations` (`step_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_invocations_status` ON `tool_invocations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_run_id` ON `workflow_runs` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow_id` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);