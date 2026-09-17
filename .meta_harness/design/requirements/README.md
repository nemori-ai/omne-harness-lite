# 系统需求容器

这里保存需要兑现的结果与确认范围：产品需求、系统目标、全局约束，以及具有持续回顾价值的访谈语境。

失效事件：需求方改主意。契约换版本、实现换方案、上游升级都不改变这里的内容——
它们只可能让某条需求**失去承载者**，那是覆盖关系的变化，不是需求的变化。

## 这里只存条款，不存覆盖

一条需求覆盖哪些契约，归 [registry/covers.json](../registry/README.md#covers)。

理由是形状：需求与契约是多对多关系，不属于任一端。写在需求正文里，
契约一重分解就要遍历全部需求逐个改；而重分解恰恰是最常发生、最该自动正确的事。
覆盖关系以**契约条款**为键，契约拆分后按 `lineage.json` 的条款级 mapping 自动仍然成立。

## 设计覆盖导航

每条需求当前有没有承载者、承载到什么程度，由
[views/coverage-report](../views/README.md) 从 `covers.json`、`catalog.json`
与 realization 的绑定表派生。

**本节不再手工维护状态词与计数。** 上一代结构要求每位语义 owner 在身份新增、拆分、合并、
移除时同步各 topic 的覆盖状态和入口处的分类计数；这类手工汇总的半衰期短于被汇总的内容，
读者无从判断某个数字是刚核对过还是三个月前的残留。

需求 topic 入口仍然写**本主题自己的**确认状态与已知缺口——那是本地事实，owner 说了算。
跨主题的汇总一律派生，且派生物不得被引为依据（见[派生物纪律](../README.md#派生物纪律)）。

## 检索入口

26 个产品主题在 `product/`，7 个系统约束与目标在 `system/`，访谈语境在 `interviews/`。
逐个列举会立刻过期，且与目录本身重复——按目录浏览，或从
[views/coverage-report](../views/README.md) 查某条需求当前有没有承载者。

已完成正式设计并有实施入口的主题：

| 主题 | 设计投影 |
|---|---|
| [PF-026 账号旅程与独立身份](product/PF-026-account-journey-and-isolation/README.md) | [v1](product/PF-026-account-journey-and-isolation/design/v1/projection.md) |
| [PF-001 租户隔离与多组织上下文](product/PF-001-tenant-organization-context/README.md) | [v1](product/PF-001-tenant-organization-context/design/v1/projection.md)（共同前提部分） |

## 准入门槛与停止条件

正式 requirement topic 进入前必须能回答：观察者是谁、在什么情形下触发、需要或禁止什么结果、
来源是否可恢复、确认范围到哪里。任一项不足就不建包，把待答问题留在任务区，**不补造条款**。

需求交流具有持续回顾价值但尚不是正式条款时，进访谈信息包。访谈只保存来源语境，
不自动升级为要求；状态升级由正式 requirement、proposal 或 decision 的 owner 显式完成。
触发与记录边界见[需求归位](../../agents/skills/harness-design-handbook/canonical/references/intake.md#何时自主启记访谈)。

用户明确指定的技术或能力边界照实保留。其余机制设想属于提案，不写进需求正文——
需求里混入机制词汇会让后续分析失去独立判断的余地，也会让「需求本身是否合理」无从复核。

## 新建需求或访谈主题

从本地 `.templates/` 复制对应模板包起步：

```text
requirements/
├── .templates/topic/         正式需求信息包
│   ├── README.md             主题入口与设计覆盖状态
│   ├── requirements.md       需要兑现的结果与约束
│   ├── changes.md            来源、确认范围与变化
│   └── design/               按版本固化的设计投影视图（见下）
├── .templates/interview/     访谈语境信息包
├── product/                  产品主题
└── system/                   系统目标与全局约束
```

## 设计投影视图

每个需求 topic 下的 `design/v<N>/` 保存**该需求当前对应的完整设计投影**，
供实施者作为单一入口：不变量、业务规则、涉及对象、Cordis 建模、绑定与证据、未决 gap，
一页齐备。方法归[设计手册步骤 G](../../agents/skills/harness-design-handbook/canonical/SKILL.md#步骤-g投影视图落盘)。

它**挂在需求上而不是契约上**，因为设计变更的触发源是需求变更，版本跟着需求走，
实施者才答得出「我实施的是哪一版需求对应的设计」；契约有自己的版本线，两者不同频。

它是**派生快照，不是权威**：内容各有来源，坐标与哈希记在同目录 `provenance.json`，
与上游不一致时以上游为准。但它**可以作为实施依据**——因为版本固化后不再变动，
这正是它与 [views/](../views/README.md) 实时视图的区别。

需求或设计变化使某版不再成立时**发布新版本，不原地改旧版**：
正在照着旧版实施的人必须仍能找到他实施的那一版。旧版保留并标注被谁取代。

模板提示和 `{{说明}}` 是填写指导，成稿时替换或移除；不伪造来源、确认或接受记录。
按实际问题裁剪正文，删除不适用文件时同步入口链接，保留影响结论的未知及闭合条件。

## 当前状态

需求正文已整体迁入（116 个文件，含 26 个产品主题、7 个系统约束与访谈信息包）。
`design_legacy/requirements/` 保留为历史原件，不是有效权威。

迁入时有两处不是原样搬运：

- `coverage-obligations.md` 的 197 条义务清单将转为 `registry/covers.json` 的条目。
  该转换**尚未执行**；目前 covers.json 中只有本次设计产生的 10 条覆盖关系，
  其中 9 条已逐条复核（`reviewed: true`），1 条因所覆盖的需求条款状态为
  「继承待核对」而标 `false`。
- 各 topic 入口的「设计覆盖状态」保留本地事实，移除跨主题计数。

**已知的迁移中间状态**：存量 topic 的 README 与正文引用 `research/`、`spec/`、
`providers/`、`architecture/` 下尚未迁入的材料，当前共 143 处断链。
它们指向的内容仍在 `design_legacy/` 中，随相应目录迁入后一并修复；
本次处理的 PF-001 与 PF-026 两个 topic 已指向新结构，无断链。

返回[设计链入口](../README.md)。
