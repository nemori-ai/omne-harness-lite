# omne-next `6263fed`：前缀分类器与用户命令输入协议

- 原始出处：本项目前身 omne-next @ `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（本机 `/data/qiwei/repos/omne-next`，2026-09-23 核对 HEAD 与此 SHA 一致、工作树无改动；路径不钉，对象以 SHA 为准）。
- 取得方式：读文件；`git grep` 只查已跟踪文件。路径以仓库根为起点。
- 来源立场：同一批作者的**自述**（ADR、requirements、design_docs）与**代码**。
- 与已交付 topic 的关系：[连接件与斜杠命令的形状起点](../../connector-and-slash-command-sources/README.md) 的 E-S1 至 E-S7、E-S11、E-S12 已记下「命令框架整体未交付」「限定名」「两段式解析」「三种语法类」等。本页只补**识别与未知处理的逐条原文**，以及 ADR-063 的两处修订说明，避免在 research.md 里只凭转述下结论。
- 消费对象：research.md 的 omne-next 相关结论与对照表 omne-next 列。**下文除 ON-1 外全是设计，本 SHA 无实现**（E-S2）。

## 当前可消费观察

### ON-1

**〔代码〕分类器：先裁掉前导空白，再看是否以 `/` 开头，命令名取到第一个空白；不排除路径**

- `omne_harness/libs/omne_harness_inbound/omne_harness_inbound/domain/services/classifier.py:36-44`：`stripped = text.lstrip()`；不以 `/` 开头即非命令；`stripped[1:].split(maxsplit=1)` 的第一个词为 `command_name`；单独 `/` 或 `/` 后只有空白不是命令。
- `:1-6`：「Pure prefix recognition … it does NOT introduce a new `trigger_origin` (origin stays `chat`)」。
- 推断（按代码直接演算，无单测覆盖）：`"  /usr/bin/python"` 被分成 `is_slash_command=True, command_name="usr/bin/python"`；`" /foo"` 与 `"/foo"` 结果相同。
- `git grep -l SlashCommandClassifier`：除设计文档外只命中 `bootstrap/inbound_bootstrap.py`、领域包的 `__init__.py` 与 bootstrap 单测；**没有**分类器本身的单测，也没有应用层调用方（同 E-S1）。
- 支持范围：代码。

### ON-2

**〔设计〕只在开头触发；非开头的 `/` 一律是普通文本；这是对根级 ADR 的有意改动**

- `omne_harness/adrs/proposed/ADR-063-user-command-input-unified-protocol.md:166`（D-3.1）：「只有用户文本输入的**开头**匹配 `/` 或 `$` 才触发对应解析器。出现在非开头位置的 `/` `$` 一律是普通文本。」
- `:101`（四处冲突表·冲突 1）：根级 ADR-C005 原本允许指令「可出现在文本任意位置（§2.3 例：`analyze this /research_assistant please`）」；ADR-063 改为只认开头，理由是业务专家 2026-07-27 显式要求，且任意位置解析与 D-3.3 的「剩余文本仍以 `/` 开头则递归」切分律不相容。
- 支持范围：Proposed ADR。

### ON-3

**〔设计〕两段式解析、连续命令递归、定长位置参数、恒限定名**

- `ADR-063:168-178`（D-3.2）：开头 `/` → 切命令名 → **先查声明**拿参数语法 → 按 UNIX CLI 语法解析参数（「用现成库，不自造」）→ 剩余文本是自然语言。
- `:180-190`（D-3.3）：剩余文本仍以 `/` 开头即下一条命令；每轮先 trim 前导空白；按输入顺序装载，后装载覆盖先装载的同名项；连续条数设上限。`/a $usage 说话` 里 `$usage` 不再解析。
- `:192`（D-3.4）：禁止可变数量位置参数（「`/attach a.txt b.txt 帮我看看` 无从判断尾巴不是第三个文件名」）；多值用重复具名参数。
- `:194`（D-3.5）：命令名恒为限定名；跨命名空间不撞，同命名空间编译期 fail-fast；「不需要任何优先级规则」。
- 需求 `omne_harness/requirements/capabilities/inbound-contextual-command-discovery-and-governed-invocation.md:163-175`：同上各条的 requirement 表述（Accepted · committed-future）。
- 支持范围：Proposed ADR + committed-future 需求。

### ON-4

**〔设计〕未知、参数错误、过期、禁用、撤销一律 fail loud；另须有不经「先失败」的字面发送路径**

- `ADR-063:196`（D-3.6）：解析失败返回明确错误，「不降级成普通聊天消息」。
- `:198-200`（D-3.7）：「用户必须有不经"先解析失败"的方式发送以 `/` 或 `$` 开头的普通文本，例如 `/usr/bin` 或 `$100`。具体 escape syntax 或客户端动作不由本 ADR 锁死；红线是错误时自动 fallback 不可作为 literal 机制。」
- 需求 `:176-181`（Failure and literal text）：同义，并列出 stale、disabled、revoked；`:343-348`（SLASH-AC-5）把字面发送写成验收条件：「该路径不依赖一次命令解析先失败」。
- `ADR-063:202-215`（D-4）：服务端兜底只校验语法切分、参数 schema、存在性；「命中与未命中在 inbound 看来无差别响应」；资格判定在执行端。
- 支持范围：设计。**具体 escape 拼写未设计**。

### ON-5

**〔设计〕三种语法类分符号；2026-09-07 修订把「斜杠必为聊天调用」的旧概括放开，压缩等命令可等安全执行点**

- `ADR-063:28-36`（§1.1 表）：键盘命令（非串行、official）、斜杠命令（「对一个 skill 或一段 prompt 的快捷调用，加载进 agent 上下文」，串行进会话排队，official ∪ custom）、`$` 命令（「内部子系统 REST 能力的受控快捷方式」，非串行，official）。
- `ADR-063:3-8`（2026-09-07 amendment）：「下文"slash 必为聊天调用 / keyboard 必为非串行控制"的旧概括不再约束新增场景：命令效果与触发语法解耦，压缩等命令可以等待安全执行点。」
- 需求 `:11-16`（2026-09-07 scope amendment）：ordinary chat 归约只约束「上下文装载型 slash」，「不覆盖已批准的独立 Session 排队命令（例如压缩）」。
- 支持范围：设计。**压缩类命令用什么符号拼写，本轮读到的原文没有写死**（ADR-063 修订只说「与触发语法解耦」）。

## 局限

- 全部为单一快照；ADR-063 仍是 Proposed，需求是 committed-future，没有任何真实命令用过这些规则（E-S2）。
- ADR-131（Accepted）关于命令入队位置与一次性队列动作的细节本轮未重读，只沿用已交付 topic E-S2 的引用。
