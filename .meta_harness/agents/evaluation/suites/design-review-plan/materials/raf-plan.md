# 模拟评审输入（非开发过程记录）

# 施工计划：run-attempt-facts-derived 节点落地（候选）

- **计划修订**：r1（候选，未获准执行）
- **目标**：把模拟组件 `模拟组件/session/run-attempt-facts-derived` 落成产品包，
  并让执行宿主改用它提供的 `runAttemptFacts` 服务，替掉验收装配里「尝试与运行的事实」那个替身。
- **采用的设计**：`capability.run-attempt-facts/v2`（已接受）；节点设计 `design.md`（已接受）；
  `capability.session-log/v2` 的 `readSince`。
- **验收边界**：契约规范场景 S-14～S-18；节点 `verification.md` 的 V-1～V-9。
- **基线**：执行仓库 `main` 当前提交。

## 前提

1. 会话日志提供者 `session-log-jsonl` 已交付并在验收装配里可用。
2. 终结记录的形状已由 loop 那一程定下（沿用验收里测试驱动写的那种记录），产品装配可以直接认出「已终结」，
   本计划不再为它留缺口。
3. 两名实施者 A、B 可同时投入；各自一棵工作树。

## 任务

| # | 任务 | 负责 | 开工条件 | 交付物 |
|---|---|---|---|---|
| T1 | 建包骨架 `packages/session/run-attempt-facts-derived`：清单、tsconfig、公开入口 | A | 第 1 天 | 可构建的空包 |
| T2 | 纯函数 `emptyAttemptState`、`foldAttemptEntries`、`answerAttemptFacts` 及其单元测试 | A | T1 完成 | 源码与测试 |
| T3 | 闭包 `createRunAttemptFacts` 与插件 `run-attempt-facts-derived`（服务 `runAttemptFacts`） | A | T2 完成 | 源码与测试；服务面的类型导出 |
| T4 | 执行宿主改指：每条收场路径在写事务之前调 `runAttemptFacts.attemptFacts`，删掉对替身的引用 | B | **第 1 天，与 T1 同时开工**；服务面的类型还没有，B 先按自己对节点设计的理解写一份本地声明，T3 完成后再对齐 | 执行宿主的改动与测试 |
| T5 | 据点装配：把新插件装进验收装配清单，删掉替身那一行 | A 与 B 各自按需修改 `apps/cli` 的装配清单，最后合并时解决冲突 | T3、T4 各自完成时 | 装配清单的改动 |
| T6 | 场景演练：契约 S-14、S-15、S-16、S-18 | A 自验并出一份报告，**记为独立验收** | T5 完成 | 报告 |
| T7 | 故障注入：让会话日志读不到（契约 S-17） | 未定；时间允许的话最后统一补 | —— | —— |

## 并行与合并

A、B 两棵工作树从同一基线切出，各自提交；T1～T3 与 T4 并行推进，全部做完之后一次合并到集成分支，再合入主线。

## 交付判据

`packages/session/run-attempt-facts-derived` 与执行宿主两个包的单元测试全绿，即视为本增量交付完成。

## 风险与处置

- `factsCacheLimit` 的初值没有测量依据：沿用节点设计给的 128，交付后有测量再调。
- 会话日志追读时载荷一起读回，大载荷会话代价高：本增量不处理，记为已知缺口（节点 AFD-5）。
