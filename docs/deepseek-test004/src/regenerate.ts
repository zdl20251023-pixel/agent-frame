/**
 * 仅用已有结果重新生成 HTML 报告（不重跑模拟，数字保持不变）。
 * 运行：node src/regenerate.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { generateReportHtml } from './report.ts';
import { summarize, RULES } from './statistics.ts';
import { loadRepeated } from './repeated-data.ts';

const results = JSON.parse(readFileSync('results/verify-results.json', 'utf8'));
// Refresh derived descriptions without changing the recorded samples or run time.
if (results.samples.some(s => !s.halfTransitions)) throw new Error('旧数据没有相邻分组计数，请运行 npm run verify 采集；不能从频数倒推顺序。');
results.schemaVersion = 4;
results.planVersion = '2026-09-09-readable-adjacency';
results.rules = RULES;
results.summary = summarize(results.samples);
// Report rebuilds must never overwrite preserved observations.
writeFileSync('洗牌均匀性验证报告.html', generateReportHtml(results,loadRepeated()));
console.log('已重新生成 洗牌均匀性验证报告.html');
