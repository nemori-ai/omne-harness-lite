# Journal 批次记录预算

## 性质

一个通过 Journal 编码检查的批次，加上封套后，不超过 session-storage-sql 的物理记录条数上限。

令 R = `EXECUTION_BATCH_MAX_FACTS`，E = 1，B = R - E。R 由存储拥有，E 由 adapters 的编码拥有。B 是 `BATCH_MAX_FACTS`，只计业务事实，不计封套。

## 证明

`batchOf` 和 `encodeBatch` 接受业务事实数 b 的前提是 0 ≤ b ≤ B。`encodeBatch` 恰好产生一条封套与 b 条事实行。因此行数为 E + b ≤ E + B = R。

Journal `append` 在基础事实之后补写责任账。基础事实数 b 已经过 `batchOf` 检查。它把余量 B - b 传给 `ledgerChanges`，后者通过 `obligationChanges` 最多产生这一数量的事实。令追加数为 l，则 0 ≤ l ≤ B - b。最终批次仍满足 E + b + l ≤ R。余量不足时未更新的责任项仍在权威读面中，不因此结清；后续签发责任清单必须按实际账目补齐。

## 对应实现和守护

- `src/journal/facts.ts` 从物理上限减去封套数，导出业务预算；编码超过预算时答 `too-many`。
- `src/journal/decide.ts` 的 `batchOf` 使用同一业务预算。
- `src/testing/journal.ts` 的 `append` 在剩余预算内补写责任事实。生产 Journal 复用此核心。
- `src/cordis/agent-journal.ts` 保留最终物理记录数量守卫，不信任局部预算代替入口检查。

执行 `pnpm --filter @omne-harness/session-adapters exec vitest run tests/journal-laws.spec.ts`。边界用例穷举当前上限内的全部业务事实数，包括空批、最大合法批次与首个非法批次。负控将业务预算改回物理上限，最大边界用例应变红。仓库运行时使用 `scripts/with-test-slot.sh` 获取名额。

## 前提与限制

这是整数计数论证，不是并发或任意长 Run 活性证明。它不保证单条事实的字节数、整个命令的字节数或存储容量，也不把一次所需事实超过预算的命令拆批。`prepareFinish` 的差额仍须在一次合法批次内，超出时明确拒绝。真实 Agent、SQLite 和 Journal 的 200 步用例负责验证本次 D-88 修复；本论证不能替代该运行证据。
