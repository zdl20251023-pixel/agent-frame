# NL to Hand LLM Eval Report

| 字段 | 值 |
|------|-----|
| 运行时间 | 2026-06-07T01:49:03.153Z |
| 模型模式 | fake |
| 总用例 | 32 |
| 通过 | 27 |
| 失败 | 5 |
| 耗时 | 732ms |

## 核心指标

| 指标 | 实际值 | 门禁 (min) | 阻断线 | 状态 |
|------|--------|-----------|--------|------|
| route_accuracy | 83.3% | 90% | 85% | ❌ FAIL |
| tool_call_rate | 100.0% | 95% | 90% | ✅ PASS |
| schema_success_rate | 100.0% | 80% | 70% | ✅ PASS |
| validation_success_rate | 84.2% | 80% | 70% | ✅ PASS |
| artifact_success_rate | 100.0% | 95% | 90% | ✅ PASS |
| patch_preservation_rate | 80.0% | 75% | 65% | ✅ PASS |

## 门禁违规

- route_accuracy: 83.3% < 85% (block)

## 失败用例

### routing/route_clarification_001

- 耗时: 0ms
- 错误:
  - expected routeType=ask_clarification, got agent
  - confidence 0.78 > max 0.72
- 未通过检查:
  - routeType
  - maxConfidence

### routing/route_clarification_002

- 耗时: 0ms
- 错误:
  - expected routeType=ask_clarification, got agent
  - confidence 0.78 > max 0.72
- 未通过检查:
  - routeType
  - maxConfidence

### golden/golden_heads_up_004

- 耗时: 30ms
- 错误:
  - mustBeValid=true, isValid=false
- 未通过检查:
  - validationSuccess

### patch/patch_change_hero_cards_khkd_001

- 耗时: 32ms
- 错误:
  - field not preserved: actions[2].action (base="fold", out="raise")
  - mustBeValid=true
- 未通过检查:
  - patchPreservation
  - validationSuccess

### patch/patch_preserve_player_count_004

- 耗时: 44ms
- 错误:
  - mustBeValid=true
- 未通过检查:
  - validationSuccess


## 全部用例摘要

| Suite | ID | 结果 | 耗时 |
|-------|-----|------|------|
| routing | route_poker_high_conf_001 | PASS | 0ms |
| routing | route_poker_high_conf_002 | PASS | 0ms |
| routing | route_poker_high_conf_003 | PASS | 0ms |
| routing | route_general_chat_001 | PASS | 0ms |
| routing | route_general_chat_002 | PASS | 0ms |
| routing | route_general_chat_003 | PASS | 0ms |
| routing | route_clarification_001 | FAIL | 0ms |
| routing | route_clarification_002 | FAIL | 0ms |
| routing | route_explicit_nl_agent | PASS | 0ms |
| routing | route_explicit_research_agent | PASS | 0ms |
| routing | route_poker_keywords_001 | PASS | 0ms |
| routing | route_poker_preflop_001 | PASS | 0ms |
| golden | golden_preflop_open_fold_6max_001 | PASS | 46ms |
| golden | golden_preflop_open_fold_kk_co_002 | PASS | 32ms |
| golden | golden_flop_cbet_fold_003 | PASS | 56ms |
| golden | golden_heads_up_004 | FAIL | 30ms |
| golden | golden_3bet_pot_005 | PASS | 32ms |
| golden | golden_route_and_tool_006 | PASS | 31ms |
| golden | golden_validation_fail_007 | PASS | 37ms |
| golden | golden_schema_fail_008 | PASS | 30ms |
| golden | golden_no_tool_general_009 | PASS | 33ms |
| golden | golden_ante_game_010 | PASS | 34ms |
| golden | golden_explicit_agent_bypass_011 | PASS | 34ms |
| golden | golden_hero_position_utg_012 | PASS | 35ms |
| golden | golden_big_blind_two_013 | PASS | 43ms |
| golden | golden_poker_jargon_014 | PASS | 38ms |
| golden | golden_generate_hand_history_015 | PASS | 35ms |
| patch | patch_change_hero_cards_khkd_001 | FAIL | 32ms |
| patch | patch_change_open_size_002 | PASS | 34ms |
| patch | patch_preserve_blinds_003 | PASS | 36ms |
| patch | patch_preserve_player_count_004 | FAIL | 44ms |
| patch | patch_add_flop_board_005 | PASS | 39ms |