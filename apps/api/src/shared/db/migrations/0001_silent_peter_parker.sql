CREATE TABLE `agent_tasks` (
	`id` varchar(36) NOT NULL,
	`parent_run_id` varchar(36) NOT NULL,
	`child_run_id` varchar(36) NOT NULL,
	`from_agent_id` varchar(100) NOT NULL,
	`to_agent_id` varchar(100) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'queued',
	`input` json NOT NULL,
	`output` json,
	`error` json,
	`idempotency_key` varchar(100),
	`retry_count` int NOT NULL DEFAULT 0,
	`max_retries` int NOT NULL DEFAULT 3,
	`priority` int NOT NULL DEFAULT 5,
	`created_at` datetime(3) NOT NULL,
	`started_at` datetime(3),
	`completed_at` datetime(3),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `agent_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agent_tasks_idempotency` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` varchar(36) NOT NULL,
	`scope` varchar(20) NOT NULL,
	`scope_id` varchar(36) NOT NULL,
	`kind` varchar(60) NOT NULL,
	`content` json NOT NULL,
	`metadata` json,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(40) NOT NULL DEFAULT 'general',
	`description` text,
	`metadata` json,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_agent_tasks_parent_run_id` ON `agent_tasks` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_tasks_child_run_id` ON `agent_tasks` (`child_run_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_tasks_status` ON `agent_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_memories_scope_id` ON `memories` (`scope`,`scope_id`);--> statement-breakpoint
CREATE INDEX `idx_memories_kind` ON `memories` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_projects_owner_id` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_type` ON `projects` (`type`);