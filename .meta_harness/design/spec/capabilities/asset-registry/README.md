# 会话资产注册表

## 工作区接入的适用范围

v2 S-23 已是校验与记录追加成功后换目标表，失败不替换；S-24② 明确每次尝试不重读工作区目录。因此本轮无需重做 reload 核心协议。新工作区来源和身份接入受阻于输入读面；后续演进需收窄 S-15／S-20 对变化传播的旧泛称，不把文件变更当已接受治理变更。

依据：[reload 与尝试求值的冻结规则 S-23／S-24](v2/contract.md)；[工作区装配规则](../../../product/PF-002-assets-settings-and-permissions/design.md#工作区)。

**一个会话此刻认得哪些资产、它们此刻能不能用。**按类别一张表，由装配填、由 reload 一族按类别重填；
[会话斜杠命令集](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-session-slash-command-set--会话斜杠命令集--session-slash-command-set)就是其中一张的视图；
[当下可用性](../../../ubiquitous_language/terms/reach-and-availability.md#ul-current-availability--当下可用性--current-availability)与[替换件](../../../ubiquitous_language/terms/reach-and-availability.md#ul-stand-in--替换件--stand-in)在每次[执行尝试](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)开始时算出，一次尝试内不变；MCP 动作条目、接入点持有与逐动作执行权限也在那时钉进报告。

> 本契约兑现的是词条[会话资产注册表](../../../ubiquitous_language/terms/reach-and-availability.md#ul-session-asset-registry--会话资产注册表--session-asset-registry)；快照、条目、报告这些记录形状无词条，定义只在契约里。

**候选 v3（2026-09-27）**：[契约](v3/contract.md)、[实例](v3/examples.md)补齐 `fill`／`reload` 的显式 `compositionOrder`、真实求值结果与表构成的同次追加、`reuse` 保留原求值与排列。共 50 条，七个操作的九项约束保留；未接受、未冻结。依赖 `capability.asset-evaluation` v4 与 `capability.assembly-manifest` v3 候选，以及已接受的资产形状、工具、拓展件 v3；其余精确依赖见候选 S-4。registry 集成由本批唯一写入者负责，本入口不把候选当作已登记或已采用。验证范围与传播见 [v3 验证义务](verification.md#v3-候选求值快照与显式顺序)。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.asset-registry, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`；`family=capabilities`、`topic=asset-registry`、
  `contract_path=spec/capabilities/asset-registry/v2/contract.md`；`resources` 含契约与 `examples.md`；
  依赖十七项：`data.asset-model`、`data.tool-definition`、`data.loop-extension`、`data.messages`、`data.offer-expiry`、`data.identity-values`、`data.call-accounts`、`capability.asset-evaluation`、`capability.asset-governance`、`data.skill-package`、`data.slash-command`、`data.mcp-endpoint`、`capability.mcp-bridge`、`capability.tool-admission`、`capability.modality-projection`、`data.model-profile`、`capability.assembly-manifest`（均 v1；最后一项 2026-09-25 修订波登记），clauses 取自[契约 S-4](v2/contract.md#s-4-依赖方向与被消费的面)（2026-09-24 整批对齐补齐，同日第一轮评审修订再补）
- **formal-tasks 映射**：无（本版不建形式工件，[S-35](v2/contract.md#s-35-本版选用哪些形式工件)）
- **提供者/装配映射**：[packages/tools/asset-registry](../../../realization/packages/tools/asset-registry/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。快照何时换、换成什么、怎么记进装配清单与重建；reload 一族的名字与连带；可用性与替换件的判定；「谁可以用」在两类上的门控——**它们被「一个会话认得什么只在几个时刻变」绑在一起** |
| 为什么是 capability 而不是 data | 每个操作都有前置、提交点、失败集合与缺席默认；有状态（每个 (会话, 类别) 一份当前快照）和它的迁移 |
| 为什么不并进资产求值 | 求值是「哪份资产生效」的纯判定，不知道会话、不知道时刻；本契约拥有「这个会话**此刻**认得什么」——变化原因不同：求值规则变是那边变，换表时刻与可用性规则变是这里变 |
| 为什么不并进装配清单 | 清单是「会话装了什么」的唯一权威记录；本契约是读它、按它换表的那一方。**快照不持久**正是为了不重复拥有 |
| 精确依赖 | 见上；**依赖方向单向**：本契约 → 资产形状、各类正文、求值、资产治理、MCP 桥、放行、身份值；agent loop、meta 门、斜杠命令识别、放行判断读本契约 |
| 接受状态 | 已接受（D-061，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 已接受 v2 精确承诺什么 | [v2 契约](v2/contract.md) |
| 候选 v3 的增量与失败场景 | [S-48～S-50](v3/contract.md#s-48-构成顺序与求值记录)、[实例第 9 节](v3/examples.md#9-显式排列与单次追加) |
| 七个操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v2/contract.md#四操作) |
| 快照在哪几个时刻换，什么都不换它 | [契约 S-15](v2/contract.md#s-15-快照只在这几个时刻换) |
| reload 一族有哪几条、plugin 怎么连带 | [契约 S-23](v2/contract.md#s-23-reload按类别重填) |
| 可用性三个取值、按命令的可用性、替换件 | [契约 S-8](v2/contract.md#s-8-当下可用性的三个取值)～[S-10](v2/contract.md#s-10-替换件同形只换说明) |
| 一次尝试开始时报告里有什么、MCP 逐动作权限从哪来 | [契约 S-11](v2/contract.md#s-11-一次执行尝试的可用性报告)、[S-24](v2/contract.md#s-24-refreshavailability每次执行尝试开始时现算) |
| 权限收回怎么「此刻起不存在」 | [契约 S-20](v2/contract.md#s-20-谁可以用门控哪两类按哪个租户身份什么时候判)、[S-28](v2/contract.md#s-28-onassetchange权限收回之后收窄) |
| 重启之后怎么办 | [契约 S-33](v2/contract.md#s-33-本能力重启与重建) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-31](v2/contract.md#s-31-装配给的保证-vs-协议须给的保证) |
| 走通的路径与每个失败值的反例 | [examples](v2/examples.md) |
| 哪些证据义务已触发、现在到哪一步 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十节](v2/contract.md#十已知缺口) |

## 版本包

`v2/` 含 `contract.md` 与 `examples.md`。**不建 Schema**：线上形状归把这些操作送过进程边界的那份 composition，
值类型引用 `data.asset-model`、`data.tool-definition`、`data.loop-extension`、`data.identity-values`、`data.offer-expiry` 与 `data.skill-package`、`data.slash-command`、`data.mcp-endpoint` 等各类正文契约。
**不建 `formal/`**：单写者、一次提交，被建模方式吸收；理由与触发条件见[验证入口](verification.md#形式工件)。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `capability.asset-registry` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。

## 2026-09-27 v4 候选：原完整填表来源认回

[完整契约](v4/contract.md)与[规范实例](v4/examples.md)形成 candidate，未接受。继承 v3 七操作，仅升级 manifest 依赖到 v4；同 H 表/原 given，reload 同 H CAS，refresh 报告保留 H 时的表，后续追加不强制重做。 v3 已由 [D-073](../../../record/decisions/model-current-input-contracts-adoption/README.md) 接受且保持冻结；上文早期 v3 候选文字为历史记录，现行接受状态以 [registry](../../../registry/README.md) 为准，新增候选不替代 v3。无新 Schema/身份/状态转移；S-51/S-52 的实际证据与未开始项见 [verification](verification.md#v4-候选原完整填表来源2026-09-27)。

[D-079](../../../record/decisions/model-original-fill-adoption/decision.md)接受v4，同H原fill来源与七操作；实现映射另采用，不自动升级runtime/runner依赖。
