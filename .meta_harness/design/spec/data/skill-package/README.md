# 技能包

**一份技能资产版本的全部内容长什么样**：`SKILL.md` 的清单头（Agent Skills 开放格式的六个键）与正文、包内资源的条目与路径、
本项目的包内定义记录（组合的工具清单、外部服务依赖、设置项声明、执行环境要求）、由包得出的依赖声明与属性项投影规则，
以及 `SKILL.md` 的文本形式与包的目录形式怎样读成这份表示——还有一个值不合这些形状时，拒绝值叫什么。

它是 `data.asset-model` v1 里 skill 类正文的形状（那边的 S-10 `$ref` 本契约）；注册表、`Skills()`、斜杠命令的 ② 型展开、工作区读入与外部技能目录的导入
都读这一份形状，**引用它的 `$defs` 名，不各自复述一份**。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.skill-package, 1)`
- **状态**：`candidate`（2026-09-23 起草，2026-09-24 整批对齐，同日按第一轮独立评审处置修订，见[独立评审](verification.md#独立评审)；修复波 1b 把执行环境要求改为定义记录的固定成员，见[变化的影响](verification.md#变化的影响)）——未接受、未冻结，不得据此发布或声称消费者已采用
- **catalog 映射**：已登记为 `candidate`（`acceptance` 为 `null`）。`family=data`、`topic=skill-package`、
  `contract_path=spec/data/skill-package/v1/contract.md`，`resources` 另含 `v1/skill-package.schema.json` 与 `v1/examples.md`；
  依赖三项：`data.asset-model` v1（`S-2`、`S-3`、`S-9`、`S-10`、`S-12`、`S-13`、`S-15`、`S-36`）、`data.content-blocks` v1（`S-7`）、
  `data.tool-definition` v1（`S-9`、`S-11`、`S-18`、`S-26`）。
  **登记在 [registry](../../../registry/README.md)，本行只作索引**
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。技能包的形状被资产模型、注册表、`Skills()`、斜杠命令、工作区读入与导入器共享，写两遍必然分叉；`data.asset-model` v1 的 S-10 与 G-5 把 skill 类正文留给「skill 包的数据契约」 |
| 稳定身份 | `data.skill-package`，版本 1 |
| 适用范围 | 一个部署之内；跨进程后要由协议重新兑现的，逐行列在[契约第五节](v1/contract.md#五装配给与协议给) |
| 为什么是 data 而不是 capability | 它**没有操作**：没有提交点、没有状态转移、没有自己的授权前提。技能怎样被装载、取用、运行、持有与配值，归注册表、`Skills()`、执行运行时与资产的三份能力契约 |
| 精确依赖 | 见上面「catalog 映射」一行 |
| 起点 | [D-034](../../../record/decisions/skill-spec-adoption/README.md)：Agent Skills 开放格式为载体与核心字段、规则层自持、扩展声明走包内定义记录；开放格式钉 `69ef37e` |
| 谁在等它 | `data.asset-model`（壳 `$ref` 本契约）、`capability.asset-registry`、`Skills()` 的契约、斜杠命令的数据契约、`capability.asset-evaluation`、导入器。完整清单见[契约的消费者表](v1/contract.md#消费者)——**那里是唯一的一份** |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 交换与存储表示 | [v1 Schema](v1/skill-package.schema.json) |
| 一个值长什么样、什么会被拒、拒绝值叫什么 | [v1 正反实例](v1/examples.md) |
| 一份 `SKILL.md` 读出来的清单头与正文是什么 | [S-20](v1/contract.md#s-20-skillmd-的文本形式与定界)与[实例第 6 节](v1/examples.md#6-skillmd-的文本形式) |
| 一个包有好几处不对，报哪个拒绝值 | [S-24](v1/contract.md#s-24-表示层拒绝值与判定次序)与[实例第 8 节](v1/examples.md#8-几处违例同时出现时取哪个拒绝值) |
| 哪里在等裁决 | [已知缺口](v1/contract.md#九已知缺口)——**G-6（资源字节的摘要）、G-7（未收的扩展）**；G-3、G-4 已由产品正文闭合（PF-002 rev 19、PF-007 rev 17 §9.3） |
| 哪些条款有怎样的证据义务，现在到哪一步 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是本契约的候选版本目录。规范工件恰三份：`contract.md`、`skill-package.schema.json`、`examples.md`——
**实例是规范工件，不是说明材料**：文本形式与目录形式的读法有一半靠「读出什么、什么被拒」说清楚。

**本包不建 `formal/`。**本契约没有状态转移；它的结构约束由 Schema 的条件与条款直接表达，唯一的跨对象结构性质（组合图不得成环）归装配。
[规格模板对此的要求](../../README.md#按需展开形式化工件)是「已触发的义务不因 optional 而消失」——
本契约触发的义务是 Schema 正反实例校验、接收边界校验、两种读法的用例、规范场景与静态检查，在[验证入口](verification.md)登记，状态**一律为「未开始」**。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[数据契约](../README.md)。
