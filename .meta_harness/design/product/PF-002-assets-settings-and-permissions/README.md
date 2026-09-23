---
id: PF-002
title: 设置、权限与资产的展开
status: active
revision: 12
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 范围化对象的四层作用域、三种合成语义、能力标识、official/customized
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
| 被谁展开 | [PF-003 资产的复制与分享](../PF-003-asset-transfer-and-sharing/README.md) 定义资产怎样跨组织流动，[PF-004 装配与存活](../PF-004-agent-definition-and-assembly/README.md) 定义怎样把这些搬进运行时，[PF-012 Agent Loop 与 Run](../PF-012-agent-loop-and-run/README.md) 定义 loop 上**一共有哪些拓展点位置**。三者都依赖本 topic，**方向不能反**：本 topic 不引用它们的结论 |
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
| 哪些是拍板定的，哪些是推导的 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 12**，已定稿（每一类资产的[身份是「类别 ＋ name」](design.md#身份是类别--name其余归实现)，
  其余归实现；配值的最小单位是[属性配值](design.md#组织的设置是视图不是对象)，**挂在资产持有上**；
  [三条层序各答一个问题](design.md#58-三条层序各答一个问题)——**设置是覆盖、同身份的资产是替换、权限是忽略，除非上面锁了**；
  [工作区](design.md#工作区)是**租户持有的一级归属、由目录承载而不是目录本身**，**会话创建时显式指定、不指定就空**，
  挂上就在装配时[自动加载承载目录里的特定文件](design.md#挂上之后它的内容在装配时自动进来)，**只禁得掉它自己提供的那批资产**；
  [禁用](design.md#禁用是逐层配的布尔设置任一层为真即不可见)是逐层配的布尔设置，**任一层为真即不可见**，
  [不可用](../PF-006-tools-and-skills/design.md#63-不可用时装的是同名替换件不是不装)则是**可见但用了一定失败**；
  [设置项分四类](design.md#设置项分四类资产声明每一项时必须标类别)——**落点与身份类和 `immutable` 与权限一样不从工作区来**；
  [official 可被替代，除 meta 与上层锁了的](design.md#55-资产替换的层级)，**同标识替换必须可见**；
  求值[先禁用滤、再同标识取最具体](design.md#56-四步资产求值--组装--投影--层级计算)，**被禁的退出替换、标识退回下一层**；
  [工作区提供的资产，权限项取最严值](design.md#57-工作区那一级不参与权限计算)；
  [斜杠命令](design.md#slash-command)的绑定目标恰有三种——**自定义提示词、一个 skill、一条系统业务流程**，**只由交付面识别、只对人**，交付面动作名与系统流程命令名是保留名；
  [MCP](design.md#mcp) 的每个动作是一个工具条目，**run 开始前重算、run 内不变**；[连接件](design.md#connector)带身份鉴权，接对面哪个账号是持有上的落点与身份类设置）
- 未决项：**两项**——[「能不能用 / 谁可以用」这类项在工作区资产上的最严值](design.md#九未决项)；[③ 型斜杠命令能否自定义](design.md#九未决项)
- 待裁决：**一项**，即上面第一项，见 [decisions §三](decisions.md#三待裁决)
- 技术投影：**尚未开始**

技术投影按 `harness-design-handbook` skill 展开，
产物按其步骤 G 落回本包的 `projection/v1/`。

## 本包的文件

```text
PF-002-assets-settings-and-permissions/
├── README.md         本页：定位、关系、状态
├── design.md         概念、模型、规则、取舍、边界、未决
├── flows.md          旅程、异常分支、状态流转、角色矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
