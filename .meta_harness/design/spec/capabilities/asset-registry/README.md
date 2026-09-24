# 会话资产注册表

**一个会话此刻认得哪些资产、它们此刻能不能用。**按类别一张表，由装配填、由 reload 一族按类别重填；
[会话斜杠命令集](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set)就是其中一张的视图；
[当下可用性](../../../ubiquitous_language/terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability)与[替换件](../../../ubiquitous_language/terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)在每次[执行尝试](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)开始时算出，一次尝试内不变；MCP 动作条目、接入点持有与逐动作执行权限也在那时钉进报告。

> 本契约兑现的是词条[会话资产注册表](../../../ubiquitous_language/terms/reach-and-availability.md#ul-session-asset-registry--会话资产注册表--session-asset-registry)；快照、条目、报告这些记录形状无词条，定义只在契约里。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-registry, 1)`
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 整批对齐，同日按第一轮独立评审修订——处置表在[验证入口](verification.md#独立评审)），**未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=asset-registry`、
  `contract_path=spec/capabilities/asset-registry/v1/contract.md`；`resources` 含契约与 `examples.md`；
  依赖十六项：`data.asset-model`、`data.tool-definition`、`data.loop-extension`、`data.messages`、`data.offer-expiry`、`data.identity-values`、`data.call-accounts`、`capability.asset-evaluation`、`capability.asset-governance`、`data.skill-package`、`data.slash-command`、`data.mcp-endpoint`、`capability.mcp-bridge`、`capability.tool-admission`、`capability.modality-projection`、`data.model-profile`（均 v1），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)（2026-09-24 整批对齐补齐，同日第一轮评审修订再补）
- **formal-tasks 映射**：无（本版不建形式工件，[S-35](v1/contract.md#s-35-本版选用哪些形式工件)）
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。快照何时换、换成什么、怎么记进装配清单与重建；reload 一族的名字与连带；可用性与替换件的判定；「谁可以用」在两类上的门控——**它们被「一个会话认得什么只在几个时刻变」绑在一起** |
| 为什么是 capability 而不是 data | 每个操作都有前置、提交点、失败集合与缺席默认；有状态（每个 (会话, 类别) 一份当前快照）和它的迁移 |
| 为什么不并进资产求值 | 求值是「哪份资产生效」的纯判定，不知道会话、不知道时刻；本契约拥有「这个会话**此刻**认得什么」——变化原因不同：求值规则变是那边变，换表时刻与可用性规则变是这里变 |
| 为什么不并进装配清单 | 清单是「会话装了什么」的唯一权威记录；本契约是读它、按它换表的那一方。**快照不持久**正是为了不重复拥有 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 资产形状、各类正文、求值、资产治理、MCP 桥、放行、身份值；agent loop、meta 门、斜杠命令识别、放行判断读本契约 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 七个操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 快照在哪几个时刻换，什么都不换它 | [契约 S-15](v1/contract.md#s-15-快照只在这几个时刻换) |
| reload 一族有哪几条、plugin 怎么连带 | [契约 S-23](v1/contract.md#s-23-reload按类别重填) |
| 可用性三个取值、按命令的可用性、替换件 | [契约 S-8](v1/contract.md#s-8-当下可用性的三个取值)～[S-10](v1/contract.md#s-10-替换件同形只换说明) |
| 一次尝试开始时报告里有什么、MCP 逐动作权限从哪来 | [契约 S-11](v1/contract.md#s-11-一次执行尝试的可用性报告)、[S-24](v1/contract.md#s-24-refreshavailability每次执行尝试开始时现算) |
| 权限收回怎么「此刻起不存在」 | [契约 S-20](v1/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)、[S-28](v1/contract.md#s-28-onassetchange权限收回之后收窄) |
| 重启之后怎么办 | [契约 S-33](v1/contract.md#s-33-本能力重启与重建) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-31](v1/contract.md#s-31-装配给的保证-vs-协议须给的保证) |
| 走通的路径与每个失败值的反例 | [examples](v1/examples.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十节](v1/contract.md#十已知缺口) |

## 版本包

`v1/` 含 `contract.md` 与 `examples.md`。**不建 Schema**：线上形状归把这些操作送过进程边界的那份 composition，
值类型引用 `data.asset-model`、`data.tool-definition`、`data.loop-extension`、`data.identity-values`、`data.offer-expiry` 与 `data.skill-package`、`data.slash-command`、`data.mcp-endpoint` 等各类正文契约。
**不建 `formal/`**：单写者、一次提交，被建模方式吸收；理由与触发条件见[验证入口](verification.md#形式工件)。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
