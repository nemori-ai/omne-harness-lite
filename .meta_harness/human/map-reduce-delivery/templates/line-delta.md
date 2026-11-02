# line-delta 模板

Reduce 在线父卡上为每条存续线发布 delta，idle 线也发。delta 是人读评论。首行标记与固定项归[线会话记录](../../../../docs/engineering/integration.md#线会话记录)，收口顺序归[收口顺序](../../../../docs/engineering/map-reduce-states.md#收口顺序)。本模板只给评论正文的样式。

复制下面的代码块作为评论正文。每个占位都替换成实际值。

```markdown
<!-- line-delta -->

## delta：<线>，波 <w>

| 项 | 内容 |
| --- | --- |
| 波 | <本条 delta 指向的波> |
| 宿主与会话 | <本波的承载宿主与主代理模型。宿主或模型与上一波不同时，写明这条线开新会话；相同时写明继续用同一会话。idle 写「不变」> |
| F | <下一次开工的收口点，完整 SHA> |
| 线轨道同步 | <从 F 执行 FI 的源头、目标头与合并提交。idle 或 terminal 写原因> |
| assignment | <active、idle、redo 或 terminal>。依据：<原因与链接> |
| 任务与 binding | <线父卡上本波 attempt 的派发评论与 binding 链接，本波另有卡时逐张列出。redo 写新 attempt。idle 与 terminal 写「无」> |
| 线包 | <本波线包的评论链接。idle 与 terminal 写「无」> |
| 等待 | <Line 下一步等待的对象与命令> |

### 变化

- 原候选到最终候选：<改动与原因>
- 外域变化：<公开契约、拥有者与精确修订>
- 消费者迁移：<reduce 已完成的迁移，及 Line 下一波要采用的内容>
- 工具与技能版本：<变化，或「无变化」>
```

各 assignment 的写法：

- active：写线父卡上下一波的 attempt 与线包链接。成果、判据与边界在线包里，delta 不复述。Line 核对从 F 到线轨道的实际 FI 结果后，从 attempt 的 taskBase 建本波线父分支，在父分支工作树上运行 `start`，不重放旧补丁。
- idle：写轮空原因与相关变化。不建虚假任务或 PR。Line 继续等待下一条 delta。
- redo：reduce 先更正输入，在线父卡上登记新 attempt，再发 redo。redo 不推进波号。
- terminal：写明完成、限定接受或取消，及最终报告的入口。空队列不能推断为 terminal。

同一次收口的各 delta 的 F 必须一致。Line 按发布顺序逐条读取，不跳过 idle delta。

## 存续线续波时带上的信息

一条线固定由一种宿主承载。宿主或主代理模型变了，就为这条线新开会话，并在本 delta 的「宿主与会话」项写明。旧宿主的读数不能直接套用到新宿主：派发台账里的档位经验只覆盖出读数的那一个宿主，新宿主上要从头积累。宿主未变时写「继续用同一会话」，不重发首次消息。

新旧模型的能力对照只作心智映射，不作档位依据。档位仍按角色策略在当前宿主上的解析结果取值。

## 开工门槛

每次 active 的 delta 都对接收方重申一遍，短版四条：

1. 先理解本波需求。
2. 有歧义直接问 Reduce，用本地会话消息，一次一个具体问题。
3. 再写 `spec.md` 与 `plan.md`，切闭包。
4. 最后才派第一批子代理，只派不依赖未决项的。

顺序与判法归 `work-paradigm.md`「开工门槛」，本模板不复述规则原文。

## 卡与 delta：默认不建卡

上一波留下的 deferred 与已知限制，能由本波既有卡承接的写进 delta 与线包；承接不了的先按已知限制收；仍然不行就在本波既有卡里就地补。三句都否决才建卡，建之前先说明现有卡为什么装不下。

**默认不建卡。建卡成本很大**：一张卡要多走一遍建卡、认领、准入、gate 与交接报告，等待时间成倍增加，还多一个要维护的正文。判据不在「这件事要不要做」，而在「这件事装不装得进已有卡」。

## 台账

派发流水由本线负责人自己维护，路径 `tmp/line-<线>/delegate/flow.jsonl`。Reduce 在跨线集成完成后汇总五条线的流水写进批次，写回 `.meta_harness/agents/evaluation/dispatch-ledger/ledger.json`。口径归 `delegate` 的[台账口径](../../../../.meta_harness/agents/skills/delegate/canonical/references/ledger.md)。
