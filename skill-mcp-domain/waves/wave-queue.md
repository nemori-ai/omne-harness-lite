# 当前波队列（Skill 与 MCP）

格式沿 `.meta_harness/human/map-reduce-delivery/templates/wave-queue.md`，按[范式 r1](operating-model.md) 变通：没有收口卡，F 是父分支头。

- 当前波：W1 契约地基，波末收尾中；F = 21175c9f9f05a29d1db509420b75d2b016ed2fbe；计划修订 r1；2026-11-03T13:51:09Z 派发；两契约闭包已合入（aafc0cdc9、c247b873a），写回闭包 `w1-writeback-skill`、`w1-writeback-mcp` 进行中
- active 线：Skill 线（`w1-skill-contract` 已合入；`w1-writeback-skill` 进行中）、MCP 线（`w1-mcp-contract` 已合入；`w1-writeback-mcp` 进行中）
- 下一波预案：W2 通用实现与本地来源（`w2-skill`、`w2-skill-host`、`w2-mcp-core`；reduce 的 `w2-spike`），见[波段计划](rolling-plan.html)。预案不授权开工
- 待负责人决定：无

## 修订表

| 修订 | 时刻（UTC） | 变化 | 原因 |
| --- | --- | --- | --- |
| r1 | 2026-11-03 | 首版 | — |
| r2 | 2026-11-03 | 波末加两个写回闭包（组页、领域页、README），写集按组分开，由子代理写、reduce 合入 | 写回项约 40 处，reduce 串行写比两写者并行慢；波内「共享文件只由 reduce 写」在波末无在途闭包时不再约束 |

## W2 开波前检查项

- 对照 2026-07-28 schema 逐项核两成员 SPEC 的线上形状。
- 两线规格形态一致（套件 `ConformanceCase[]`、品牌 `isX`、三入口）。
- Skill `parse/manifest.ts:47–55` 边界夹具；MCP `brands.ts:50–52`、`endpoint.ts:117–153` 夹具。
- MCP `listing.ts`↔`catalog.ts` 类型环下沉；Skill read-body 读取器克隆记清理候选。
- 开波时把 `origin/integration/mainline` 合进父分支（范式 FI）。
