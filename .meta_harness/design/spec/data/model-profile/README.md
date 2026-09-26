# 模型档案

**关于一个可被调用的模型的全部事实**——上游认哪个名字、能走哪几家供应商、收得下和给得出哪几种模态、
一次能吃多少吐多少、送进去之前还有什么限制、随它带上哪些请求参数——各是什么形状；
建一条档案时给的那一份长什么样；**怎样指认一行档案**（「用哪个模型」那项设置记的是路由名，落到哪一行按层覆盖）；以及**统一请求参数词表**。

这几样在一份契约里，因为它们被模型请求运行时、Agent 定义的那项设置、会话的选中模型、合法目标的求值、组装、
拓展件与响应留痕**同时读**：[产品正文](../../../product/PF-013-model-profiles-and-invocation/design.md#61-档案是一个对象那项设置的取值是对它的引用)
把档案做成一个对象，正是为了「这个模型看不看得了图」只有一处可问。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.model-profile, 1)`
- **状态**：`candidate`（2026-09-23 起草）。未接受、未冻结；语义可被审阅，不得据此声称消费者已采用
- **catalog 映射**：**已登记**，状态 `candidate`，`acceptance` 为 `null`。`family=data`、`topic=model-profile`、
  `contract_path=spec/data/model-profile/v1/contract.md`，`resources` 另含 `spec/data/model-profile/v1/model-profile.schema.json`
  与 `spec/data/model-profile/v1/examples.md`；依赖三项：`data.identity-values` v1（`S-5`／`S-11`／`S-12`／`S-16`／`S-17`／`S-30`／`S-31`）、
  `data.offer-expiry` v1（`S-22`；实际取的 `Instant` 在它 Schema 的 `$defs` 里，依据是 S-22 末句加上那一处，见[契约抬头](v1/contract.md)）、`data.content-blocks` v1（`S-6`）。登记在 [registry](../../../registry/README.md)，本行只作索引
- **提供者/装配映射**：**尚无。**维护档案的能力（`capability.model-profile-directory`）与模型请求运行时（`capability.model-request-runtime`）已有 v1 候选契约，提供者设计与实现映射节点都还没有

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。档案的形状、建档内容、引用与参数词表被多类消费者共享（[消费者表](v1/contract.md#消费者)），写两遍必然分叉 |
| 稳定身份 | `data.model-profile`，版本 1 |
| 适用范围 | 一个部署之内；跨进程后哪些要由协议重新兑现，见[契约第六节](v1/contract.md#六装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有自己的操作**：建档、改、撤回、读、求合法目标、发请求都是别的能力的操作。本契约只定这些操作共用的值、一条撞名判定的规则与失败值名、以及表示层校验这一次纯计算 |
| 精确依赖 | `data.identity-values` v1（作用域层身份与它的缺席、默认、持久形状、跨边界重验、空白集合）、`data.offer-expiry` v1（时间点）、`data.content-blocks` v1（`Modality`）。`data.model-response`、`data.loop-extension` 是消费者，不是依赖 |
| 谁在等它 | `capability.model-request-runtime`、`capability.model-profile-directory`、`capability.modality-projection`、`capability.asset-registry`、`data.messages`、`data.loop-extension`、`data.model-response`，以及 Agent 定义、会话、合法目标求值、组装——[消费者表](v1/contract.md#消费者)是唯一的一份 |
| 接受状态 | **未接受** |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/model-profile.schema.json) |
| 一条档案长什么样、什么会被拒、拒成哪个值 | [v1 正反实例](v1/examples.md) |
| 我要引用一条档案 | [S-13 ModelProfileRef](v1/contract.md#s-13-modelprofileref)——按 `origin` 两支：官方只带路由名，自建另带所在范围；官方那一支成立的前提是官方档案全在出厂默认层、[S-3 同一范围内路由名唯一](v1/contract.md#s-3-撞名判定同一范围内唯一) |
| 我要建一条档案，该给什么 | [S-28 建档内容](v1/contract.md#s-28-建档内容产生一条档案时给的那一份)——不带在册状态与 `updatedAt`，带了即 `malformed` |
| 我是 adapter，上游不认某一项参数 | [S-21 不静默丢，也不静默改](v1/contract.md#s-21-不静默丢也不静默改) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#十已知缺口) |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`model-profile.schema.json`、`examples.md`。

**本包不建 `formal/`。**理由：在册状态两值之间只有撤回与恢复在册两条边、都是对同一行的写，没有交错可被反驳；
会被并发反驳的是建档操作的「撞名判定与写入同提交」，那条义务落在拥有建档操作的能力契约，不在这里建平行模型；
结构约束都在一份文档之内，Schema 加一步跨字段比较即可完整表达。
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是 Schema 与实例、静态检查与规范场景，在[验证入口](verification.md)登记；除两次未登记的本地实例自检外，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
