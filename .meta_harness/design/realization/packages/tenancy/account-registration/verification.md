# account-registration 验证与证据

契约侧的证据义务权威在 [`spec/compositions/account-registration/verification.md`](../../../../spec/compositions/account-registration/verification.md)：
三个形式任务、五条规范场景（S-27～S-31）、以及清除链上跨两步的几条义务（跳过 ① 直接调 ②、两步之间中断后重扫、与主链并发）。本页按本节点的兑现点登记。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| S-13／S-35／S-16／S-10／S-20／S-19 | TLC 两个配置（crash、progress） | **已通过**（形式）：run `2026-09-22-formal-tenant-domain-2` 无反例；2026-09-23 核过模型与配置和当前 `spec/` 逐字节相同，未重跑（[bindings](bindings.yaml)）；证的是契约模型，**不是本节点**。实现侧的 S-13／S-35 另有故障注入 `faults.spec.ts` › `S-13／S-35 两个不可达状态：每一步之间注入失败`（3 条，run `2026-09-23-tests-tenancy-leg-2` 通过）——那是实现的证据，不是模型的 | — |
| [S-5](../../../../spec/compositions/account-registration/v1/contract.md#s-5-终结结果集合) 四值闭合 | lint：`register` 返回类型是 `TerminalOutcome` 四值字面量联合，无第五值；**不绑 `basic` 的 `TypeOK`**——那条约束的是模型自己变量的值域 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`tools/ts-checks/tests/consumer-rules.spec.ts` › `terminal-outcome-closed`（4 条，含对真实 AR 源码的变异核对），`pnpm run lint:rules` 退出 0；类型层 `types.spec-d.ts` › `account-registration 类型闭合` › `S-5 终结结果恰四值`、`register 的返回恰是四值终结结果…` | 本节点 |
| [S-27](../../../../spec/compositions/account-registration/v1/contract.md#s-27-规范场景中途失败后用同一标识重来) | 演练：② 前注入存储故障 → `interrupted` → 同标识同凭据重来 → `registered`，恰一个个人组织 | **已通过**（同 run）：`scenarios.spec.ts` › `S-27 中途失败后用同一标识重来`（3 条） | 本节点 + 两个参与方 + 可注入故障的 `storage` |
| [S-28](../../../../spec/compositions/account-registration/v1/contract.md#s-28-规范场景在任意位置中断没有第三种形态) | 三个位置中断、不重试，检查两种形态之一 | **已通过**（同 run）：`scenarios.spec.ts` › `S-28 在任意位置中断，没有第三种形态`（2 条） | 本节点 |
| [S-29](../../../../spec/compositions/account-registration/v1/contract.md#s-29-规范场景参与方缺席时不放行) | 让 organization-governance 不可用（卸载其 fiber），驱动到 ③ ⇒ 不激活 | **已通过**（同 run）：`scenarios.spec.ts` › `S-29 参与方缺席时不放行`（3 条：装配期缺席、运行期不可用、在途时被撤） | 本节点 + 装配。**在本设计下 `organizations` 缺席 ⇒ 本 fiber `PENDING`，`register` 根本调不到**——演练要区分「装配期缺席」（PENDING）与「运行期返回 `unavailable`」两支 |
| [S-30](../../../../spec/compositions/account-registration/v1/contract.md#s-30-规范场景编排者被卸载在途尝试等同崩溃) | ① 与 ② 之间卸载本插件 ⇒ 账号停在未激活、无清理、重来能续 | **已通过**（同 run）：`scenarios.spec.ts` › `S-30 编排者被卸载，在途尝试等同崩溃` | 本节点；依赖 S-22 主动停步的 API 核对 |
| [S-31](../../../../spec/compositions/account-registration/v1/contract.md#s-31-规范场景两个同标识并发注册) | 真并发，同凭据与不同凭据两支 | **已通过**（同 run）：`scenarios.spec.ts` › `S-31 两个同标识并发注册`（3 条，sqlite）；撞 `account_login_identifier_unique` 那一支在 pg 一侧 `apps/tenancy-host/tests/pg.spec.ts` › `pg 首跑 · 各包留给 pg 的支` › `AR I-6 撞 account_login_identifier_unique 那一支的 pg 变体…`。`integration.spec.ts` 里 I-6 撞约束那一支的 sqlite 占位**跳过**（sqlite 下到不了：写事务串行，走的是「不同类 ⇒ 重来」） | 本节点 + account-identity（唯一约束 R-2 的实证） |
| 清除链跨两步义务：跳过 ① 直接调 ②（`purge-warrant-invalid`）、两步之间中断后重扫（① 幂等 `ok` 再签、② 清掉）、与主链并发（[S-34 交错表](../../../../spec/compositions/account-registration/v1/contract.md#与注册主链并发)七格） | 演练 + 真并发 | **已通过**（同 run）：`purge.spec.ts` › `S-34 清除链（清扫经 purgeExpired 发起）`（6 条）、`S-34 两个发起者在同一条过期记录上并发`（2 条）；`interleavings.spec.ts` › `ar#S-34 与注册主链并发：交错表其余几格`（4 条）、`ai#S-43 第 2 支 × ar 同一次演练…`（4 条）、`og#S-54 ⑥⑦…`（1 条）；`integration.spec.ts` › `I-6 清除完成之前同一标识重新注册` › `清除链停在两步之间时…` | 本节点 + 两个参与方；与 account-identity S-43 第 2 支、organization-governance S-54 同一批演练 |
| 主链就地清除再重跑 ① 只一次 | 演练：构造已过期记录 → `register` ⇒ `registered` 且新 AccountId；构造清除链失败三类 ⇒ `interrupted` 不重跑 | **已通过**（同 run）：`purge.spec.ts` › `S-8 撞上已过期记录：本组合就地跑清除链，两步都 ok 才重跑 ① 一次`（7 条） | 本节点 |
| 缺陷记录可区分 | 演练：`warrant-invalid`／`accountDoesNotExist`（②）等落一条 `composition-defect` 记录，`interrupted` 计数不含它 | **已通过**（同 run）：`scenarios.spec.ts` › `S-8 参与方失败值 → 终结结果（主链…）`（4 条）；`purge.spec.ts` 中「记组合缺陷」「记契约违反」的几条；类型 `types.spec-d.ts` › … › `缺陷记录三类、五个步骤位置` | 本节点 |

## 覆盖缺口

按上面这次 run 的对应清单，义务表每一行都有通过的承担者。**跳过不是通过**：`integration.spec.ts` 里 I-6 撞约束那一支的 sqlite 占位仍是跳过，它在 sqlite 下到不了，承担者在 pg 一侧。

其余不在本 run 证据范围内的：

- **清扫提供者无候选枚举读面**，本版无清扫：S-34 的第二个发起者只在测试里经 `purgeExpired` 发起，没有真实的清扫提供者；G-6 降级为卫生义务后不阻断验收。
- **S-22 主动停步**依赖未核对的 fiber 状态 API；`integration.spec.ts` › `插件装载面` › `必需服务换代 ⇒ …在途调用握着上一代的快照，下一步之前停下 ⇒ interrupted` 在同 run 通过，是这一机制在 4.0.4 上的行为证据，不是 API 的来源核对。
- **S-25 右列**协议给保证本版无证据形式（G-3）。
- **S-19 的前提 (d)（两个参与方的服务面都能被解析到）**在模型里没有建模；实现侧的 S-29 演练（同 run 通过）证装配期缺席与运行期不可用两支都不放行。
