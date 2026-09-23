# DSH Session 格式与落盘：只看消息与条目的数据形状

- 原始出处：`deepseek-ai/deepseek-harness` @ `c291e7961a515f6d7af9304e7fd1d257929aef26`，`SESSION_FORMAT_VERSION = 3`
  （`packages/core/session/src/types.ts:88`）。本地副本同 [dsh-llm](dsh-llm.md)。
- 取得方式：一次性源码与文档阅读（2026-09-23）。读了 `packages/session/{session-format, session-log-deepseek,
  session-persistence-jsonl, session-projection}` 的 README 与 `session-format/src/types.ts`，
  事件形状本体所在的 `packages/core/session/src/{types.ts, surface.ts}`，以及注记
  `2026-09-01-v2-embedded-assistant-streams.md`、`2026-09-06-v3-canonical-session-envelopes.md`、
  `2026-07-02-remove-stream-chunk-mirror.md`（archived）。**只看数据形状与流式落盘，不看会话生命周期。未运行。**
- 来源立场：作者自述。
- 消费对象：[research.md](../research.md) 的落盘、压缩形状与历史包袱各条。

## 当前可消费观察

### S1 会话日志是只增的事件流，消息只是其中四类

`SessionEventMap`（`packages/core/session/src/types.ts:269-400`）：
`turn/start|end`、`step/start|end`、`user/message`、`system/message`、`assistant/message`、`assistant/attempt`、
`tool/call`、`tool/result`、`request/header`、`request/context`、`session/end-seed`，外加插件合并的类型。
事件信封 `{type, seq, time, data, ignorable?, surfaceOp?, sourceEventSeqs?}`（`types.ts:465-488`）；
未识别且未标 `ignorable` 的事件，读者**必须拒绝重建**（`types.ts:474-483`）。
只有 `system/message | user/message | assistant/message | tool/result` 四类会产出发给模型的消息（`types.ts:412-416`）。

### S2 一次模型尝试一份结算，结算里嵌着整条紧凑流

- `assistant/message{turn, step, message, stream: AssistantStreamRecord[], usage?, interrupted?: true}`（`types.ts:321-333`）；
- `assistant/attempt{turn, step, stream}`——失败、重试、取消或流错的尝试，不进模型历史（`types.ts:335`）。
- 注记 v2（`2026-09-01-v2-embedded-assistant-streams.md:19-26`）：v2 起去掉了顶层 `assistant/chunk` 事件，
  每次尝试只提交一份结算；**「只存装配后的成功消息」被明确否决**，理由是会丢失败/放弃的输出、token 边界、时间戳与确定性回放
  （同注记 `:60`；更早的 rejected 提案见 `2026-07-02-remove-stream-chunk-mirror.md:25`）。
- 代价由作者自己写明：v2 在结算之前**没有任何持久的尝试证据**，进程或主机在结算前丢失会丢掉整条在途流；
  瞬态帧 `agent/assistant-stream` 不是预写日志（同注记 `:76`）。

### S3 压缩是「区间替换」，不是「逐块点名」

`SurfaceOp = 'append' | {op:'replace', startSeq, endSeq}`（`types.ts:434-436`）：一个新的消息事件**替换当前模型面上一段连续节点**，
并以 `sourceEventSeqs` 覆盖被遮蔽的全部节点（`types.ts:421-433`）。日志本身不改，只是派生时被遮蔽。
v3 另允许「只改内容的单节点 tool-result 替换」（`2026-09-06-v3-canonical-session-envelopes.md` Decision 第二段）。
**给人看的记录不取模型面**：`isAppendSurfaceEvent` 的注释说模型面会遮蔽被替换区间，「因此不能当人的记录用」，
人的记录取「以 append 进入」的事件，替换副本只给模型（`packages/core/session/src/surface.ts:50-60`）。

### S4 工具调用有独立的日志事件，参数原样

`tool/call{turn, step, callId, name, arguments}`——`arguments` 是模型产出的原始 JSON 字符串，不解析（`types.ts:336-341`）；
`tool/result{message: ToolResultMessage, error?, meta?}`，`meta` 是工具私有的呈现载荷（`types.ts:342-363`）。

### S5 格式版本与迁移链

- `dsh-session-format`：按物理头分类 `current | migration-required | unsupported | malformed`，
  迁移是**只允许相邻整数版本**的有状态流式 stage 链（`packages/session/session-format/src/types.ts:44-230`；README「Known Limitations」）。
- 已发布三条相邻迁移：`session-format-v0-to-v1`、`v1-to-v2`、`v2-to-v3`，三者 `src/*.ts` 顶层合计约 4,700 行（本轮 `wc -l` 计数）。
- v1→v2 把 token 级 chunk 事件改为每次尝试一份结算，**改变了事件基数，于是改写了全部 seq**；每一处同会话引用都要有显式重写规则，
  引用被吞掉的 chunk 则拒绝迁移。作者自评：「这让以后改变基数的迁移在设计上就是昂贵的」（v2 注记 `:40, :78-80`）。
- v2→v3 是规范化信封：模型面事件必须带 `surfaceOp`，替换端点只剩一种拼法，拒绝矛盾的工具失败元数据（v3 注记 Decision 段）。

### S6 JSONL 落盘

`dsh-session-persistence-jsonl`：每会话一个当前 append-only JSONL，历史格式世代以不可变文件保留（默认 zstd 校验帧），
当前格式一行一个持久事件；迁移、压缩、历史解码、撕裂尾恢复都是存储内部细节（README Summary 与 On-disk layout 段）。
`dsh-session-format` README 的已知局限：**恢复后的当前历史整份常驻内存**，O(事件数)。

### S7 投影与向外上传

- `dsh-session-projection`：领域以同步 fold `apply(state, event)` 从已提交事件推出每会话状态，快照标明反映到哪个事件（README Summary）。
- `dsh-session-log-deepseek`：把会话日志后缀随请求上传给 DeepSeek 官方 API，默认关闭；与消息形状无关，本轮只记它存在。

## 局限

- 没读三条迁移的源码本体，只读了 README 与注记对它们的描述；行数是 `cat session-format-v*/src/*.ts | wc -l` 的粗计数。
- 没读 `session-persistence-jsonl` 的实现（`format.ts`、`worker.ts` 等），落盘细节只到 README 层。
