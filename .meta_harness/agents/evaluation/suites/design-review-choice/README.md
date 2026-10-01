# design-reviewer 判「选择」

量的是：给 [design-reviewer](../../../roles/design-reviewer/role.md) 一份架构设计的待审稿、让它判「选择」这一种，
它能不能把设计选择里的已知问题报出来，同时保持只读、只做这一种判断。判据页是手册的 `references/review/choice.md`。

状态：**用例待签字，判定方法待签字，还没有基线。**

模型：Claude Fable 5.1、xhigh（角色文件的钉值）。

## 材料

| 材料 | 是什么 | 应当被报出 | 来源 |
|---|---|---|---|
| `raf-derived-node` | realization 节点 `session/run-attempt-facts-derived` 的 design.md，种入后当作一轮候选修订 | 6 处（C1～C6） | 主会话为 [2026-10-01 的对照](../../design-reviewer-merge-2026-10-01/README.md)写的，原样迁入 |
| `raf-derived-node-clean` | 同一个节点，不种入 | 无（对照） | —— |

[calibration/](calibration/) 里是对照中新角色两次运行的人工逐条判定。

## 量不出什么

- 判据页列了四种待审对象（读数、能力边界的选择、一批契约的语义整体、realization 节点），种入材料只有节点这一种。
- 种入的 6 处是主会话写的，比真实待审稿里的问题更显眼，写的人与被测模型同源；它们由同一份报告判，不独立。
