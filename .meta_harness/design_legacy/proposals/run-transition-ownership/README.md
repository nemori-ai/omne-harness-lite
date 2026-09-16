# Run 状态与 epoch 转移归属

本主题选择跨 Session、Tools、Driver 与生命周期组合时，谁定义并写入 Run 状态/epoch 转移。推荐
**Run owner 无副作用准备 + CC 原子组合**；推荐不产生接受，`9a58ae2` 的分布式写法已被反例拒绝并冻结。

- 当前状态：完整候选；未接受
- 本次终点与范围：关闭 duplicate epoch close 与跨 owner 原子组合边界
- 输入基线：RN-01/03/05/08、CC-01、LC-03/04、RD-03/14、PF-013.C2/C3/C4/C10

## 准入核对

选择对象、现有 owner、跨能力剩余责任和三个实质候选齐全。候选分别改变写权、协调机制和恢复成本，
不是参数变化；本主题不新增能力维度，只修复既有 Run/组合边界。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现有能力、剩余责任和推荐协议 | [设计正文](design.md) |
| 三个真实候选及反例 | [候选与取舍](alternatives.md) |
| 评审与冻结状态 | [评审记录](review.md) |

## 后续消费

候选由 Run、Session、Tools、RunDriver、lifecycle composition 及其 providers 消费；需独立架构/spec 评审与
exact candidate formal evidence 后才可接受或释放。
