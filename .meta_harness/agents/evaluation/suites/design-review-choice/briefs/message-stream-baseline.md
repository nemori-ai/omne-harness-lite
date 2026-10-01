你被派来评审一份提案的选择：消息的数据契约、到达语法与流装配器这三层，各以谁为起点。

- **设计工作区**：`{WORKDIR}/.meta_harness`（当前目录 `{WORKDIR}` 是承载它的仓库根）。
- **待审对象**：提案 `.meta_harness/design/record/proposals/message-and-stream-baseline/` 首稿，
  三份文件 `README.md`、`design.md`、`alternatives.md`。精确快照：本检出的 HEAD。
  四个候选：A 以 DSH `llm/llm` 为起点扩展、B 以 pi-ai 的类型为起点、C 全部自研、D 逐层混合；作者推荐 D，尚无接受。
- **依据**：提案 README「输入基线」列出的产品正文（PF-009 rev 5 与 PF-013 rev 5、rev 6 待产品负责人确认）、
  统一语言词条、决定 D-019 与 D-026、全局约束；研究在 `.meta_harness/research/message-model-and-stream-sources/`
  与 `.meta_harness/research/model-request-transport-sources/`。
- **上游源码不在这份副本里**：DSH 与 pi 的一手源码没有随副本提供。上游行为以那两份研究的笔记与报告为证据；
  笔记没有覆盖的上游行为按未取证处理。
- **范围**：推荐 D 是否成立——三层的边界与承载，必须兑现的性质在 D 下各有没有保护点，内核不给的保证由谁给，
  代价是否如实标价，落选方的最强论证。设计链里还没有消息或流的契约与节点；不审文本表达。
- **状态**：提案未接受。
- **只读**：不写任何文件，结果在返回消息里交付。
- **本次判断：选择。**
