# account-registration 验证与证据

契约侧的证据义务权威在 [`spec/compositions/account-registration/verification.md`](../../../../spec/compositions/account-registration/verification.md)：
三个形式任务、五条规范场景（S-27～S-31）、以及清除链上跨两步的几条义务（跳过 ① 直接调 ②、两步之间中断后重扫、与主链并发）。本页按本节点的兑现点登记。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| S-13／S-35／S-16／S-10／S-20／S-19 | TLC 两个配置（crash、progress） | **已执行两次**，无反例（[bindings](bindings.yaml)）；证的是契约模型，**不是本节点** | — |
| [S-5](../../../../spec/compositions/account-registration/v1/contract.md#s-5-终结结果集合) 四值闭合 | lint：`register` 返回类型是 `TerminalOutcome` 四值字面量联合，无第五值；**不绑 `basic` 的 `TypeOK`**——那条约束的是模型自己变量的值域 | 未开始；检查器不存在 | 本节点 |
| [S-27](../../../../spec/compositions/account-registration/v1/contract.md#s-27-规范场景中途失败后用同一标识重来) | 演练：② 前注入存储故障 → `interrupted` → 同标识同凭据重来 → `registered`，恰一个个人组织 | 未开始 | 本节点 + 两个参与方 + 可注入故障的 `storage` |
| [S-28](../../../../spec/compositions/account-registration/v1/contract.md#s-28-规范场景在任意位置中断没有第三种形态) | 三个位置中断、不重试，检查两种形态之一 | 未开始 | 本节点 |
| [S-29](../../../../spec/compositions/account-registration/v1/contract.md#s-29-规范场景参与方缺席时不放行) | 让 organization-governance 不可用（卸载其 fiber），驱动到 ③ ⇒ 不激活 | 未开始 | 本节点 + 装配。**在本设计下 `organizations` 缺席 ⇒ 本 fiber `PENDING`，`register` 根本调不到**——演练要区分「装配期缺席」（PENDING）与「运行期返回 `unavailable`」两支 |
| [S-30](../../../../spec/compositions/account-registration/v1/contract.md#s-30-规范场景编排者被卸载在途尝试等同崩溃) | ① 与 ② 之间卸载本插件 ⇒ 账号停在未激活、无清理、重来能续 | 未开始 | 本节点；依赖 S-22 主动停步的 API 核对 |
| [S-31](../../../../spec/compositions/account-registration/v1/contract.md#s-31-规范场景两个同标识并发注册) | 真并发，同凭据与不同凭据两支 | 未开始 | 本节点 + account-identity（唯一约束 R-2 的实证） |
| 清除链跨两步义务：跳过 ① 直接调 ②（`purge-warrant-invalid`）、两步之间中断后重扫（① 幂等 `ok` 再签、② 清掉）、与主链并发（[S-34 交错表](../../../../spec/compositions/account-registration/v1/contract.md#与注册主链并发)七格） | 演练 + 真并发 | 未开始 | 本节点 + 两个参与方；与 account-identity S-43 第 2 支、organization-governance S-54 同一批演练 |
| 主链就地清除再重跑 ① 只一次 | 演练：构造已过期记录 → `register` ⇒ `registered` 且新 AccountId；构造清除链失败三类 ⇒ `interrupted` 不重跑 | 未开始 | 本节点 |
| 缺陷记录可区分 | 演练：`warrant-invalid`／`accountDoesNotExist`（②）等落一条 `composition-defect` 记录，`interrupted` 计数不含它 | 未开始 | 本节点 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| `2026-09-22-formal-tenant-domain-2` · `account-registration-v1-basic` | `basic.cfg`（`Attempts = {a1,a2}`，三开关 FALSE） | 无反例；55 generated · 31 distinct · 深度 7 | [run README](../../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md) |
| 同 run · `-crash` | `crash.cfg`（`{a1,a2,a3}`，三开关 TRUE） | 无反例；32170 · 6978 · 深度 16 | 同上 |
| 同 run · `-progress` | `progress.cfg`（`{a1,a2}`，`Expiring = TRUE`，其余 FALSE） | 无反例；时序性质在 374 total distinct states 上检查完 | 同上 |

三行都是契约模型的结果，不是本节点的符合性证据；`basic` 的数字与上一次 run 逐项相同但模型确实改了（run README 解释过）。

## 覆盖缺口

- **清扫提供者无候选枚举读面**，本版无清扫，S-34 的第二个发起者没有任何演练；G-6 降级为卫生义务后不阻断验收。
- **S-22 主动停步**依赖未核对的 fiber 状态 API；核不到就退到「在途调用跑完」，届时 S-30 的字面收场要重新对。
- **S-25 右列**协议给保证本版无证据形式（G-3）。
- **模型不表达依据的绑定与防伪**，那一半的证据全在 account-identity 的 S-41／S-42（未开始）。
