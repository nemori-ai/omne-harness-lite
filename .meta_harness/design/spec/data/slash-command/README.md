# 斜杠命令

**人在交付面上敲的一行 `/…`，是什么、指向什么、怎么认、怎么解**：一份 `slash_command` 资产的正文长什么样（命令名与保留前缀、恰一个绑定目标、参数声明、提示词模板的占位符），
交付面上一段输入是普通文字、字面发送还是一次命令尝试，以及一次命令尝试按会话斜杠命令集解析成什么——展开的文字、所指的技能、所指的系统业务流程与参数，或一个带原因与位置的失败值。

识别与解析是**纯函数**：交付面的两种呈现形式与受理面各跑一遍，必须得出同一个答案，所以写成一份共用的数据契约与一张判定用例集，**不各自实现一套同义规则**。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.slash-command, 1)`
- **状态**：`candidate`——未接受、未冻结，不得据此发布或声称消费者已采用
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 `null`）。`family=data`、`topic=slash-command`、
  `contract_path=spec/data/slash-command/v1/contract.md`，`resources` 另含 `v1/slash-command.schema.json` 与 `v1/examples.md`；
  依赖三项：`data.asset-model` v1（`S-2`、`S-3`、`S-5`、`S-10`、`S-12`、`S-15`）、`data.content-blocks` v1（`S-8`）、`data.identity-values` v1（`S-8`、`S-31`）。
  **`data.skill-package` v1 这项依赖暂未登记**——它同批并行起草、不在本工作树（[G-2](v1/contract.md#十已知缺口)）。
  **登记在 [registry](../../../registry/README.md)，本行只作索引**
- **起点方向**：[D-036](../../../record/decisions/slash-command-parsing-baseline/decision.md)（自研统一解析器，从 Codex 借识别边界、从 omne-next 借失败纪律与声明优先、从 Claude Code 借占位符与留痕形状）
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。命令定义被注册表、求值、治理写面共享；识别与解析被交付面（两种呈现形式）与受理面共享——**两处算出不同答案，人读与机读的记录就分叉**，写两遍必然分叉 |
| 稳定身份 | `data.slash-command`，版本 1 |
| 适用范围 | 一个部署之内；交付面与受理面分成两个进程、两种语言之后要由协议重新兑现的，逐行列在[契约第六节](v1/contract.md#六装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有授权前提。识别与解析是纯计算；命令集怎样装与换、受理怎样展开与分派、流程怎样执行，归各自的能力契约 |
| 精确依赖 | 见上面「catalog 映射」一行；`CommandName` 按主线裁定自写 pattern、暂不 `$ref` `data.asset-model` v1 的 `CapabilityName`（[G-1](v1/contract.md#十已知缺口)） |
| 谁在等它 | 交付面呈现与受理契约、受理契约（都未立）；同批的 `capability.asset-registry`、`capability.asset-evaluation`、`capability.asset-governance`；`data.asset-model` 与 `data.content-blocks` 的下一次对齐。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份** |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/slash-command.schema.json) |
| 这一行输入会得出什么——识别、解析、失败的原因与位置 | [判定用例集](v1/examples.md#4-判定用例集)（50 行，机检格式） |
| 一份命令定义什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md)与 [S-28 表示层拒绝值](v1/contract.md#s-28-表示层拒绝值) |
| 名字能不能用 `omne-official:` 开头 | [S-3](v1/contract.md#s-3-保留区与它唯一的拼法)、[S-4](v1/contract.md#s-4-保留区只归系统提供的命令型)、[S-5](v1/contract.md#s-5-保留名在系统内唯一没有优先级) |
| 没权限的命令敲下去得到什么 | [S-16](v1/contract.md#s-16-名字只按会话斜杠命令集认)：与不存在的名字逐成员相同 |
| 哪里在等裁决 | [已知缺口](v1/contract.md#十已知缺口)——**G-3（引号没闭合的失败原因值）挡住带参数声明的命令的一种失败；G-4（留痕块形状）与 G-5（「谁可以用」的项名与默认值）挡住受理与求值** |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`slash-command.schema.json`、`examples.md`——
**判定用例集是规范工件，不是说明材料**：识别与解析是函数，它们的边界靠「这一行字得出什么」说清楚。

**本包不建 `formal/`。**本契约没有状态转移；结构约束 Schema 与条款即可表达，识别与解析是全函数，
证据形式是判定用例集在每一个实现上跑通。[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
