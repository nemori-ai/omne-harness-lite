# 会话受理、消费、推进 · 复用论证

> **更正（2026-11-26）**
>
> - 「把 `AdvanceWait` 的『用完』改成『延后到下一次叫醒』」不是已定的事：今天的有界重试加周期扫描已经满足活性（模型 `bad-no-scan` 显示去掉扫描才卡死），改不改见 `requirement.md` 的更正 3。
> - `AdvanceObligation.tla`（#1649 里的草模）与随后的修订 1 模型都已作废，没有带进材料。现行模型是 `models/AdvanceLiveness.tla` 修订 2。
> - 修订 2 还没有落进仓库。第 1 程用的是仓库里已有的 `packages/agent/agent/verification/run-lifecycle/`。修订 2 随第一个用到它的程（批界那一程）落进 `packages/session/session/verification/advance-liveness/`，照本页写的约定：一份通过的配置、若干负对照、`expect.txt`。

范围由 `impact.md` 的总边界限定。按「直接复用 → 二次开发 → 二次封装 → 自造」的次序，找到就停。

## 1. 形式化：TLA+ / TLC — 直接复用

- 候选：仓库钉住的 `tla2tools-1.7.4.jar`（`pnpm run check:formal-tools` 校验摘要），已有 30 余个模型在用。
- 结论：**直接复用**。新模型照现有约定放在成员的 `verification/<题目>/`：一份通过的 cfg，若干 `bad-*.cfg` 负对照（`Bugs` 集合注入缺陷，每个负对照必须违反指定性质），`expect.txt` 逐行写「cfg 预期」。约定的样例：`packages/session/session/verification/advance-wait/`。
- 可复用的现成模型与关系：
  | 现成模型 | 它守的 | 本程怎样用 |
  | --- | --- | --- |
  | `agent/verification/capacity-liveness/CapacityLiveness.tla` | 资源一时满是依赖等待，Run 保住位置、稍后再问（活性） | 应然的同构样板：本程 Session 推进器的「一时不可用 = 延后、不放弃」照它的公平条件写 |
  | `session/verification/advance-wait/AdvanceWait.tla` | 推进等待的退避与原操作 | 现有的有界重试语义在这里；本程的新模型要与它的 `Exhaust` 语义对齐，把「用完」改成「延后到下一次叫醒」 |
  | `docs/architecture/verification/recovery/SystemRecovery.tla` | 会话日志与 Agent 的跨进程恢复 | 本程不改它的承诺；新模型在它之上细化 Session 与 Agent 的交接接缝（invoke、handOver、contact、detach） |
  | `session-adapters/verification/generation-handoff/{Generation,Handoff}.tla` | 换代交接 | 推进位让渡（I-5）的相邻模型，核对不冲突 |
  | `agent/verification/cancellation/Cancellation.tla` | 取消的围栏与结论 | 取消后旧推进者让位（I-5）与它的 `no-fence` 等负对照对照着写 |
- 我在 #1649 里写的 `AdvanceObligation.tla` 是草模：保留它的反例，第 4 步按上面的约定重写进 `packages/session/session/verification/advance-liveness/`，加负对照与 `expect.txt`。

## 2. 生成式测试：fast-check — 直接复用

- 候选：
  | 候选 | 许可 | 维护 | 对本程的关键能力 | 结论 |
  | --- | --- | --- | --- | --- |
  | fast-check 4.x | MIT | 活跃（4.10.1 2026-09-15、4.10.2 09-19、4.10.3 11-18、4.11.0 11-21） | 基于模型的命令序列测试（`fc.commands` + `fc.asyncModelRun`）；`fc.scheduler` 把 Promise 完成顺序变成可收缩的随机维度，专门暴露竞态；失败可按 seed 与 path 重放 | **采用** |
  | `@fast-check/vitest` 0.5.0 | MIT | 活跃 | 只是 `test.prop` 语法糖 | 不引入：fast-check 直接在 vitest 里用即可，少一个依赖 |
  | jsverify、testcheck-js | — | 多年无维护 | — | 排除 |
  | 自造随机交错夹具 | — | — | 仓库已有手写交错用例（`session-contract/tests/log-conformance.spec.ts`、`session-storage-sql/tests/work-cache.spec.ts`），但都是枚举固定交错，没有收缩与重放 | 不自造：缺收缩与重放，正是 fast-check 现成提供的 |
- 版本：钉 **4.10.2**（满两周；4.10.3 只有 7 天、4.11.0 只有 4 天，不用）。进 `pnpm-workspace.yaml` 的 catalog，只作测试的 devDependency。
- 不变式对照：
  - I-1、I-5：`fc.scheduler` 对推进器、恢复扫描、Agent 驱动口替身的 Promise 交错做随机调度，断言开着的 Run 在有界步数内推进或收场。
  - I-2：命令序列里插入「进程重启」命令（丢掉全部内存对象、只留日志），断言重启前后算出的义务集合相同。
  - I-3、I-8：替身按生成的序列答 `ok / unavailable / changed / commit-unknown`，断言从不静默丢弃、重试间隔不小于下限。
  - I-4：生成受理、失败、取消、续入的任意交错，断言每条输入恰被回答一次、同批不拆。
  - I-6：生成归档、撤销归档、后台调用结局的交错。
  - I-9（最后一程）：两租户的读写序列对存储排队替身，断言每个租户在有界轮次内得到服务。
- 先删再加：仓库里没有可删的同类依赖或重复实现；手写的固定交错用例保留，作为具名回归。

## 3. 偏函数定义与全化表 — 不需要外部件

- 按 `think-model-first` 的模板在 tmp 里写，结论落进 `packages/session/SPEC.md`（恢复表与推进一节）和 Agent 契约的 contact 一节。没有可复用的外部工具，也不需要。

## 4. 存储公平排队（最后一程）— 二次开发

- 候选：`packages/storage/sqlite-provider` 现有的读写队列（全局与每领域上限、工作线程预留）。
- 结论：**二次开发**。在现有队列上加按租户的公平取队（例如按租户轮转或加权公平）与每租户在途上限，不引入外部队列库。理由：差异只在「出队次序与份额」，队列、工作线程与事务边界都已正确；外部库（p-queue 之类）不懂存储的领域与事务语义，换上来要改的比加的多。具体算法在最后一程的定义期再调研（相近系统：SQLite 单写者下的读写分离与公平调度）。

## 自造

无。
