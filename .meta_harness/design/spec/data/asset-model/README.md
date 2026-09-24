# 资产模型

**资产领域里每一样东西长什么样**：能力标识怎么拼、一份资产记录带什么、版本线怎么编号、八类正文的外壳、
资产自带的属性项与各格为它配下的值、一份持有由谁持有、资格从哪来、复制血缘记什么、工作区承载目录里那份清单文件长什么样——
以及一个值不合这些形状时，拒绝值叫什么。

它是块 A 的**共用数据底座**：求值（`capability.asset-evaluation`）、治理写面（`capability.asset-governance`）与流转（`capability.asset-transfer`）
三份能力契约都读写这些形状，**引用它的 `$defs` 名，不各自复述一份**。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.asset-model, 1)`
- **状态**：`candidate`——未接受、未冻结，不得据此发布或声称消费者已采用
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 `null`）。`family=data`、`topic=asset-model`、
  `contract_path=spec/data/asset-model/v1/contract.md`，`resources` 另含 `v1/asset-model.schema.json` 与 `v1/examples.md`；
  依赖三项：`data.identity-values` v1（`S-3`、`S-5`、`S-6`、`S-8`、`S-11`、`S-12`、`S-16`、`S-22`、`S-31`、`S-34`）、`data.offer-expiry` v1（`S-22`）、`data.content-blocks` v1（`S-20`）。
  **六份正文契约不登为依赖**：壳 `$ref` 它们是结构上的前提，它们反过来消费本契约（catalog 须无环）。
  **登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。这些形状被三份能力契约、各类正文契约、注册表与装配共享，写两遍必然分叉；`data.identity-values` v1 的 CS-1、CS-2、CS-6 点名资产领域的 owner 为第一消费者，它的 G-07 把工作区键「目录那一半」留在这里 |
| 稳定身份 | `data.asset-model`，版本 1 |
| 适用范围 | 一个部署之内；跨进程后要由协议重新兑现的，逐行列在[契约第四节](v1/contract.md#四装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有自己的授权前提。记录怎样被写、持有怎样被求值、复制怎样落地，归三份能力契约 |
| 精确依赖 | 见上面「catalog 映射」一行；四个不透明标识按 `data.identity-values/v1#S-31` 的散文自定义，**不 `$ref` 它的 `OpaqueIdentifier`** |
| 谁在等它 | 三份资产能力契约与注册表；六份正文契约（推出规则的义务）；`data.call-accounts`（规范串）；注册表与装配。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份** |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/asset-model.schema.json) |
| 一个值长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md) |
| 一个值有好几处不对，报哪个拒绝值 | [S-27 表示层拒绝值](v1/contract.md#s-27-表示层拒绝值)与[实例第 13 节](v1/examples.md#13-几处违例同时出现时取哪个拒绝值) |
| 我是正文契约，推出属性项要守什么 | [S-12](v1/contract.md#s-12-属性声明由正文推出)、[S-13](v1/contract.md#s-13-设置项类别)、[S-15](v1/contract.md#s-15-disabled-是保留项名)、[S-36](v1/contract.md#s-36-usableby-是保留项名)、[S-23](v1/contract.md#s-23-凭据引用) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#八已知缺口)——**G-6（Agent Definition 的正文）与 G-9（plugin 的正文）**；2026-09-23 那批主线裁定待产品负责人确认（G-13） |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`asset-model.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**：条款的边界有一半靠「什么被拒、拒绝值叫什么」说清楚。

**本包不建 `formal/`。**本契约没有状态转移；它的结构约束 Schema 与条款即可表达，
求值链上的结构性质（团队资产不出那棵树、锁截断、禁用析取、工作区滤权）归 `capability.asset-evaluation` 的 Alloy 模型。
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是 Schema 正反实例校验、接收边界校验、规范场景与静态检查，在[验证入口](verification.md)登记；除 V-1 跑过一次本地自检外，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
