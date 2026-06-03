CREATE TABLE `artifact_versions` (
	`id` varchar(36) NOT NULL,
	`artifact_id` varchar(36) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`content` text NOT NULL,
	`created_by_run_id` varchar(36) NOT NULL,
	`created_by_step_id` varchar(36),
	`created_by_agent_id` varchar(100),
	`parent_version_id` varchar(36),
	`review_status` varchar(20),
	`diff_summary` text,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `artifact_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_artifact_version` UNIQUE(`artifact_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`project_id` varchar(36),
	`workflow_run_id` varchar(36),
	`workflow_stage_id` varchar(100),
	`type` varchar(60) NOT NULL,
	`title` varchar(255),
	`current_version_id` varchar(36),
	`metadata` json,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`title` varchar(255),
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `chat_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_call_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`trace_id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`step_id` varchar(36),
	`agent_id` varchar(100),
	`model_alias` varchar(60) NOT NULL,
	`provider` varchar(40) NOT NULL,
	`actual_model` varchar(100) NOT NULL,
	`input_tokens` int,
	`output_tokens` int,
	`total_tokens` int,
	`estimated_cost_usd` decimal(10,6),
	`latency_ms` int NOT NULL,
	`finish_reason` varchar(30),
	`error_code` varchar(60),
	`retry_count` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `model_call_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `run_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`event_type` varchar(60) NOT NULL,
	`event_data` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `run_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` varchar(36) NOT NULL,
	`trace_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`project_id` varchar(36),
	`agent_id` varchar(100),
	`session_id` varchar(36),
	`status` varchar(20) NOT NULL DEFAULT 'queued',
	`input` json NOT NULL,
	`output` json,
	`error` json,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `steps` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`parent_step_id` varchar(36),
	`type` varchar(30) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`agent_id` varchar(100),
	`from_agent_id` varchar(100),
	`to_agent_id` varchar(100),
	`input` json,
	`output` json,
	`error` json,
	`started_at` datetime(3) NOT NULL,
	`ended_at` datetime(3),
	CONSTRAINT `steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`username` varchar(80),
	`password_hash` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`),
	CONSTRAINT `uq_users_username` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE INDEX `idx_artifact_id` ON `artifact_versions` (`artifact_id`);--> statement-breakpoint
CREATE INDEX `idx_run_id` ON `artifacts` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_project_id` ON `artifacts` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_user_id` ON `chat_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_updated_at` ON `chat_sessions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_run_id` ON `model_call_logs` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_id` ON `model_call_logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_run_id` ON `run_events` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_event_type` ON `run_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_id` ON `runs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_session_id` ON `runs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_run_id` ON `steps` (`run_id`);