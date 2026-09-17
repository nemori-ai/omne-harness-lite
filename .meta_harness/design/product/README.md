# 产品设计

这里保存产品**是什么**：每个 topic 一个包，承载该块的概念定义、模型、产品规则、
取舍、验收标准，以及它是怎么演变到今天的。

失效事件：产品方向改变。技术方案换了、上游升级了、实现重写了，这里一个字不动。

**这里不叫「需求」。**那个词暗示内容是被动接收的转述，而实际上这些是设计——
概念怎么定、模型什么形状、边界画在哪，都是判断的结果。
进入本目录的工作方式见 [AGENTS.md](AGENTS.md)。

## 当前 topic

| Topic | 状态 | rev |
|---|---|---|
| [PF-001 身份、范围与对 Agent 的约束](PF-001-identity-scope-and-agent-constraints/README.md) | active | 5 |
| [PF-002 设置、权限与资产的展开](PF-002-assets-settings-and-permissions/README.md) | active | 1 |
| [PF-003 资产的转移与分享](PF-003-asset-transfer-and-sharing/README.md) | active | 1 |
| [PF-004 Agent 运行时——定义、装配与实例](PF-004-agent-runtime-assembly-and-liveness/README.md) | active | 2 |
| [PF-005 执行环境与沙箱](PF-005-execution-environments-and-sandboxes/README.md) | active | 1 |

## 一个 topic 包含什么

```text
PF-0NN-<slug>/
├── README.md         定位、关系声明、状态              ← 必须
├── design.md         概念、模型、规则、取舍、边界、未决  ← 必须
├── flows.md          旅程、异常分支、状态流转、角色矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决        ← 必须
├── changelog.md      产品设计本身的演进（rev N）        ← 必须
├── interviews/       设计交流笔记（原始材料）
└── projection/       向 Cordis 的技术设计投影，按版本固化
```

四个必须的分别回答**是什么**、**谁定的**、**怎么变的**、**在哪**。
其余按实际情况取舍：没有多步旅程就不必有 `flows.md`。

**静态与动态分开**：`design.md` 说产品是什么，`flows.md` 说它怎么动。
研发查「这步失败了怎么办」去 flows，查「这个概念是什么」去 design。

## topic 之间怎么建立联系

关系声明在每个 topic 的 `README.md` front-matter，是唯一的机器可读处：

```yaml
relations:
  supersedes: [PF-0NN]          # 取代：对方全部内容被吸收，对方进 archive
  depends-on:                   # 依赖：引用对方定义，不重复展开
    - id: PF-0NN
      for: 一句话说明引用它的什么
  extends: []                   # 发展：扩展对方范围，对方继续有效
```

反向关系（谁依赖我）由工具派生，**不手写**——手写的反向索引每次重组就作废。

## 准入

建一个新 topic 之前必须能回答：

- 这解决谁的什么问题？（写不出「背景与问题」的 topic 不该存在）
- 不做会怎样？
- 边界到哪？它与现有 topic 的区别是什么？
- 改动它的原因，和改动现有 topic 的原因一样吗？（一样就不是新 topic）

答不上来就先不建包，把待答的问题留在交流笔记里。
**不要先创建空 topic 等着以后补齐**——空壳会被当成已有设计。

## 与技术设计的关系

产品设计是技术设计的**输入**，不是它的一部分：

```
product/<topic>/design.md   ──→  设计手册 A–G  ──→  spec/ · realization/
      （产品是什么）                                    （怎样实现）
                                      │
                                      └──→  product/<topic>/projection/vN/
                                            （投影视图，落回本 topic）
```

两者作者视角不同。产品设计不做技术判断；技术设计不改产品语义。
投影视图落回 topic 是为了让实施者有单一入口，它是派生快照而非权威。

## 数据字典的边界

概念的**业务属性与业务约束**写在 `design.md` 的概念定义里；
精确的数据结构、类型、格式归 [spec/](../spec/README.md) 的 Schema。

判据：这条约束产品负责人能看懂并判断对错吗？能，写产品侧；不能，归技术设计。
两边各写一份完整字段规格必然不一致。

返回[设计链入口](../README.md)。
