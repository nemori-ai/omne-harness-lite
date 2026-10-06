# 验证义务与方法

本页维护节点验证义务、责任与方法限制，不维护执行台账。规范与采用版本从契约及本节点 design 读取；实际实现从成员入口读取。结果、配置和反例留工作树 tmp。下列义务列出不表示实现、检查或接受完成，未决语义按原 owner 接续。

契约义务归 [account-registration verification](../../../../spec/compositions/account-registration/verification.md)。形式模型的值域和进展不直接证明提供者返回类型、注入边界或实际同提交存储。

## 证据义务

| 来源条款 | 需要什么证据 | owner 与闭合条件 |
|---|---|---|
| S-13／S-35／S-16／S-10／S-20／S-19 | TLC 两个配置（crash、progress） | — |
| [S-5](../../../../spec/compositions/account-registration/v1/contract.md#s-5-终结结果集合) 四值闭合 | lint：`register` 返回类型是 `TerminalOutcome` 四值字面量联合，无第五值；**不绑 `basic` 的 `TypeOK`**——那条约束的是模型自己变量的值域 | 本节点 |
| [S-27](../../../../spec/compositions/account-registration/v1/contract.md#s-27-规范场景中途失败后用同一标识重来) | 演练：② 前注入存储故障 → `interrupted` → 同标识同凭据重来 → `registered`，恰一个个人组织 | 本节点 + 两个参与方 + 可注入故障的 `storage` |
| [S-28](../../../../spec/compositions/account-registration/v1/contract.md#s-28-规范场景在任意位置中断没有第三种形态) | 三个位置中断、不重试，检查两种形态之一 | 本节点 |
| [S-29](../../../../spec/compositions/account-registration/v1/contract.md#s-29-规范场景参与方缺席时不放行) | 让 organization-governance 不可用（卸载其 fiber），驱动到 ③ ⇒ 不激活 | 本节点 + 装配。**在本设计下 `organizations` 缺席 ⇒ 本 fiber `PENDING`，`register` 根本调不到**——演练要区分「装配期缺席」（PENDING）与「运行期返回 `unavailable`」两支 |
| [S-30](../../../../spec/compositions/account-registration/v1/contract.md#s-30-规范场景编排者被卸载在途尝试等同崩溃) | ① 与 ② 之间卸载本插件 ⇒ 账号停在未激活、无清理、重来能续 | 本节点；依赖 S-22 主动停步的 API 核对 |
| [S-31](../../../../spec/compositions/account-registration/v1/contract.md#s-31-规范场景两个同标识并发注册) | 真并发，同凭据与不同凭据两支 | 本节点 + account-identity（唯一约束 R-2 的实证） |
| 清除链跨两步义务：跳过 ① 直接调 ②（`purge-warrant-invalid`）、两步之间中断后重扫（① 幂等 `ok` 再签、② 清掉）、与主链并发（[S-34 交错表](../../../../spec/compositions/account-registration/v1/contract.md#与注册主链并发)七格） | 演练 + 真并发 | 本节点 + 两个参与方；与 account-identity S-43 第 2 支、organization-governance S-54 同一批演练 |
| 主链就地清除再重跑 ① 只一次 | 演练：构造已过期记录 → `register` ⇒ `registered` 且新 AccountId；构造清除链失败三类 ⇒ `interrupted` 不重跑 | 本节点 |
| 缺陷记录可区分 | 演练：`warrant-invalid`／`accountDoesNotExist`（②）等落一条 `composition-defect` 记录，`interrupted` 计数不含它 | 本节点 |

## 覆盖缺口

- 清扫提供者的候选枚举读面与实际触发归产品/账号 owner；经测试 purgeExpired 发起第二清除链不能代替真实清扫提供者。
- S-22 主动停步须同时核 Cordis API 前提与服务换代/撤除的真实在途行为，机制实验不能代替上游来源核对。
- S-25 协议保证按 G-3 owner 接续；单机行为不得外推。
- S-19 前提(d)两参与方可解析没有在注册模型中建模，须 S-29 实际装配缺席 PENDING 与运行期 unavailable 两支都不放行。
- 唯一约束碰撞的可达性按 SQLite/pg 分别核；SQLite 写事务串行无法到达的交错不能以跳过记通过，必要方言适用时须真实提供者演练。
- 缺陷记录、interrupted 与 registered 的集合和计数分开；清除链两步之间中断重扫及七格真并发不得由串行场景替代。
