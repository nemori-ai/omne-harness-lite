# 从 `meta-harness-*` 工作树取回的形式模型

2026-09-20，在准备退役 `meta-harness-*` 系列工作树之前，按**模型内容指纹**把它们与本目录
比了一遍，取回四份本目录完全没有的。

> **取回来的只是「可能有用」，所以暂时留着。**
> **不是必须被用到的，也不代表一定就有价值。**
> 读完判断用不上就删，这是合理的结论——**不需要先证明它没用**。

## 取回了什么

| 模型 | 放在 | 来自 | 它编码的是 | 今天谁可能用得上 |
|---|---|---|---|---|
| `HookAdmission`（226 行） | `capabilities/external-hooks/v1/formal/` | `meta-harness-e-formal` | 外部挂钩**什么时候被受理** | [PF-012 的 Loop 拓展点](../../design/product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点) |
| `HookContinuation`（161 行） | 同上 | 同上 | 挂钩返回之后**怎么接着走** | 同上，尤其「[挂件只能靠改日志起作用](../../design/product/PF-012-agent-loop-and-run/design.md#69-拓展件只能靠改日志起作用)」 |
| `RunEpochBarrier`（347 行） | `capabilities/run-driver/v1/formal/` | `meta-harness-rn05-formal` | **epoch 屏障**——跨代之间什么不许穿过去 | [PF-012 的执行尝试](../../design/product/PF-012-agent-loop-and-run/design.md#执行尝试)与「[新的一次尝试不铸新身份](../../design/product/PF-012-agent-loop-and-run/design.md#62-新的一次尝试不铸新身份)」 |
| `ForceStopSafety`（308 行） | `compositions/session-run-agent-lifecycles/v1/formal/` | `meta-harness-rn05-formal` | **强停之后到哪一步才算安全** | [PF-012 的「被取消」](../../design/product/PF-012-agent-loop-and-run/design.md#被取消不在这张表里因为它不是一行)与终态吸收 |

**四份都是本目录二十八个模型里没有的。**其余工作树里的模型，内容与本目录已有的相同，
或者是本目录已有更新版的旧版本——**那些没取**。

## 为什么是这四份

它们各自对着一个**今天刚定形、明天要形式化**的产品结论：

- PF-012 rev 3 刚把 Loop 拓展点定成十一个位置，并立下「挂件只能靠改日志起作用」。
  `HookAdmission` 与 `HookContinuation` 是**上一轮在同一个问题上算过的一遍**——
  受理条件与续跑条件当年是怎么划的，值得对照着看。
- PF-012 rev 3 刚补上「被取消不在转移表里」「终态是吸收态」。
  `ForceStopSafety` 编码的正是强停到安全释放之间那一段。
- 「一次 Run 可能有好几次尝试，而账和失败还是一笔」需要一个跨代不变量。
  `RunEpochBarrier` 是当年给出的一种写法。

## 它们不是什么

- **不是当前契约，也不是接受依据。**它们属于已退役的设计链；新体系任何一条性质要成立，
  得有它自己的接受记录与证据。
- **不是必须继承的语义。**新的 PF 从产品问题出发重做，**得出不同结论是正常的**，
  不必解释为什么偏离。
- **不保证跑得起来。**本次迁入**没有重新运行**，也没有核对它们依赖的其他模块是否齐备。
  `.cfg` 里引用的常量与不变量名，可能指向那些工作树里才有的定义。
- **不构成对那几个工作树的完整抢救。**这次只按「本目录有没有同内容的模型」筛过一遍，
  **契约正文、提案讨论、评审记录都没有看**。要那些东西得回到对应分支自己找。

## 来源分支怎么找回

四个工作树的分支都还在（**只退役工作目录，分支与提交未删**）：

```sh
git branch -a | grep meta-harness-          # 分支还在
git log --oneline main..feat/meta-harness-e-formal
git show feat/meta-harness-rn05-formal:.meta_harness/design/spec/capabilities/run-driver/v1/formal/RunEpochBarrier.tla
```

**`meta-harness-personal-formal` 当时另有一批未提交改动**（把 `MixedProgress.cfg` 拆成
七个更细的 progress 属性，并改了 `run_checks.py`），**那批东西不在任何提交里**——
退役那个工作目录之前需要单独处置。
