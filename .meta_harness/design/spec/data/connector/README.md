# 连接件

**连接件这一类资产长什么样，以及它交给本系统的东西长什么样**：一份连接件的正文（只有可选的默认来源标识；投递目标与鉴权绑定是持有上的配值）、
由正文推出哪几项属性声明、连接件把一条外部消息交给受理时的**入站信封**——以及一个值不合这些形状时，拒绝值叫什么。

它是 [`data.asset-model`](../asset-model/README.md) v1 里 connector 那一支正文的家（那边 `$ref` 本契约的 `ConnectorDefinition`），
并给受理一侧一个「外部内容在交接那一刻长什么样」的共同定义。**连接件只能送消息进来**：本契约里没有任何一个值能承载读取、管理或控制。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.connector, 1)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-041](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 `accepted`（`acceptance` 指向 D-041 的 `acceptance.json`）。`family=data`、`topic=connector`、
  `contract_path=spec/data/connector/v1/contract.md`，`resources` 另含 `v1/connector.schema.json` 与 `v1/examples.md`；
  依赖五项：`data.asset-model` v1、`data.messages` v1、`data.content-blocks` v1、`data.offer-expiry` v1、`data.identity-values` v1，
  消费的条款见[契约头部的依赖表](v1/contract.md)。**登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：[packages/core/connector](../../../realization/packages/core/connector/README.md)；当前节点设计已由 D-042 接受，源码／实际验证按各节点四层状态分别读取。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。连接件的正文被资产模型、求值、治理写面共享；入站信封被接入端产出、被受理消费——写两遍必然分叉 |
| 稳定身份 | `data.connector`，版本 1 |
| 适用范围 | 一个部署之内；跨进程后要由协议重新兑现的，逐行列在[契约第六节](v1/contract.md#六装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有自己的授权前提。接入端怎样收、受理怎样收下、求值怎样合成，归各自的契约 |
| 精确依赖 | 见上面「catalog 映射」一行；三个外部标识按 `data.identity-values/v1#S-31` 的散文写，**不 `$ref` 它的 `OpaqueIdentifier`** |
| 谁在等它 | `data.asset-model`（connector 那一支的正文）、`capability.asset-evaluation`（推出的属性项）、`capability.asset-governance`（鉴权绑定的写面）、PF-014 的受理、未立的连接件接入端。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份** |
| 接受状态 | 已接受（D-041，2026-09-26） |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/connector.schema.json) |
| 一个值长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md) |
| 鉴权绑定与投递目标为什么不在正文里 | [S-2](v1/contract.md#s-2-鉴权绑定与投递目标不在正文里)——主线裁定，见 [D-040 §S21 S21-a、S21-b](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s21connector报回的) |
| 连接件到底能让本系统做什么 | [S-14 没有读取面，也没有管理面](v1/contract.md#s-14-没有读取面也没有管理面) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#十已知缺口)——**G-4 让属性声明整组判不出来（两项权限的取值未定），G-5 让信封的归属没有落点，G-10 记着 PF-002 rev 19～20 与 PF-014 rev 7 对连接件的改动还没落（等连接件专项讨论）** |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`connector.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**：条款的边界有一半靠「什么被拒、拒绝值叫什么」说清楚。

**本包不建 `formal/`。**本契约没有状态转移，约束都是单个值的形状；唯一的跨值关系（两份信封是不是同一件事）是两个分量的相等。
本契约触发的义务是 Schema 正反实例校验、接收边界的拒绝值、规范场景与静态检查，在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。

## 2026-09-26 版本接受

本次接受 `data.connector` v1 的全部条款，[D-041](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。
