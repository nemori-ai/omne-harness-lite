# minimal-runtime：DSH fork 一步之后的现状（非上游证据）

- 原始出处：本仓库分支 `feat/minimal-runtime` @ `d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`，工作树 `.worktrees/minimal-runtime`。
  **未进 main。**下文路径都相对该工作树根。
- 取得方式：一次性源码与文档阅读（2026-09-23）。读了 `packages/model/llm/{README.md, provenance.json, src/index.ts, src/types.ts}`
  并与其 `upstream/` 原件做了 `diff`；`docs/proposals/core-capabilities/fork/llm-source.md`；
  `packages/session/message-stream/{README.md, design.md, src/types.ts}` 与 `src/host.ts`、`src/cursor.ts` 的相关段；
  `packages/media/content/{README.md, provenance.json, src/types.ts}` 的导出。**未构建、未运行测试。**
- 来源立场：**本项目自己未合入的实现与说明**。它不是上游事实，也不是已接受的设计；
  这里只用来说明「DSH 零件被 fork 一步之后丢了什么、加了什么」，以及一个消息投递面已经怎么切。
- 消费对象：[research.md](../research.md) 的「fork 后丢失的保证」「投递面与消息模型是两件事」两条，以及对照表的第三列。

## 当前可消费观察

### M1 `@omne-harness-lite/llm` 是 DSH `dsh-llm` 的纯零件切片

- `provenance.json` 逐文件记录上游路径、SHA-256 与改动说明，commit 为 DSH `c291e796…`，归档 SHA-256 `f08cfc86…0860`（与本 topic 的 DSH 副本同源）。
- 与 `upstream/` 原件 diff：`types.ts`、`message.ts`、`assembler.ts`、`assistant-stream.ts` 的改动只在 import 来源与格式化；
  内容块、`StreamChunk`、`FinishReason`、`BlockAssembler` 算法、紧凑流记录**语义不变**（`src/types.ts:67-79, 107-119`）。
- 入口注释：「只选纯 dsh-llm 源机制；**无 adapter 注册表或网络运行时**」（`src/index.ts:1`）。
- 被排除的，按 `docs/proposals/core-capabilities/fork/llm-source.md`：完整 `LlmRuntime`、adapter 注册、重试、`invariant`、
  `content`（图/文件的请求投影）均未编译（`:63-64, 80`）；`properties.spec.ts` 因依赖 fast-check 未导入（`:78-79`）。
  该页自己记下「缺少 finish 时按普通 stop 处理」（`:28`）。

**推论（非观察）**：DSH 里把「adapter 抛错 → 终止 chunk」（dsh-llm D6）与「流语法、usage 只一次、必须有结局」（dsh-llm D5 的不变量伴件）
兜住的两层都不在这个切片里；切片里剩下的装配器本身对这两条是宽容的。

### M2 `media/content` 只有引用与尺寸

`packages/media/content` 取自 DSH `packages/attachment/attachment` 的品牌、类型、错误与请求图片尺寸计算（`provenance.json` 的 `files`）；
README 与 `llm-source.md:「有限媒体辅助」`一节写明附件服务、上传准入、解码、持久存储与请求版本后端都未导入。**没有语音、没有块上的文本字段。**

### M3 `session/message-stream` 是投递面，不是消息模型

- 职责自述：为一个 Session 把「projection owner 的已提交批次与快照」和「已注册执行源的瞬态公开状态」合成一条客户端流；
  **不写事实**，断开订阅不停止任何工作（`packages/session/message-stream/README.md` 第一段；`design.md:1-9`）。
- `Frame{kind, dedupKey, subject{tenant, session, run?, step?, call?, attempt?, request?}, at, position, batch, ephemeral{owner, epoch, seq}, render, payload, payloadRef}`
  （`src/types.ts:7-37`）；`render.kind ∈ plain|markdown|html|terminal|diff|search|read|web|media`（`:17-24`）。**载荷是不透明 JSON**。
- 瞬态源只定义了模型尝试三种：`model.attempt.started|chunk|ended`，带 attempt/epoch/generation/transformVersion/pub/index（`:159-192`）；
  `ended` 只是引用已提交处置的非权威提示（`:180-190`；`design.md` 「瞬态帧、来源失效与背压」段）。**没有工具执行的瞬态源。**
- 持久游标 `{version, tenant, session, domains, visibility}`，HMAC-SHA256 完整性保护、常数时间比较（`src/types.ts:39-45`；`src/cursor.ts:1, 40, 115`）；
  活动源的代际与水位是进程内状态，重连必走「先订阅」重建（README 第二段）。
- 背压：事实队列满时**不丢**，只停止填充；每 owner 的瞬态环满时**丢最旧帧**并欠一个 `stream.gap{owner, reason:'trimmed'}`，
  下次可投递时先发（`design.md:238-241`；`src/host.ts:813-839`）。gap 帧只说「剪过」和「谁」，**不带剪了多少**。
  单个监听者溢出或失败只撤该订阅并完整重订阅，不把共享源标为失败（`src/host.ts:476-500`；README 第五段）。
- 自述状态：精确 shape 仍待 round-3 复评闭合，依赖的 Session 契约为 candidate、`acceptance:null`（`design.md:1-24`）。

## 局限

- 这是一个未合入分支的一次性读数；它的设计页自称「实施中」，引用的上游契约均为候选。
- 没读 `packages/session/{session, persistence, projection, run}`，所以 minimal-runtime 的消息**落盘形状**本轮没有观察；对照表第三列凡涉及落盘与 loop 行为的格子记为「未核对」，不是「未覆盖」。
