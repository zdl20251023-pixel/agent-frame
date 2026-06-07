# NL to Hand LLM Eval Report

| 字段 | 值 |
|------|-----|
| 运行时间 | 2026-06-07T02:13:43.154Z |
| 模型模式 | fake |
| 总用例 | 32 |
| 通过 | 32 |
| 失败 | 0 |
| 耗时 | 685ms |

## 核心指标

| 指标 | 实际值 | 门禁 (min) | 阻断线 | 状态 |
|------|--------|-----------|--------|------|
| route_accuracy | 100.0% | 90% | 85% | ✅ PASS |
| tool_call_rate | 100.0% | 95% | 90% | ✅ PASS |
| schema_success_rate | 100.0% | 80% | 70% | ✅ PASS |
| validation_success_rate | 100.0% | 80% | 70% | ✅ PASS |
| artifact_success_rate | 100.0% | 95% | 90% | ✅ PASS |
| patch_preservation_rate | 100.0% | 75% | 65% | ✅ PASS |

## 全部用例摘要

| Suite | ID | 结果 | 耗时 |
|-------|-----|------|------|
| routing | route_poker_high_conf_001 | PASS | 1ms |
| routing | route_poker_high_conf_002 | PASS | 0ms |
| routing | route_poker_high_conf_003 | PASS | 0ms |
| routing | route_general_chat_001 | PASS | 0ms |
| routing | route_general_chat_002 | PASS | 0ms |
| routing | route_general_chat_003 | PASS | 0ms |
| routing | route_clarification_001 | PASS | 0ms |
| routing | route_clarification_002 | PASS | 0ms |
| routing | route_explicit_nl_agent | PASS | 0ms |
| routing | route_explicit_research_agent | PASS | 0ms |
| routing | route_poker_keywords_001 | PASS | 1ms |
| routing | route_poker_preflop_001 | PASS | 0ms |
| golden | golden_preflop_open_fold_6max_001 | PASS | 46ms |
| golden | golden_preflop_open_fold_kk_co_002 | PASS | 36ms |
| golden | golden_flop_cbet_fold_003 | PASS | 31ms |
| golden | golden_heads_up_004 | PASS | 30ms |
| golden | golden_3bet_pot_005 | PASS | 33ms |
| golden | golden_route_and_tool_006 | PASS | 32ms |
| golden | golden_validation_fail_007 | PASS | 31ms |
| golden | golden_schema_fail_008 | PASS | 37ms |
| golden | golden_no_tool_general_009 | PASS | 31ms |
| golden | golden_ante_game_010 | PASS | 31ms |
| golden | golden_explicit_agent_bypass_011 | PASS | 31ms |
| golden | golden_hero_position_utg_012 | PASS | 42ms |
| golden | golden_big_blind_two_013 | PASS | 31ms |
| golden | golden_poker_jargon_014 | PASS | 31ms |
| golden | golden_generate_hand_history_015 | PASS | 40ms |
| patch | patch_change_hero_cards_khkd_001 | PASS | 34ms |
| patch | patch_change_open_size_002 | PASS | 31ms |
| patch | patch_preserve_blinds_003 | PASS | 31ms |
| patch | patch_preserve_player_count_004 | PASS | 31ms |
| patch | patch_add_flop_board_005 | PASS | 41ms |