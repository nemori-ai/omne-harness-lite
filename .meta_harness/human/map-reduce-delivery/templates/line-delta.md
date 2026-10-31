# line-delta 模板

Reduce 在线父卡上为每条存续线发布 delta，idle 线也发。delta 是人读评论。首行标记与固定项归[线会话记录](../../../../docs/engineering/integration.md#线会话记录)，收口顺序归[收口顺序](../../../../docs/engineering/map-reduce-states.md#收口顺序)。本模板只给评论正文的样式。

复制下面的代码块作为评论正文。每个占位都替换成实际值。

```markdown
<!-- line-delta -->

## delta：<线>，波 <w>

| 项 | 内容 |
| --- | --- |
| 波 | <本条 delta 指向的波> |
| F | <下一次开工的收口点，完整 SHA> |
| 线轨道同步 | <从 F 执行 FI 的源头、目标头与合并提交。idle 或 terminal 写原因> |
| assignment | <active、idle、redo 或 terminal>。依据：<原因与链接> |
| 任务与 binding | <任务卡与卡上的 binding 链接。redo 写新 attempt。idle 与 terminal 写「无」> |
| 等待 | <Line 下一步等待的对象与命令> |

### 变化

- 原候选到最终候选：<改动与原因>
- 外域变化：<公开契约、拥有者与精确修订>
- 消费者迁移：<reduce 已完成的迁移，及 Line 下一波要采用的内容>
- 工具与技能版本：<变化，或「无变化」>
```

各 assignment 的写法：

- active：写下一波的任务卡、binding 与验收。Line 核对从 F 到线轨道的实际 FI 结果后，从真实线轨道头建立工作卡 binding，不重放旧补丁。
- idle：写轮空原因与相关变化。不建虚假任务或 PR。Line 继续等待下一条 delta。
- redo：reduce 先更正输入，在任务卡上登记新 attempt，再发 redo。redo 不推进波号。
- terminal：写明完成、限定接受或取消，及最终报告的入口。空队列不能推断为 terminal。

同一次收口的各 delta 的 F 必须一致。Line 按发布顺序逐条读取，不跳过 idle delta。
