# 证据记录

本页是**索引与取证条件**：每个来源的精确对象、取得方式、立场、这一轮实际核到了什么、不能据此声称什么。
逐条观察（编号 D、S、P、M）在 [notes/](notes/) 的四份来源笔记里，本页不复制；逐格判定在
[reports/2026-09-23-message-and-stream-mapping.md](reports/2026-09-23-message-and-stream-mapping.md)。
当前结论见 [research.md](research.md)。

## 取证条件总览

| 来源笔记 | 精确对象与版本 | 取得方式 | 来源立场 | 证据强度 |
|---|---|---|---|---|
| [dsh-llm](notes/dsh-llm.md) | `deepseek-ai/deepseek-harness` @ `c291e7961a515f6d7af9304e7fd1d257929aef26`，`@deepseek-ai/dsh-root@0.1.5-rc.2`；`packages/llm/llm`、`packages/llm/llm-pi-ai/src/stream.ts`、`packages/core/agent-loop/src/assistant-stream.ts`、`packages/core/tools/src/index.ts`、`.agents/notes/` 七份 | 钉住的 tarball `tmp/sources/dsh-c291e79.tar.gz`（SHA-256 `f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860`）解包后只读阅读 | 作者自述：源码、README、决策注记（含 rejected / archived） | **强**：取舍理由是一手的；行为只到代码阅读，未运行 |
| [dsh-session-format](notes/dsh-session-format.md) | 同一 commit，`SESSION_FORMAT_VERSION = 3`；`packages/core/session/src/{types,surface}.ts`、`packages/session/{session-format, session-persistence-jsonl, session-projection, session-log-deepseek}` README、三份格式注记 | 同上 | 作者自述 | **中**：事件形状读了源码；迁移与 JSONL 实现只读到 README 与注记层 |
| [pi-ai](notes/pi-ai.md) | `earendil-works/pi` @ `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`，`@earendil-works/pi-ai@0.86.1`；`packages/ai`、`packages/agent`、`packages/protocol` README | 钉住的 tarball `tmp/sources/pi-3390bd9.tar.gz`（SHA-256 `29b35ae69e9cc7696cfdd0992e157892dfedc857c50762f49d752584358e4163`）解包后只读阅读 | 作者自述：源码与类型注释 | **中**：流循环只逐行读了 `openai-completions` 一个实现；两条运行时行为是推断 |
| [minimal-runtime](notes/minimal-runtime.md) | 本仓库 `feat/minimal-runtime` @ `d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`（未进 main）；`packages/model/llm`、`packages/media/content`、`packages/session/message-stream`、`docs/proposals/core-capabilities/fork/llm-source.md` | 工作树 `.worktrees/minimal-runtime` 只读阅读，对 `upstream/` 原件做 `diff` | **本项目未合入的实现**，非上游、非已接受设计 | **不作证据**：只说明 fork 一步后的现状 |

钉住副本与校验值的总账在主检出根的 `tmp/sources/README.md` 与 `tmp/sources/SHA256SUMS`；那是任务区文件，
若被清理，按上表 commit 从 GitHub 取同一提交即可复现（DSH 的取得记录在同目录 `upstream-commit.json` 的指向处）。

## 产品正文输入

全部取自 HUB `.worktrees/assets-runtimes`（分支 `panqiwei/assets-runtimes`）：

| topic | rev | 用到的部分 |
|---|---|---|
| [PF-009](../../design/product/PF-009-context-message-types/design.md) | rev 4 | §4 全部、§5.1–§5.9、§6.1–§6.17、§9.2；`decisions.md` 第 68 行 |
| [PF-006](../../design/product/PF-006-tools-and-skills/design.md) | rev 14 | §4 发帧、帧协议不由工具定义声明、工具的产出；§5.4；§6.10 |
| [PF-010](../../design/product/PF-010-context-management-and-assembly/design.md) | rev 5 | §5.4、§5.5、§5.7、§5.9 |
| [PF-012](../../design/product/PF-012-agent-loop-and-run/design.md) | rev 7 | §5.8「消息落盘之前」 |
| [PF-013](../../design/product/PF-013-model-profiles-and-invocation/design.md) | rev 4 | §4 模态、模态投影、转换件；§5.11 |
| [PF-000](../../design/product/PF-000-occurrences-and-record-entries/design.md) | rev 1 | §4 记录条目；§5.4；§5.5 |

词条：`record-and-context.md` 的 UL-message、UL-content-block、UL-block-annotation、UL-incremental-arrival、UL-compaction-record、UL-modality；
`execution-and-outcome.md` 的 UL-frame-emission、UL-execution-frame、UL-tool-output。

## 每个来源的取证局限

### DSH

- 单一 commit 快照，未看 git 史，未运行测试。
- 不变量伴件（D5）是经 `dsh-invariants` 服务注册的可选伴件；**本轮没有核对哪些发行装配默认挂载它**，所以「DSH 强制账只一次、必有结局」只在「伴件已装」的前提下成立。
- 没读 `dsh-llm-deepseek` 的 SSE 翻译实现；关于它的一条已知未处理路径只来自作者注记（dsh-llm 局限段）。
- 没检索 issue tracker；短板取自源码与作者自己的 rejected/archived 注记。

### pi

- 只逐行读了 `packages/ai/src/api/openai-completions.ts` 的流循环；另五个 API 实现只以 grep 确认调用了同一残缺解析函数。
- 「缺终止事件时等待方挂起」「更新监听者失败拖垮工具结算」两条是代码阅读推断，未运行（P5、P9）。
- `packages/agent/src/harness/` 的现行地位未核；同代调研 [agent-harness-session-design](../agent-harness-session-design/README.md) 记过「新一代 `AgentHarness` 是规格不是现状」。
- DSH 与 minimal-runtime 依赖 0.85.1，与此处 0.86.1 的差异未核。
- 没检索 issue tracker。

### minimal-runtime

- 未进 main、自述「实施中」、依赖的上游契约为候选；只用来描述现状，不支撑任何上游事实。
- 未构建、未运行；没读 `packages/session/{session, persistence, projection, run}`。

## 两源之间的交叉核对

| 观察 | DSH 一侧 | pi 一侧 | 结果 |
|---|---|---|---|
| DSH 通过 `dsh-llm-pi-ai` 调 pi 时工具参数的形态 | `block-end` 用 `JSON.stringify(event.toolCall.arguments)`（D10） | `toolcall_end` 只交出解析后的对象，原始串已删（P4） | **一致**：经 pi 路由的 DSH 调用，原始参数串在进入 DSH 之前就已丢失 |
| 流没有终止事件时 | DSH 的 pi 路由抛 `STREAM_CLOSED`（D10）；自身 adapter 路由不补、由伴件报（D5、D6） | 事件流类不强制（P5） | 两源都把「必有结局」放在具体实现或可选层，而不是流的类型本身 |
| 图给纯文本模型 | 出门时换占位（D3） | 出门时换占位（P11） | 两源一致，且都与 PF-013 转换件方向相反 |

## 后续核对

上游升级任一对象时，grep 本页与 `notes/` 里的旧 commit token（`c291e796`、`3390bd93`、`0.86.1`、`d79484d9`），
命中的记录就是要重新核对的候选。第二轮核对按[演进事件词](../README.md#演进事件词)记进 `changelog.md`（届时新建）。
