# 连接件

**连接件这一类资产长什么样，以及它交给本系统的东西长什么样**：一份连接件的正文（来源标识与投递目标的默认值）、
由正文推出哪几项属性声明、连接件把一条外部消息交给受理时的**入站信封**——以及一个值不合这些形状时，拒绝值叫什么。

它把 [`data.asset-model`](../asset-model/README.md) v1 里 connector 那一支的不透明正文填实，
并给受理一侧一个「外部内容在交接那一刻长什么样」的共同定义。**连接件只能送消息进来**：本契约里没有任何一个值能承载读取、管理或控制。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.connector, 1)`
- **状态**：`candidate`——未接受、未冻结，不得据此发布或声称消费者已采用
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 `null`）。`family=data`、`topic=connector`、
  `contract_path=spec/data/connector/v1/contract.md`，`resources` 另含 `v1/connector.schema.json` 与 `v1/examples.md`；
  依赖五项：`data.asset-model` v1、`data.messages` v1、`data.content-blocks` v1、`data.offer-expiry` v1、`data.identity-values` v1，
  消费的条款见[契约头部的依赖表](v1/contract.md)。**登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：尚无；连接件接入端本程不投影

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。连接件的正文被资产模型、求值、治理写面共享；入站信封被接入端产出、被受理消费——写两遍必然分叉 |
| 稳定身份 | `data.connector`，版本 1 |
| 适用范围 | 一个部署之内；跨进程后要由协议重新兑现的，逐行列在[契约第六节](v1/contract.md#六装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有自己的授权前提。接入端怎样收、受理怎样收下、求值怎样合成，归各自的契约 |
| 精确依赖 | 见上面「catalog 映射」一行；三个外部标识按 `data.identity-values/v1#S-31` 的散文写，**不 `$ref` 它的 `OpaqueIdentifier`** |
| 谁在等它 | `data.asset-model`（connector 那一支的正文）、`capability.asset-evaluation`（推出的属性项）、`capability.asset-governance`（鉴权绑定的写面）、PF-014 的受理、未立的连接件接入端。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份** |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/connector.schema.json) |
| 一个值长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md) |
| 鉴权绑定为什么不在正文里 | [S-2](v1/contract.md#s-2-鉴权绑定不在正文里)——**偏离了起草账本，待主线确认**（[G-1](v1/contract.md#十已知缺口)） |
| 连接件到底能让本系统做什么 | [S-14 没有读取面，也没有管理面](v1/contract.md#s-14-没有读取面也没有管理面) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#十已知缺口)——**G-2 与 G-4 让属性声明整组判不出来，G-5 让信封的归属没有落点** |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`connector.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**：条款的边界有一半靠「什么被拒、拒绝值叫什么」说清楚。

**本包不建 `formal/`。**本契约没有状态转移，约束都是单个值的形状；唯一的跨值关系（两份信封是不是同一件事）是两个分量的相等。
本契约触发的义务是 Schema 正反实例校验、接收边界的拒绝值、规范场景与静态检查，在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
