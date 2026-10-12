---
id: PF-002
title: 设置、权限与资产的展开
status: active
revision: 32
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 范围化对象的四层作用域、三种合成语义、能力标识、official/customized
    - id: PF-020
      for: 工作区来源、身份与实例边界，相关规则按工作区产品设计求值
  extends: []
---

# PF-002：设置、权限与资产的展开

**[PF-001](../PF-001-identity-scope-and-agent-constraints/README.md) 把设置、权限、资产
三者定为「范围化对象」，说清了它们对外的样子——挂在哪一层、多层同时有值时怎么合成。
本 topic 把这三者展开：它们各自是什么，彼此之间是什么关系。**

一句话概括本 topic 的结论：**三者都是组合关系上的东西。**
资产之间组合，资产组装成 agent 也是组合；而设置与权限**附着在具体资产上**，
与资产之间同样是组合关系。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-001](../PF-001-identity-scope-and-agent-constraints/README.md)。直接使用它定义的**四层作用域**、**三种合成语义**、**能力标识**与 **official/customized**，不重复定义 |
| 被谁展开 | [PF-003 资产的复制与分享](../PF-003-asset-transfer-and-sharing/README.md) 定义资产怎样跨组织流动，[PF-004 装配与存活](../PF-004-agent-definition-and-assembly/README.md) 定义怎样把这些搬进运行时，[PF-012 Agent Loop 与 Run](../PF-012-agent-loop-and-run/README.md) 定义 loop 上**一共有哪些拓展点位置**。资产类别、组合与实现求值由本 topic 拥有；Skill、Tool、MCP 选入装配的规则归 PF-004，本 topic 引用该规则，不在这里另定一套 |
| `extends` | 无 |

**与 PF-001 的分界**：同一个字段在多层都有值时听谁的，归 PF-001；
有哪几类资产、一个 plugin 里装了什么、一个 tool 的执行权限长什么样，归这里。
判据是**改动它的原因**——PF-001 因身份模型变，本 topic 因对象的种类或组合形状变。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 资产怎么进来、怎么配、怎么组装，谁能做什么 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的 | [当前规则与范围](design.md) |
| 这块设计怎么演变到今天 | [当前规则与范围](design.md) |

## 状态

区分资产定义数据、执行实现与承载服务；资格过滤不删除会话已知能力身份。本轮为产品规则与消费边界的修订，未据此接受具体 Cordis 插件划分或实现。

区分 reload 的来源刷新范围与构成生效边界；构成变化按 PF-004／PF-012 完整校验并安全交接。本次为产品设计增量，直接裁决与 PM 推导见 decisions；不扩大此前整包接受、规格或实现状态。

- 产品设计：**rev 32**，会话值与共享配置的作用域按 PF-015 明确；承接产品负责人直接裁定的三类能力绑定与自动继承规则；规则正文归 PF-004，本包对齐定义与求值输入。rev 24 工作区一致性增量及 rev 25 残余修正已正式接受（[当前规则与范围](design.md)），原有接受与评审范围不扩张。**rev 20 已正式接受**（产品负责人，2026-09-26，D-065），其接受范围与 OAuth 到期人工重授权的已知缺口保留。接受范围以对应登记为准。
- 搁置范围：连接件是否保留为资产及全部相关接入设计；保留内容不是当前交付要求。
- 待裁决：当前范围无；D-6 属连接件搁置范围，见 [当前规则与范围](design.md)；D-2～D-4 已于 2026-09-24 裁定，D-5 的现行主线裁定已由 D-065 确认

技术投影按 `harness-design-handbook` skill 展开，

## 本包的文件

```text
PF-002-assets-settings-and-permissions/
├── README.md         本页：定位、关系、状态
├── design.md         概念、模型、规则、取舍、边界、未决
├── flows.md          旅程、异常分支、状态流转、角色矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
```


创建、动态部件与持久化的当前规则见 [PF-015 完整矩阵](../PF-015-session-lifecycle-and-ownership/design.md#616-会话组成与创建输入)。本 topic 的本轮变更见 [当前规则与范围](design.md)。

本次产品裁决：连接件是否作为资产存在尚未定论，相关设计整体搁置，不作为当前交付前提。新增裁决的依据与范围见 decisions；不扩大既有整包接受、规格或实现状态。
