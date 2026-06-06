import { generateText, Output, tool } from 'ai'
import type { LanguageModel, UIMessage } from 'ai'
import { z } from 'zod'
const POSITION_MAPPING: Record<number, string[]> = {
  2: ['BTN', 'SB', 'BB', 'SB/BTN'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO'],
  10: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'UTG3', 'LJ', 'HJ', 'CO'],
}
import {
  HandValidationErrorCode,
  type HandValidationResult,
  simulateHand,
} from '../hand_validator/simulator/hand_simulator.js'
import { logAutoFixSummary, runPostParseAutoFix, runPreParseAutoFix } from './autofix_pipeline'
import { qwen8bModel } from './models'
import type { PromptProvider } from './prompt-provider'

// ─── 内层修复回路常量 ────────────────────────────────────────────────────────
/** 内层最多修复轮次（前2轮重生成，后2轮最小变更） */
const MAX_INTERNAL_ROUNDS = 1 // 内部最多1轮修复，超过1轮，大概率会出现超时问题，造成卡死现象
/** 连续无进展触发提前熔断的轮次阈值 */
const MAX_NO_PROGRESS = 2

/** 错误严重度映射（越大越接近成功） */
const ERROR_SEVERITY: Record<string, number> = {
  MACHINE_EXCEPTION: -1,
  TABLE_BUILD_FAILED: 0,
  SEMANTIC_INVALID: 1,
  EVENT_TRANSLATE_FAILED: 2,
  MACHINE_REJECTED: 3,
  STREET_INVALID: 4,
  SETTLEMENT_MISMATCH: 5,
  CHIPS_CONSERVATION: 5,
}

// ─── 内层修复回路：提示词策略 ─────────────────────────────────────────────────
const REPLAN_HINT =
  '[本轮策略=重生成] 本轮允许根据用户描述完整重新推演整手牌。\n' +
  '重新推演时以"用户最近消息"为唯一语义锚点，严格按照行动顺序规则从 UTG 开始逐位推演。\n' +
  '不要被上一轮的候选结构绑定。'

const PATCH_HINT =
  '[本轮策略=最小变更] 本轮只修改 [修复建议] 中 fix_path 指向的字段。\n' +
  '其余所有字段保持与"当前最优候选"完全一致，禁止在修复时改动其他字段。\n' +
  '改动范围越小越好。'

/**
 * 单个行动记录 (符合 5-最新牌谱.md)
 */
const HandActionSchema = z
  .object({
    action: z
      .string()
      .describe(
        '动作类型或发牌字符串。' +
          '① 若是玩家动作，必须属于 raise / call / fold / check / bet / allin 之一。注意：postflop 场上已有人下注时，用 raise 而非 bet。' +
          '② 若是发公共牌（此时必须 seat_no=-1且 amount=0），则 action 字段直接填入紧凑牌面字符串！绝对不要填 "-1" 或 "board"！' +
          '  - 翻牌示例: "4cAcQc"' +
          '  - 转牌示例: "5d"' +
          '  - 河牌示例: "6d"'
      ),
    seat_no: z
      .number()
      .int()
      .min(-1)
      .max(8)
      .describe('执行动作的玩家座位号。公共牌发牌时必须为 -1。'),
    amount: z
      .number()
      .int()
      .min(0)
      .describe(
        '动作金额（整数）。' +
          'raise/bet 时为加注/下注到的总额（不是增量，是累计投入总量）；' +
          'call 时为需要补齐的差额（= maxBet - 自己已投入）；' +
          'check/fold 时为 0；' +
          'allin 时为 0（引擎自动计算）。' +
          '示例：big_blind=2，UTG open 默认 amount=6（3BB）；' +
          '对方 raise 到 6 后 3-bet 默认 amount=18（3×6）；' +
          'call 对方 raise 6（自己已 post SB=1）时 amount=5。'
      ),
  })
  .strict()

/**
 * 玩家信息 (符合 5-最新牌谱.md)
 */
const POSITION_TAG_SET = new Set(Object.values(POSITION_MAPPING).flat())

const HandPlayerSchema = z
  .object({
    id: z
      .number()
      .int()
      .min(1)
      .describe(
        '玩家唯一ID，从1开始递增，按seat_no从小到大分配：seat_no=0→id=1, seat_no=1→id=2，依此类推。'
      ),
    seat_no: z
      .number()
      .int()
      .min(0)
      .max(8)
      .describe('座位号，范围 [0, 人数-1]。players 数组必须按 seat_no 从小到大排序。'),
    stack: z
      .number()
      .int()
      .min(0)
      .describe('起始筹码（整数）。未指定时默认=big_blind×100。例如 big_blind=2 时默认 200。'),
    name: z
      .string()
      .describe(
        '展示用名称。规则：持有已知手牌(hole_card_list非空)的玩家固定为 HERO；' +
          '其余固定为 opp_{seat_no}（如 seat_no=4 则 name=opp_4）。' +
          '禁止用 BTN/SB/BB/UTG/HJ/CO 等位置词作为 name。'
      ),
    position_tag: z
      .string()
      .refine((v) => POSITION_TAG_SET.has(v), {
        message: `position_tag 非法，必须属于 POSITION_MAPPING 定义集合: ${[...POSITION_TAG_SET].join('/')}`,
      })
      .describe(
        '位置标签（强约束）。必须根据 dealer_seat 和人数，按 POSITION_MAPPING 顺时针推导得出。' +
          '例：6人桌 dealer_seat=0 时，seat_no 依次为 0→BTN, 1→SB, 2→BB, 3→UTG, 4→HJ, 5→CO。' +
          '2人桌时只有 SB/BTN（庄家兼小盲）和 BB 两个标签。'
      ),
    hole_card_list: z
      .string()
      .describe(
        '字段名必须严格为 "hole_card_list"（唯一合法键名）。' +
          '禁止使用 hole_call_list 等任意近似拼写；键名拼写错误会触发 SCHEMA_INVALID。' +
          '字段值为两张手牌紧凑写法（如 AhKd），未知手牌填空字符串 ""。' +
          '每张牌格式=Rank+Suit，Rank∈{2-9,T,J,Q,K,A}，Suit∈{h,d,c,s}。'
      ),
  })
  .strict()

/**
 * 结算玩家信息 (符合 5-最新牌谱.md)
 */
const HandResultPlayerSchema = z
  .object({
    seat_no: z.number().int().min(0).max(8).describe('座位号'),
    stack: z
      .number()
      .int()
      .min(0)
      .describe(
        '结算后筹码。' +
          '【推荐】填 0 表示委托引擎自动计算，工具会在返回中给出正确值，完全无需手动计算，可消除 SETTLEMENT_MISMATCH 错误。' +
          '【可选】自行填写非零值，引擎会与模拟结果比对，不符时触发 SETTLEMENT_MISMATCH。' +
          '牌局未结束时（动作序列未到结算阶段）：stack 一律填 0。'
      ),
    hole_card_list: z
      .string()
      .describe(
        '字段名必须严格为 "hole_card_list"（唯一合法键名）。' +
          '禁止使用 hole_call_list 等任意近似拼写；键名拼写错误会触发 SCHEMA_INVALID。' +
          '亮牌显示手牌使用紧凑写法（如 AhKd），未亮牌可为空字符串 ""。' +
          '每张牌格式=Rank+Suit，Rank∈{2-9,T,J,Q,K,A}，Suit∈{h,d,c,s}。'
      ),
  })
  .strict()

/**
 * 牌谱对象（Latest Hand 结构）
 */
export const LatestHandSchema = z
  .object({
    gameuuid: z.string().describe('唯一牌局标识，如果没有则随机生成一个'),
    players: z
      .array(HandPlayerSchema)
      .min(2)
      .max(9)
      .describe('参与玩家列表。必须按 seat_no 从小到大排序。未指定人数时默认 6 个人'),
    big_blind: z.number().int().min(1).default(2).describe('大盲注金额，默认2'),
    ante: z.number().int().min(0).default(0).describe('前注金额，默认0'),
    dealer_seat: z.number().int().min(0).max(8).default(0).describe('庄家（BTN）位座位号，默认0'),
    sb_seat: z
      .number()
      .int()
      .min(0)
      .max(8)
      .default(1)
      .describe('小盲（SB）位座位号，必须是 BTN 顺时针下一位'),
    bb_seat: z
      .number()
      .int()
      .min(0)
      .max(8)
      .default(2)
      .describe('大盲（BB）位座位号，必须是 SB 顺时针下一位'),
    roomid: z.string().describe('房间/桌子 ID，如果没有则随机生成一个'),
    straddle_seat: z
      .number()
      .int()
      .min(-1)
      .max(8)
      .default(-1)
      .describe('Straddle 座位号，无则填 -1。注意：少于4人桌不允许开启 Straddle。'),
    actions: z.array(HandActionSchema).describe('行动流水记录，必须按顺序执行'),
    result: z
      .object({
        players: z
          .array(HandResultPlayerSchema)
          .min(2)
          .describe(
            '结算时的玩家状态列表，按座位号从小到大排列。' +
              '推荐所有 stack 填 0，让引擎自动计算，避免 SETTLEMENT_MISMATCH。'
          ),
      })
      .strict()
      .describe(
        '结算结果。推荐 result.players[*].stack 全部填 0，引擎自动计算并在返回中给出正确值。'
      ),
  })
  .strict()
  .describe('牌谱对象（Latest Hand 结构）')

/** 牌谱类型（供模拟器子模块直接引用） */
export type LatestHandType = z.infer<typeof LatestHandSchema>

// ─── 共享描述常量（外层 tool.description 与内层 buildInnerPrompt 共用同一来源）────
/**
 * nl_to_hand 工具 description 主体文本
 * 内外层共用，任何修改只需在此处改一次，不会漂移
 */
export const NL_TO_HAND_DESCRIPTION = `【工具用途】
    将用户的自然语言扑克牌局描述转换为结构化牌谱 JSON，并进行四层合法性校验。
    若校验不通过，返回详细的多行诊断报告，按 [修复建议] 中的 fix_path 和 fix 精准修改后重新调用。
    
    【强制执行步骤 —— 每步必须在 _reasoning 中写出中间结果】
    
    Step 1 · 确定基础参数
      - 人数（默认6）、big_blind（默认2）、ante（默认0）、straddle（默认无，<4人不可开）
      - 输出：playerCount=N, BB=X, ante=Y
    
    Step 2 · 分配座位与位置
      - dealer_seat（默认0）→ 按人数顺时针映射 POSITION_MAPPING
      - 输出座位映射表：seat_no → position_tag
      - dealer_seat=0 时各人数的标签映射规定（如果 dealer_seat 不是 0，则整体按顺时针循环移位）：
        2人桌：0→SB/BTN, 1→BB
        3人桌：0→BTN, 1→SB, 2→BB
        4人桌：0→BTN, 1→SB, 2→BB, 3→UTG
        5人桌：0→BTN, 1→SB, 2→BB, 3→UTG, 4→CO
        6人桌：0→BTN, 1→SB, 2→BB, 3→UTG, 4→HJ, 5→CO
        7人桌：0→BTN, 1→SB, 2→BB, 3→UTG, 4→LJ, 5→HJ, 6→CO
        8人桌：0→BTN, 1→SB, 2→BB, 3→UTG, 4→UTG1, 5→LJ, 6→HJ, 7→CO
        9人桌：0→BTN, 1→SB, 2→BB, 3→UTG, 4→UTG1, 5→UTG2, 6→LJ, 7→HJ, 8→CO
        10人桌：0→BTN, 1→SB, 2→BB, 3→UTG, 4→UTG1, 5→UTG2, 6→UTG3, 7→LJ, 8→HJ, 9→CO
    
    Step 3 · 填充玩家列表
      - 确定 HERO 座位（hole_card_list 非空的玩家）
      - 其余玩家 name=opp_{seat_no}，hole_card_list=""
      - id 从1开始按 seat_no 顺序递增（seat_no=0→id=1，seat_no=1→id=2，...）
      - 按 seat_no 从小到大排序
      - stack 未指定时默认 big_blind×100
    
    Step 4 · 推演行动序列
      - preflop：首个行动者为 UTG（bb_seat 顺时针下一个）
      - postflop：首个行动者为 BTN 顺时针下一个（通常为 SB 位）
      - 每步必须写出：当前应行动座位 → 该座位动作
      - 遇到"其他人弃牌"时，逐个补全中间玩家的 fold（禁止跳位）
      - 每一轮（下注轮）闭合后才能发公共牌（seat_no=-1）
      - call 的 amount = currentMaxBet - 自己已投入；raise/bet 的 amount = 加注到的总额
    
    Step 5 · 计算结算
      - 推荐：所有 result.players[*].stack 填 0，引擎自动计算并在返回中给出正确值
      - 若手动填写：赢家 stack = 初始筹码 - 投入总额 + 赢取金额
    
    【强制降级与脑补规范：绝对不要因信息缺失而拒绝调用！】
    如果用户意图生成牌谱，但描述极度模糊或不完整（如不知道盲注大小、不知道谁加注、跳过中间玩家等），绝对禁止以"信息不足"为由拒绝调用工具或反问用户！
    你必须立即调用工具，并遵循以下标准脑补所有缺失信息，然后在回复中告知用户你做了哪些假设：
    - 未说明盲注大小：默认 BB=2，ante=0。
    - 未说明部分对手身份或具体是谁：自动挑选最符合逻辑的未知位置填入（如默认假想敌为 BTN 或某个 limper）。
    - 未指明部分花色：随机安排不冲突的合法花色。
    - 未说明具体金额：
      ① preflop open-raise 默认 amount = BB × 3
      ② 3-bet（面对别人 raise 后再加注）默认 amount = 对方 raise 额 × 3
      ③ call 默认 amount = 当前最高下注 - 自己已投入
      ④ bet（postflop 没人下注时）默认 amount = 当前 pot 的 50%
    - 未说明某些动作顺序或跳过了中间玩家：自动强行用合理的 fold 或 call 动作填补空白玩家的轮次。
    【常见致命错误警告（必须避免！）】
    1. 字段拼写错误：手牌字段必须且只能是 "hole_card_list"，绝不允许写成 "hole_call_list"！
    2. result.players[*].hole_card_list 也必须严格使用 "hole_card_list" 键名，绝不允许 result.players[*]."hole_call_list"。
    3. 输出前先执行字段白名单检查：
       - players[*] 只允许键：id / seat_no / stack / name / position_tag / hole_card_list。示例：players[*].hole_call_list 非法，players[*].hole_card_list 合法。
       - result.players[*] 只允许键：seat_no / stack / hole_card_list。示例：result.players[*].hole_call_list 非法，result.players[*].hole_card_list 合法。
    4. 反例（禁止）→ 正例（允许）：
       - {"hole_call_list":"AhKd"} ❌
       - {"hole_card_list":"AhKd"} ✅
    5. 缺少必要动作：postflop 阶段必须遵循 action 必须对应当前轮的原则，不要跳过或遗漏玩家行动！
    6. 人工计算错误：不要自己去加减乘除算结果筹码，全部 result.players.stack 请放心填 0 委托给引擎！
    7. 牌面绝对不能重复：一副标准扑克牌中每张牌（如 Ks）只有一张！在写公共牌 (action 字符串) 时，必须仔细检查该牌是否已经存在于任何玩家的 "hole_card_list" 中，反之亦然。发牌前请务必在 _reasoning 中自我查重！
    
    【格式示例 —— 6人局完整示例（格式照此，数值按用户描述调整）】
    {
      "gameuuid":"uuid-001","roomid":"room-001","big_blind":2,"ante":0,
      "dealer_seat":0,"sb_seat":1,"bb_seat":2,"straddle_seat":-1,
      "players":[
        {"id":1,"seat_no":0,"stack":200,"name":"opp_0","position_tag":"BTN","hole_card_list":""},
        {"id":2,"seat_no":1,"stack":200,"name":"opp_1","position_tag":"SB","hole_card_list":""},
        {"id":3,"seat_no":2,"stack":200,"name":"opp_2","position_tag":"BB","hole_card_list":""},
        {"id":4,"seat_no":3,"stack":200,"name":"HERO","position_tag":"UTG","hole_card_list":"AhAs"},
        {"id":5,"seat_no":4,"stack":200,"name":"opp_4","position_tag":"HJ","hole_card_list":""},
        {"id":6,"seat_no":5,"stack":200,"name":"opp_5","position_tag":"CO","hole_card_list":""}
      ],
      "actions":[
        {"action":"raise","seat_no":3,"amount":6},
        {"action":"fold","seat_no":4,"amount":0},
        {"action":"fold","seat_no":5,"amount":0},
        {"action":"fold","seat_no":0,"amount":0},
        {"action":"fold","seat_no":1,"amount":0},
        {"action":"fold","seat_no":2,"amount":0}
      ],
      "result":{"players":[
        {"seat_no":0,"stack":0,"hole_card_list":""},
        {"seat_no":1,"stack":0,"hole_card_list":""},
        {"seat_no":2,"stack":0,"hole_card_list":""},
        {"seat_no":3,"stack":0,"hole_card_list":"AhAs"},
        {"seat_no":4,"stack":0,"hole_card_list":""},
        {"seat_no":5,"stack":0,"hole_card_list":""}
      ]}
    }
    
    【修复规则（收到"不合法"后必须遵守）】
    1. 仅修改 [修复建议] 中 fix_path 指定的字段。
    2. 其余字段保持原值完全不变，禁止在修复时改动其他字段。
    3. 按 fix 建议修改后，用完整 game_hand JSON 重新调用本工具，直到返回"合法"。
    
    【返回格式】
    合法时：一行字符串"合法"，并附带 [引擎结算结果] JSON（若引擎自动计算了结算值）。
    不合法时：多行诊断报告，包含 [错误码][出错位置][错误原因][桌面快照][修复建议]。
    `

/** _reasoning 字段 describe 文本（外层 inputSchema 与内层 prompt 共用同一来源） */
export const NL_TO_HAND_REASONING_DESCRIBE =
  '【强制推理步骤 —— 生成前必须在此写出以下内容】\n' +
  '(1) 用户意图解析：牌局描述中涉及到的人数、位置、行动信息；\n' +
  '(2) 座位-位置映射表：dealer_seat=N 时，每个座位对应的 position_tag；\n' +
  '(3) preflop 行动顺序推演：从 UTG 开始逐位列出（含中间 fold）；\n' +
  '(4) 投入与结算：描述各玩家投入（或说明使用 stack=0 委托引擎计算）；\n' +
  '(5) 字段白名单自检（必须按 YES/NO 输出）：\n' +
  '    5.1 players[*] 是否只包含 id/seat_no/stack/name/position_tag/hole_card_list？\n' +
  '    5.2 result.players[*] 是否只包含 seat_no/stack/hole_card_list？\n' +
  '    5.3 是否出现 hole_call_list/hole_cards/hand_cards/holecard（任一出现都必须改为 hole_card_list）？\n' +
  '    5.4 actions[*] 的每一项是否都同时包含 action/seat_no/amount 三个字段（禁止省略 action）？\n' +
  '(6) 全局查重：是否有重复牌面（如公共牌发出Ks，手牌也有Ks）？'

/**
 * nl_to_hand 工具的外层输入 Schema。
 *
 * 用途：
 * - 作为 AI SDK tool(inputSchema) 的运行时约束。
 * - 作为框架 ToolRegistry / PluginRegistry 共享的工具参数来源。
 *
 * 注意：
 * - game_hand 先允许 unknown，由工具内部的 pre-parse autofix 归一化后再进入 LatestHandSchema 严格校验。
 */
export const NlToHandToolInputSchema = z.object({
  _reasoning: z.string().describe(NL_TO_HAND_REASONING_DESCRIBE).optional(),
  game_hand: z.unknown().describe('待校验的牌谱候选对象。工具会先做确定性 autofix，再执行严格 Schema 校验。'),
})

/**
 * 内层修复专用精简描述（P1 优化）
 *
 * 设计原则：
 *   - 外层 NL_TO_HAND_DESCRIPTION 是"从零生成"场景，包含脑补规范、示例 JSON、Step 1-5 等
 *   - 内层修复已有 bestCandidate 作为结构锚点，只需"关键约束规则"
 *   - 精简后 ~600 token（vs 外层 ~2500 token），降低 75%，减少 API 限流概率
 *
 * 与 NL_TO_HAND_DESCRIPTION 的关系：
 *   - 不是替代，是专为"修复场景"裁剪的子集
 *   - 外层 tool.description 仍用完整的 NL_TO_HAND_DESCRIPTION
 */
const NL_TO_HAND_INNER_DESCRIPTION = `【内层修复约束 —— 仅包含修复必需规则】
    
    【字段白名单（输出前必须检查）】
    - players[*] 合法键：id / seat_no / stack / name / position_tag / hole_card_list
    - result.players[*] 合法键：seat_no / stack / hole_card_list
    - 手牌字段只允许 hole_card_list，禁止 hole_call_list / hole_cards / hand_cards / holecard 等任何变形
    - 牌格式：Rank+Suit，Rank∈{2-9,T,J,Q,K,A}，Suit∈{h,d,c,s}
    
    【位置映射（dealer_seat=0 时；dealer_seat≠0 时整体顺时针循环移位）】
    2人：0→SB/BTN, 1→BB
    3人：0→BTN, 1→SB, 2→BB
    4人：0→BTN, 1→SB, 2→BB, 3→UTG
    5人：0→BTN, 1→SB, 2→BB, 3→UTG, 4→CO
    6人：0→BTN, 1→SB, 2→BB, 3→UTG, 4→HJ, 5→CO
    7人：0→BTN, 1→SB, 2→BB, 3→UTG, 4→LJ, 5→HJ, 6→CO
    8人：0→BTN, 1→SB, 2→BB, 3→UTG, 4→UTG1, 5→LJ, 6→HJ, 7→CO
    9人：0→BTN, 1→SB, 2→BB, 3→UTG, 4→UTG1, 5→UTG2, 6→LJ, 7→HJ, 8→CO
    
    【行动顺序规则（最常出错）】
    - preflop：首个行动者 = bb_seat 顺时针下一位（UTG），SB 倒数第二，BB 最后
    - postflop：首个行动者 = dealer_seat 顺时针下一位（通常为 SB），BB 第二
    - 每街所有未弃牌玩家行动完毕后，才能发下一张公共牌（seat_no=-1, amount=0）
    - 中间有玩家弃牌时，必须逐个插入 fold，禁止跳位
    
    【金额规则】
    - raise/bet：amount = 总投入额（从 0 起算的累计数，不是增量）
    - call：amount = currentMaxBet - 自己已投入（补差额）
    - fold/check：amount = 0
    - allin：amount = 0（引擎自动计算）
    - SB preflop call：amount = big_blind - small_blind（只需补差额）
    
    【禁止字段省略（高优先级硬约束）】
    - actions[*] 每一项必须是完整三元组：{"action":"...","seat_no":N,"amount":M}
    - 严禁省略 action 字段（即使是连续 call/check/fold 也不能省略）
    - 错误示例（禁止）：{"seat_no":3,"amount":2}
    - 正确示例：{"action":"call","seat_no":3,"amount":2}
    - 公共牌发牌同样必须保留 action：{"action":"2d7hTc","seat_no":-1,"amount":0}
    
    【牌面唯一性】
    一副牌每张只有一张。公共牌（action 字段）不能与任何玩家 hole_card_list 中的牌重复，反之亦然。
    
    【result】
    所有 result.players[*].stack 填 0，引擎自动计算。
    `

// ─── 工具选项类型 ────────────────────────────────────────────────────────────
type ToolOptionsType = {
  promptProvider: PromptProvider
  userId?: number
  /** 透传的历史对话消息（供内层修复时对照用户原意） */
  messages?: UIMessage[]
  /** inner_repair 会触发内层 LLM；disabled 用于同步 Run/SSE baseline 快速返回。 */
  innerRepairMode?: 'disabled' | 'inner_repair'
  /** 是否在成功响应中附带最终牌谱 JSON，供异步 Worker 写 ArtifactVersion。 */
  includeFinalHandJson?: boolean
  /** 内层修复模型，默认 geminiFlashLiteModel，可随时替换为支持 json_schema 的其他 LanguageModel */
  innerRepairModel?: LanguageModel
  /** 外层第 1 次模型流启动时间，用于统计“首次生成牌谱到可执行”的耗时 */
  firstModelStreamStartedAt?: number
}

// ─── 内层修复回路状态 ─────────────────────────────────────────────────────────
type HealingState = {
  round: number
  noProgressStreak: number
  /** 每轮失败消息，按轮次顺序追加，作为下轮 prompt 的上下文 */
  errorHistory: string[]
  /** 最接近成功的候选牌谱 */
  bestCandidate: LatestHandType
  /** 最接近成功时的校验结果 */
  bestResult: HandValidationResult
  /** 上一轮校验结果（振荡检测用） */
  prevResult: HandValidationResult | null
}

// ─── 内层修复工具函数 ─────────────────────────────────────────────────────────

/**
 * 单次 nl_to_hand 外层调用轨迹（game_hand 输入 + 引擎返回文本）
 */
type NlToHandTrail = {
  /** 外层调用时传入的 game_hand（完整牌谱 JSON） */
  input: LatestHandType
  /** 外层对应的引擎返回文本（"合法…" 或 "不合法…"） */
  output: string
}

/**
 * 对话回合（一问一答单元）
 *
 * 每个回合由用户消息 + 该轮 assistant 对 nl_to_hand 的调用轨迹构成（可能多次重试）。
 * 相较于"用户消息列表"+"工具轨迹列表"两块独立上下文，回合结构能让内层模型精确
 * 知道"哪条用户描述导致了哪次工具调用"，避免跨主题错配。
 */
type ConversationTurn = {
  /** 用户消息文本 */
  userText: string
  /** 该轮 assistant 对 nl_to_hand 的调用轨迹（含多次重试） */
  trails: NlToHandTrail[]
}

/**
 * 从 UIMessage[] 中重建一问一答回合，返回当前用户文本 + 最近 N 个历史回合
 *
 * 消息结构（validatedMessages 在 execute 调用时的状态）：
 *   [user_1, assistant_1, user_2, assistant_2, ..., user_N]
 *   user_N 是当前轮用户消息，execute 正在运行，尚无 assistant 响应。
 *   因此 user_N → currentUserText，历史回合来自 user_1..user_{N-1} 及对应 assistant 消息。
 *
 * 只保留含 nl_to_hand 轨迹的历史回合（纯文字对话回合对修复无帮助）。
 *
 * @param messages 完整历史消息（来自 service.ts 透传的 validatedMessages）
 * @param historicalN 最多返回多少个历史回合（不含当前轮）
 */
function getContextFromMessages(
  messages: UIMessage[],
  historicalN: number
): { currentUserText: string; historicalTurns: ConversationTurn[] } {
  const allTurns: ConversationTurn[] = []
  let currentTurn: ConversationTurn | null = null

  for (const msg of messages) {
    if (msg.role === 'user') {
      // 将上一个已完成的回合推入列表
      if (currentTurn) {
        allTurns.push(currentTurn)
      }
      // 开启新回合，提取用户文本
      const text = Array.isArray(msg.parts)
        ? msg.parts
            .filter((p) => p.type === 'text')
            .map((p) => (p as { type: 'text'; text: string }).text)
            .join('\n')
            .trim()
        : ''
      currentTurn = { userText: text, trails: [] }
    } else if (msg.role === 'assistant' && currentTurn) {
      // 提取该 assistant 消息里所有已完成的 nl_to_hand 轨迹，归入当前回合
      if (!Array.isArray(msg.parts)) {
        continue
      }
      for (const rawPart of msg.parts) {
        // AI SDK v6: tool 部分的 type 格式为 'tool-{toolName}'
        if (rawPart.type !== 'tool-nl_to_hand') {
          continue
        }
        const part = rawPart as {
          type: string
          state: string
          input?: { game_hand?: LatestHandType; _reasoning?: string }
          output?: unknown
          errorText?: string
        }
        // 只取已完成执行的轨迹（output-available 或 output-error）
        if (part.state !== 'output-available' && part.state !== 'output-error') {
          continue
        }
        const gameHand = part.input?.game_hand
        if (!gameHand) {
          continue
        }
        // nl_to_hand 的 execute 始终返回字符串，使用 typeof 安全转换，避免 [object Object]
        const rawOutput = part.output
        const outputText =
          part.state === 'output-available'
            ? typeof rawOutput === 'string'
              ? rawOutput
              : JSON.stringify(rawOutput ?? '')
            : `[工具执行错误] ${String(part.errorText ?? '')}`
        currentTurn.trails.push({ input: gameHand, output: outputText })
      }
    }
  }

  // allTurns 不含最后一个 user 消息对应的回合（currentTurn）：
  //   - 正常情况：currentTurn.trails 为空（execute 正在运行），userText 即当前用户描述
  //   - 异常情况：messages 为空则 currentTurn 为 null
  const currentUserText = currentTurn?.userText ?? ''

  // 历史回合：只保留含 nl_to_hand 轨迹的（纯对话回合对修复无价值），取最近 N 个
  const historicalTurns = allTurns
    .filter((t) => t.trails.length > 0 && t.userText.trim())
    .slice(-historicalN)

  return { currentUserText, historicalTurns }
}

/**
 * 构建内层每轮的 prompt（8 块拼接）
 * 复用外层同一份 NL_TO_HAND_INNER_DESCRIPTION + _reasoning 约束，只追加增量信息
 *
 * 上下文以"一问一答回合"组织（而非两块独立列表），确保用户描述与工具轨迹严格配对，
 * 避免内层模型将 A 轮用户意图与 B 轮工具尝试错配。
 *
 * @param currentUserText 当前轮用户描述（本次 tool execute 的语义锚点）
 * @param historicalTurns 历史对话回合，每回合含用户描述 + nl_to_hand 轨迹（成对绑定）
 * @param bestCandidate 当前最佳候选
 * @param errorHistory 历史报错列表
 * @param round 当前轮次（决定重生成 or 最小变更策略）
 */
function buildInnerPrompt(
  currentUserText: string,
  historicalTurns: ConversationTurn[],
  bestCandidate: LatestHandType,
  errorHistory: string[],
  round: number
): string {
  const strategyHint = round <= 2 ? REPLAN_HINT : PATCH_HINT

  // 历史回合格式化：每回合"用户描述 + 工具调用轨迹"严格配对，杜绝跨主题错配
  const historicalText =
    historicalTurns.length > 0
      ? historicalTurns
          .map((turn, i) => {
            const trailsText = turn.trails
              .map(
                (t, j) =>
                  // 去掉缩进（紧凑 JSON）并过滤 _reasoning 字段（上一轮内层推演，对下一轮无增量价值）
                  `  [第${j + 1}次工具调用输入]\n${JSON.stringify({ ...t.input, _reasoning: undefined })}\n` +
                  `  [对应引擎返回]\n${t.output}`
              )
              .join('\n  ---\n')
            return `[历史第${i + 1}轮]\n用户描述：${turn.userText}\n${trailsText}`
          })
          .join('\n===\n')
      : '（无历史回合记录）'

  return [
    // [1] 内层专用精简描述（P1 优化：去除"从零生成"专用内容，只保留修复必需约束）
    // 外层用完整 NL_TO_HAND_DESCRIPTION（~2500 token），内层用精简版（~600 token）
    // 两者在字段规则、位置映射、行动顺序、金额规则上完全一致，无漂移风险
    NL_TO_HAND_INNER_DESCRIPTION,
    '',
    // [2] 当前轮用户描述（语义锚点，防止漂移用户原意）
    '---当前用户描述---',
    currentUserText || '（无用户消息）',
    '',
    // [2b] 历史对话回合（用户描述与工具轨迹严格配对，避免跨主题错配）
    // 每回合包含：触发本轮的用户描述 + 该轮 nl_to_hand 调用输入/输出
    '---历史对话轮次（用户描述与工具调用轨迹严格配对）---',
    historicalText,
    '',
    // [3] 当前最佳候选（本次 baseline 产生的或内层各轮最优的）
    // 紧凑 JSON（去缩进）并过滤 _reasoning 字段，节省约 25–50% token，避免将上一轮推演误导下一轮
    '---当前最优候选---',
    JSON.stringify({ ...bestCandidate, _reasoning: undefined }),
    '',
    // [4] 历史报错（按轮次顺序，帮助模型了解已尝试过什么）
    '---引擎历史报错---',
    errorHistory.join('\n---\n'),
    '',
    // [5] 本轮修复策略（前2轮重生成，后2轮最小变更）
    '---本轮修复策略---',
    strategyHint,
    '',
    // [6] 强制推演要求（复用 _reasoning 约束，不跳过推演直接补洞）
    '---修复前必须在内部完成以下推理---',
    NL_TO_HAND_REASONING_DESCRIBE,
    '',
    // [7] 输出约束
    '---输出约束---',
    'actions[*] 每一项必须同时包含 action/seat_no/amount 三个字段；严禁省略 action。',
    'result.players[*].stack 全部填 0，引擎自动计算。',
    '直接输出修复后的完整 JSON 对象，不要任何解释文字。',
  ].join('\n')
}

/**
 * curr 是否比 best 更接近成功
 * 判定依据：错误严重度优先，相同时取 step 更大的（更多行动通过了校验）
 */
function isBetter(curr: HandValidationResult, best: HandValidationResult): boolean {
  const cs = ERROR_SEVERITY[curr.code] ?? -1
  const bs = ERROR_SEVERITY[best.code] ?? -1
  if (cs !== bs) {
    return cs > bs
  }
  return (curr.step ?? 0) > (best.step ?? 0)
}

/**
 * 连续两轮错误码与出错位置完全相同 → 判定为振荡
 */
function isStagnant(prev: HandValidationResult, curr: HandValidationResult): boolean {
  return prev.code === curr.code && (prev.step ?? -1) === (curr.step ?? -1)
}

/**
 * 判断是否为 API 基础设施级别的过载/限流错误（P0 优化）
 *
 * 这类错误是外部原因（API 高峰、配额限制、网络超时），不代表修复"无进展"。
 * 不应计入 noProgressStreak，避免因 API 抖动触发提前熔断。
 *
 * 区分原则：
 *   - API 过载/限流 → 跳过本轮，不计 noProgressStreak，继续下一轮
 *   - schema 不匹配/模型内容违规 → 真正无进展，计入 noProgressStreak
 *
 * 关键词来源：Gemini / OpenAI / DeepSeek 常见过载错误信息
 */
function isApiOverloadError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase()
  const overloadKeywords = [
    'high demand',
    'rate limit',
    'ratelimit',
    'quota',
    'timeout',
    'resource_exhausted',
    'overloaded',
    'capacity',
    'service unavailable',
    'try again later',
    '429',
    '503',
  ]
  return overloadKeywords.some((k) => lower.includes(k))
}

/**
 * 根据错误码生成通俗问题描述与针对性用户问询语
 * 对应设计文档中的错误码 → 通俗描述映射表
 */
function buildStuckSummary(code: HandValidationErrorCode): {
  description: string
  askUser: string
} {
  const map: Partial<Record<HandValidationErrorCode, { description: string; askUser: string }>> = {
    [HandValidationErrorCode.MACHINE_REJECTED]: {
      description: '某个玩家的行动不合规则（顺序错误或金额不合法）',
      askUser: '请确认行动顺序是否正确？加注金额具体是多少？',
    },
    [HandValidationErrorCode.STREET_INVALID]: {
      description: '公共牌发牌时机不对，或某个街道的行动未正常闭合',
      askUser: '翻牌/转牌/河牌分别在什么时候发出？有没有遗漏中间玩家的行动？',
    },
    [HandValidationErrorCode.SEMANTIC_INVALID]: {
      description: '牌面有重复，或座位/盲注配置存在冲突',
      askUser: 'Hero 的手牌是哪两张？公共牌里有没有和手牌重复的牌？',
    },
    [HandValidationErrorCode.TABLE_BUILD_FAILED]: {
      description: '桌子参数（座位/盲注/庄家位）配置有误',
      askUser: '几个人打？盲注是多少？庄家在哪个位置？',
    },
    [HandValidationErrorCode.EVENT_TRANSLATE_FAILED]: {
      description: '某个动作类型无法识别',
      askUser: '行动描述里有没有用到非标准词语？合法动作只有 raise/call/fold/check/bet/allin。',
    },
    [HandValidationErrorCode.SETTLEMENT_MISMATCH]: {
      description: '结算金额对不上（通常可以忽略）',
      askUser: '无需补充，下次调用时 result.players.stack 全填 0 即可自动修复。',
    },
    [HandValidationErrorCode.CHIPS_CONSERVATION]: {
      description: '结算后筹码总量不守恒',
      askUser: '无需补充，下次调用时 result.players.stack 全填 0 即可自动修复。',
    },
  }
  return (
    map[code] ?? {
      description: '遇到未知错误',
      askUser: '请重新描述牌局，补充行动顺序和关键金额。',
    }
  )
}

/**
 * 所有内层修复轮次均遭遇 API 过载时的简短用户友好提示
 *
 * 不包含完整 JSON（避免庞大 tool result 让外层 Gemini 在 SSE 超时前来不及回复）；
 * 系统指令要求外层模型仅输出一句简短道歉，快速释放 SSE 连接。
 *
 * @param rounds 经历的轮次数
 */
function buildApiOverloadResponse(rounds: number): string {
  return [
    `抱歉，当前牌局生成服务繁忙（${rounds} 轮内层修复均遭遇 API 限流），本次牌谱生成未能完成。`,
    '',
    `【系统指令】内层修复全部遇到 API 限流，禁止再次自动调用 nl_to_hand 工具。`,
    `请立即向用户输出一句简短的道歉提示（如："抱歉，牌局生成服务暂时有点繁忙，稍等片刻后重新描述一次试试~"），禁止空回复！`,
  ].join('\n')
}

/**
 * 构建最终失败响应
 *
 * 两个并行目标：
 *   A. 包含最接近成功的完整候选 JSON，让外层下次能直接接续，不重头来过
 *   B. 通过【系统指令】阻止外层自动重试，改为向用户输出问询
 *
 * @param bestResult 最接近成功时的校验结果
 * @param bestCandidate 最接近成功的候选牌谱
 * @param rounds 本次内层已消耗的轮次数
 */
function buildBestFailureResponse(
  bestResult: HandValidationResult,
  bestCandidate: LatestHandType,
  rounds: number
): string {
  const hero = bestCandidate.players.find((p) => p.hole_card_list)
  const facts = [
    `playerCount=${bestCandidate.players.length}`,
    `big_blind=${bestCandidate.big_blind}`,
    `ante=${bestCandidate.ante}`,
    `dealer_seat=${bestCandidate.dealer_seat}`,
    hero ? `hero_seat=${hero.seat_no}, hero_hole_card_list=${hero.hole_card_list}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  const stuck = buildStuckSummary(bestResult.code)

  return [
    `不合法（内层 ${rounds} 轮修复均未成功）`,
    '',
    '[已确认事实]',
    facts,
    '',
    '[最接近成功的完整候选]（可直接作为下次调用的 game_hand 输入）',
    JSON.stringify({ ...bestCandidate, _reasoning: undefined }),
    '',
    '[最接近成功时的引擎报错]',
    bestResult.message,
    '',
    '[当前卡住的问题]',
    stuck.description,
    '',
    // ── 系统指令：阻止外层自动重试，强制向用户问询 ──────────────────────
    `【系统指令】内层修复已耗尽 ${rounds} 轮，禁止再次自动调用 nl_to_hand 工具。`,
    '请立即向用户输出以下内容（必须包含全部 3 点）：',
    `1. 已生成牌谱的进展摘要：${facts}`,
    `2. 当前卡住的问题：${stuck.description}`,
    `3. 请求用户补充：${stuck.askUser}`,
    '等用户补充信息后再次调用工具，禁止空回复！',
  ].join('\n')
}

/**
 * nl_to_hand 工具：根据用户自然语言描述生成并校验结构化牌谱
 *
 * 内部采用两阶段流水线：
 *   Phase 1  Baseline：schema → autofix → simulateHand
 *   Phase 2  内层私有修复回路（仅 baseline 失败时进入）：
 *     - 复用外层同一套 system / description / LatestHandSchema / _reasoning
 *     - 使用 generateObject 做结构化生成，避免自由文本 parse 失败
 *     - 最多 MAX_INTERNAL_ROUNDS 轮，配备进展判定与无进展熔断
 *     - 失败时返回最佳候选 + 通俗卡住描述 + 【系统指令】阻止外层重试
 */
export function createNlToHandTool(_options: ToolOptionsType) {
  return tool({
    // 复用共享常量，与内层 buildInnerPrompt 同源
    description: NL_TO_HAND_DESCRIPTION,
    inputSchema: NlToHandToolInputSchema,
    execute: async ({ game_hand }) => {
      /** 用于诊断：内层多轮 generateObject 可能使 execute 超过 60s，若客户端/代理先断流，工具虽已 return 但前端收不到 SSE */
      const executeStartedAt = Date.now()
      // 统计“第一次大模型生成牌谱耗时”：
      // 从外层第一次 streamText 启动，到工具 execute 被调用（即 game_hand 已完整可执行）的耗时。
      if (_options.firstModelStreamStartedAt) {
        const firstModelToToolMs = executeStartedAt - _options.firstModelStreamStartedAt
        console.info(`[nl_to_hand diag] 首次大模型生成牌谱到可执行耗时 ${firstModelToToolMs}ms`)
      }
      console.info(
        `============> createNlToHandTool.game_hand: ${JSON.stringify(game_hand, null, 2)}`
      )
      try {
        // ── Phase 1 Baseline：schema → autofix → simulateHand ─────────────────
        const preFixResult = runPreParseAutoFix(game_hand)
        logAutoFixSummary('A', preFixResult.patches)

        const parseResult = LatestHandSchema.safeParse(preFixResult.fixed)
        if (!parseResult.success) {
          const firstError = parseResult.error.issues[0]
          if (!firstError) {
            return '不合法: 未知 Schema 校验错误'
          }
          const path = firstError.path.join('.')
          return (
            `不合法\n[错误码] SCHEMA_INVALID\n[出错位置] ${path}\n` +
            `[错误原因] ${firstError.message}\n` +
            `[修复建议] fix_path=${path} | fix=检查并修正该字段的值和格式`
          )
        }

        // schema 校验成功后，进行 post-parse 修复:重复花色问题
        const stageBResult = runPostParseAutoFix(parseResult.data)
        logAutoFixSummary('B', stageBResult.patches)
        const baselineHand = stageBResult.fixed

        const baselineSimResult = simulateHand(baselineHand)
        console.info(
          `============> simulateHand baseline 执行完毕，结果: ${JSON.stringify(baselineSimResult, null, 2)}`
        )

        if (baselineSimResult.ok) {
          const elapsedMs = Date.now() - executeStartedAt
          console.info(
            `[nl_to_hand] execute 结束(baseline 即合法)，耗时 ${elapsedMs}ms，即将向 AI SDK 返回工具结果`
          )
          return buildSuccessResponse(baselineHand, _options.includeFinalHandJson)
        }

        if (_options.innerRepairMode !== 'inner_repair') {
          console.info('[nl_to_hand] baseline 未通过，同步链路跳过内层 LLM 修复，返回 draft 诊断')
          return buildBestFailureResponse(baselineSimResult, baselineHand, 0)
        }

        // ── Phase 2 内层私有修复回路 ──────────────────────────────────────────
        // 默认使用 geminiFlashLiteModel：完整支持 generateObject 所需 of json_schema 模式
        // DeepSeek-Chat 不支持 response_format=json_schema，会导致 generateObject 全部失败
        const repairModel = _options.innerRepairModel ?? qwen8bModel // qwen8bModel // deepSeekModle //  geminiFlashModel // geminiFlashLiteModel
        const mainSystem = _options.promptProvider.prompts.mainSystemPrompt.value
        // 重建"一问一答"回合结构：当前用户描述（语义锚点）+ 历史完整回合（配对的用户描述 + 工具轨迹）
        // Fix 4：historicalN 由 2 改为 0
        // 原因：历史轮次携带的是前几轮完全不同手牌的完整 game_hand JSON（~700 token/轮），
        //       对"修复当前手牌"无增量价值，却导致第 3 次对话时内层 Gemini 响应超时（53s → 超 60s SSE）。
        //       内层修复只需 currentUserText（语义锚点）+ bestCandidate（结构锚点）+ errorHistory（诊断依据）。
        const { currentUserText, historicalTurns } = getContextFromMessages(
          _options.messages ?? [],
          0 // Fix 4: 0 不引入前几轮不同手牌的历史 JSON
        )

        const state: HealingState = {
          round: 0,
          noProgressStreak: 0,
          errorHistory: [`[baseline 引擎报错]\n${baselineSimResult.message}`],
          bestCandidate: baselineHand,
          bestResult: baselineSimResult,
          prevResult: null,
        }
        // 累计因 API 过载跳过的轮次数，用于判断是否全部轮次都是过载
        let apiOverloadCount = 0

        for (let round = 1; round <= MAX_INTERNAL_ROUNDS; round++) {
          state.round = round
          console.info(
            `[内层修复] 开始第 ${round} 轮（策略: ${round <= 2 ? '重生成' : '最小变更'}）`
          )

          // 使用 generateText + Output.object 复用 LatestHandSchema 做结构化生成
          let candidate: LatestHandType
          try {
            const genResult = await generateText({
              model: repairModel,
              output: Output.object({ schema: LatestHandSchema }),
              system: mainSystem,
              prompt: buildInnerPrompt(
                currentUserText,
                historicalTurns,
                state.bestCandidate,
                state.errorHistory,
                round
              ),
              // maxRetries:0 禁用 SDK 内置指数退避重试：
              // API 过载时每次重试等待 10-30s（3次共 ~38s），严重压缩 60s SSE 超时预算。
              // 改由外层 for 循环统一管理轮次，P0 逻辑在 catch 中快速跳过，无需等待退避。
              maxRetries: 0,
            })
            candidate = genResult.output
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e)
            console.warn(`[内层修复] 第 ${round} 轮 generateText(Output.object) 失败: ${errMsg}`)

            if (isApiOverloadError(errMsg)) {
              // P0 优化：API 过载/限流是外部基础设施问题，不算"无进展"
              // 跳过本轮继续下一轮，不计入 noProgressStreak，避免因 API 抖动提前熔断
              apiOverloadCount++
              console.warn(
                `[内层修复] 第 ${round} 轮 API 过载，跳过本轮（noProgressStreak 不计入，apiOverloadCount=${apiOverloadCount}）`
              )
              state.errorHistory.push(`[第${round}轮API过载] 已跳过，下轮重试`)
              continue
            }

            // 非 API 过载（schema 不匹配、内容违规等真正的生成失败）→ 计入 noProgressStreak
            state.errorHistory.push(
              `[第${round}轮generateText失败] ${errMsg}，请只输出符合 schema 的 JSON 对象`
            )
            state.noProgressStreak++
            if (state.noProgressStreak >= MAX_NO_PROGRESS) {
              console.warn(`[内层修复] 连续 ${state.noProgressStreak} 轮无进展，提前熔断`)
              break
            }
            continue
          }

          // 走与 baseline 完全相同的校验链
          const fixResult = runPostParseAutoFix(candidate)
          const simResult = simulateHand(fixResult.fixed)
          console.info(
            `[内层修复] 第 ${round} 轮校验结果: code=${simResult.code}, step=${simResult.step ?? 'n/a'}`
          )

          if (simResult.ok) {
            console.info(`[内层修复] 第 ${round} 轮成功`)
            const elapsedMs = Date.now() - executeStartedAt
            console.info(
              `[nl_to_hand] execute 结束(内层第 ${round} 轮合法)，耗时 ${elapsedMs}ms，即将向 AI SDK 返回工具结果；` +
                '若前端未收到，请检查该 POST 总时长是否超过网关/浏览器 SSE 超时（常见 60s）'
            )
            return buildSuccessResponse(fixResult.fixed, _options.includeFinalHandJson)
          }

          // 更新最佳候选（严重度优先，相同时取 step 更大的）
          if (isBetter(simResult, state.bestResult)) {
            state.bestCandidate = fixResult.fixed
            state.bestResult = simResult
            state.noProgressStreak = 0
          } else {
            // 振荡检测：连续两轮 (code, step) 完全相同
            if (state.prevResult && isStagnant(state.prevResult, simResult)) {
              state.noProgressStreak++
              console.warn(
                `[内层修复] 振荡检测：第 ${round} 轮与上轮结果相同，noProgressStreak=${state.noProgressStreak}`
              )
            }
          }
          state.prevResult = simResult
          state.errorHistory.push(`[第${round}轮引擎报错]\n${simResult.message}`)

          if (state.noProgressStreak >= MAX_NO_PROGRESS) {
            console.warn(`[内层修复] 连续 ${state.noProgressStreak} 轮无进展，提前熔断`)
            break
          }
        }

        // ── 全轮次失败：根据失败原因返回不同响应 ─────────────────────────────────
        console.info(
          `[内层修复] 全部 ${state.round} 轮未成功，返回最佳失败报告 (code=${state.bestResult.code}, apiOverloadCount=${apiOverloadCount})`
        )

        // 若所有轮次都因 API 过载跳过（无真正的引擎修复尝试），返回简短的服务繁忙提示；
        // 此时 bestCandidate 仅为 baseline 原始结果，包含完整 JSON 无意义，且庞大的失败报告
        // 会让外层 Gemini 在已接近 60s SSE 超时时再消耗数秒生成响应，导致前端卡住。
        if (apiOverloadCount > 0 && apiOverloadCount >= state.round) {
          console.warn(
            `[内层修复] 全部 ${state.round} 轮均为 API 过载，跳过完整失败报告，返回简短过载提示`
          )
          return buildApiOverloadResponse(state.round)
        }

        return buildBestFailureResponse(state.bestResult, state.bestCandidate, state.round)
      } catch (error) {
        return `不合法: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

/** 成功路径下给外层模型的系统指令：由 AI 结合本轮上下文自行总结牌局 */
const SUCCESS_TOOL_SYSTEM_DIRECTIVE =
  '【系统指令】该工具已调用成功，画面已渲染。请你必须按“牌谱样式”输出，禁止散文长段落。' +
  '输出必须放在 Markdown 代码块中（使用 ```text 开头与 ``` 结尾），以确保前端保留换行。' +
  '输出结构固定为：' +
  '[牌局概览]\\n' +
  '[Preflop]\\n' +
  '[Flop]\\n' +
  '[Turn]\\n' +
  '[River]\\n' +
  '[结果]\\n' +
  '[核心总结]。' +
  '规则：' +
  '0.1) [牌局概览] 必须包含：人数、盲注/前注、每个位置的初始筹码、Hero 位置与 Hero 手牌（未知则写未知）；' +
  '0) 各标题（含[牌局概览]）必须独占一行，标题后内容必须从下一行开始，禁止“[牌局概览] 内容...”同一行写法；' +
  '1) 每条行动必须单独一行，使用换行符分隔，禁止在同一行写多个动作；格式为“位置/玩家 动作 金额（可省略）”，例如“UTG call 2”；' +
  '1.1) 必须按具体位置逐条描述（如 UTG/HJ/CO/BTN/SB/BB），禁止使用“其他玩家”“多人”“其余玩家”等聚合写法；' +
  '2) Flop/Turn/River 标题行必须包含公共牌；' +
  '3) 若某街无行动，写“(无)”；' +
  '3.1) [结果] 必须包含：亮牌信息（谁亮了什么牌，未知写未知）、赢家与每位赢家赢得底池金额（如“CO 赢得主池 120”）；' +
  '3.2) 若存在多人全下或边池，结果区必须列出所有奖池分配：主池与每个边池分别由谁赢得、各自金额多少（不得省略）；' +
  '4) 未知信息写“未知”，不要编造；' +
  '5) [核心总结] 控制在 2-4 条，聚焦关键转折与可改进点。' +
  '错误示例：' +
  '[牌局概览] 9人桌，盲注1/2；Preflop: UTG call 2, HJ raise 8，其他玩家fold；结果：Hero赢了很多（错误：标题与内容同一行、一行多个动作、使用聚合主体、缺少初始筹码/Hero手牌/亮牌/明确底池金额）。' +
  '正确示例：' +
  '```text\\n[牌局概览]\\n9人桌，盲注1/2，前注0\\nHero: BB，手牌 AhKd\\nUTG 初始筹码 200\\nHJ 初始筹码 200\\nCO 初始筹码 200\\nBTN 初始筹码 200\\nSB 初始筹码 200\\nBB(Hero) 初始筹码 200\\n[Preflop]\\nUTG call 2\\nHJ raise to 8\\nCO fold\\nBTN fold\\nSB call 7\\nBB call 6\\n[Flop] Ac 7d 2s\\nSB check\\nBB bet 10\\nHJ call 10\\n[Turn] 9h\\nSB fold\\nBB check\\nHJ bet 24\\nBB call 24\\n[River] Kc\\nBB bet 40\\nHJ fold\\n[结果]\\n亮牌：BB(Hero) AhKd；HJ 未亮牌\\n赢家：BB(Hero)\\n奖池分配：\\n主池 120 -> BB(Hero)\\n边池1 46 -> HJ\\nBB(Hero) 最终净赢 +74\\n[核心总结]\\n1. 翻前 3bet 后范围领先。\\n2. 河牌持续施压迫使对手弃牌。\\n```。' +
  '禁止空文本。'

/**
 * 构建成功响应字符串
 *
 * 若引擎自动计算了结算值（任意 stack > 0），则附带 [引擎结算结果]；
 * 否则仅返回"合法"字符串。
 *
 * @param handData 最终校验通过的牌谱对象（settlement_validator 已原地填充 stack）
 */
function buildSuccessResponse(handData: LatestHandType, includeFinalHandJson = false): string {
  const hasEngineSettlement = handData.result.players.some((p) => p.stack > 0)
  const finalHandJson = includeFinalHandJson
    ? `\n[最终牌谱JSON] ${JSON.stringify(handData)}\n`
    : ''

  if (hasEngineSettlement) {
    const settlementJson = JSON.stringify(handData.result.players)
    const resolvedStr = `合法\n[引擎结算结果] ${settlementJson}${finalHandJson}\n` + SUCCESS_TOOL_SYSTEM_DIRECTIVE
    console.info(`[nl_to_hand] 成功返回：含引擎结算 JSON，总长度 ${resolvedStr.length}`)
    return resolvedStr
  }

  const successStr = `合法${finalHandJson}\n${SUCCESS_TOOL_SYSTEM_DIRECTIVE}`
  console.info(`[nl_to_hand] 成功返回：简洁成功响应，总长度 ${successStr.length}`)
  return successStr
}
