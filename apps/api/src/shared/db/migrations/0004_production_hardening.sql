-- 生产化加固：Run 幂等/检查点 + 能力路由决策审计
ALTER TABLE `runs`
  ADD COLUMN `idempotency_key` varchar(160) NULL AFTER `error`,
  ADD COLUMN `checkpoint_payload` json NULL AFTER `idempotency_key`,
  ADD UNIQUE INDEX `uq_runs_idempotency_user` (`idempotency_key`, `user_id`);

CREATE TABLE IF NOT EXISTS `capability_route_decisions` (
  `id` varchar(36) NOT NULL,
  `run_id` varchar(36) NULL,
  `session_id` varchar(36) NULL,
  `user_id` varchar(36) NULL,
  `input_hash` varchar(64) NOT NULL,
  `requested_agent_id` varchar(100) NULL,
  `resolved_agent_id` varchar(100) NULL,
  `route_type` varchar(30) NOT NULL,
  `confidence` decimal(5,4) NOT NULL,
  `reason` text NOT NULL,
  `source` varchar(30) NOT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_capability_route_run_id` (`run_id`),
  KEY `idx_capability_route_session_id` (`session_id`),
  KEY `idx_capability_route_user_id` (`user_id`),
  KEY `idx_capability_route_created_at` (`created_at`)
);
