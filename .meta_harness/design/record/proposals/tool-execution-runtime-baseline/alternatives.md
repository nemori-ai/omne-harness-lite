# 候选与取舍

## 选择对象与必要约束

选择对象、十条必要性质 N-1～N-10 与附带约束 K-1～K-4 见 [design.md](design.md#需要作出的选择)。
**不可调整**：十条性质与四条约束。**可调整**：实现起点、代码复用粒度（整包 fork／函数级借用／只借设计）、执行账在 D-026 允许范围内的存放形态、包布局与名字。

下文引用研究断言时记作 R-n，对应 [tool-execution-runtime-sources](../../../../research/tool-execution-runtime-sources/research.md) 「当前结论」下的第 n 条（2026-09-23，DSH `c291e796`、minimal-runtime `d79484d`）：

| R | 断言（缩写） | R | 断言（缩写） |
|---|---|---|---|
| [R-1][R-1] | DSH 后台任务寿命挂在 owner 活体 Agent 上 | [R-10][R-10] | local-execution 停机落「状态不明」，accepted 未派发可继续 |
| [R-2][R-2] | DSH 只登记后台，前台不能中途转后台 | [R-11][R-11] | local-execution 自有 JSONL 账本，不经 `core/storage`，64 MiB 上限 |
| [R-3][R-3] | DSH 记录只在内存，契约携带进程内对象 | [R-12][R-12] | local-execution 协作式停止，停止与 I/O 交错只局部修复 |
| [R-4][R-4] | DSH 没有等待态、没有「等不到应答」 | [R-13][R-13] | local-execution 部署独占租约，陈旧租约人工清 |
| [R-5][R-5] | DSH 分得开 killed/failed，不记原因与发起者 | [R-14][R-14] | 两源互补，执行身份不相容 |
| [R-6][R-6] | DSH 后台开关默认开 | [R-15][R-15] | DSH 依赖面超出 Cordis，vendor 4.0.2 |
| [R-7][R-7] | DSH 运行时与 tool-jobs 可分离，送达与 `reported` 横跨两者 | [R-16][R-16] | DSH 是 MIT 预发布代码，契约三个月内变过形 |
| [R-8][R-8] | DSH 流式输出是给模型的单游标拉取 | [R-17][R-17] | 九项 PF 责任两源都没有 |
| [R-9][R-9] | local-execution 只做预登记文件读写，不做 shell、后台、帧、等待 | | |

研究对照的是 PF-006 rev 14；按 rev 16 重读后的变化见 [design.md](design.md#研究基线与-rev-16-的差)。

## 四条路径

### A · fork DSH `jobs/{jobs,jobs-local,tool-jobs}` 再改造

**范围**：三包（契约 `types.ts` 160 行 + `index.ts` 179 行、`jobs-local` 534 行、`tool-jobs` 401 行，本包起草时 `wc -l` 读数）以 fork 进产品包，
连带 fork 或重写它依赖的 `dsh-scope`、`dsh-agent` 注册表与收件箱事件、`dsh-timeout`、`schemastery`（[R-15][R-15]）。
改造：owner 从 Agent 实例换成会话、内存态换成 `core/storage`、补前台登记与中途提升、补等待态与帧、补原因与发起者、翻转后台默认值、补恢复。

**保留下来的真实价值**：授权与首胜结算、`kill → stopping → 结算` 的中间态、「id 一经发布取消权就归任务」、控制器栅栏、每 owner 并发上限、
producer 接口承载 bash／pwsh／terminal／subagent 多种长活的形状，以及 tool-jobs 三件工具与 PF-007 `BkgJobs()` 三命令的一一对应（[R-7][R-7]）。

**总负担**：研究判「形状装不下」的三条（绑会话、中途转后台、停机送回失败）全部落在**契约面**——`JobStart.owner`、`JobDoneListener` 的 owner 参数、
不变式里 `ownerSession` 与 owner 对齐、`run()` 同步返回进程内钩子、`<kind>-N` 进程内计数器（[R-1][R-1]、[R-3][R-3]）；
改完之后 `types.ts` 与 `jobs-local` 实质重写，`tool-jobs` 的送达目标整体换掉，**留下来的是词汇与算法，不是代码**。
jobs-local 的 55 条单测主要覆盖 owner 作用域清理与同 id 换实例（研究 E-2），**正是要改掉的那部分语义**，测试资产随之作废大半（本包推断）。
依据 SYS-KERNEL，fork 即自维护；上游契约三个月内变形三次（[R-16][R-16]），分叉之后也拿不到上游合并的收益。另要核 Cordis 4.0.2→4.0.4 差异（X-7）。

**关键反例**：

- **N-8、N-1**：只换存储而保留 owner 语义，agent runtime 每回收一次，会话里的后台构建就被取消并删记录，**不报错**（[R-1][R-1]）。
  rev 16 之后更重：DSH 的前台执行是工具体里的一次 `await`（[R-2][R-2]），随 agent 那一轮一起没，**前台也违反「回收不影响」**。
- **N-7、N-10**：记录只在内存，重启后原占位里的 `jobId` 查无此任务，**没有任何东西能合成那条「失败」**（[R-3][R-3]）；只把 `Map` 换成表而不改契约，表里有记录、却没有能 `cancel` 它的钩子。
- **N-5**：`readOutput` 是给模型读的单消费游标，读者与消费语义都与帧相反，不能改造成帧（[R-8][R-8]）。

**证据与缺口**：以上反例都是形状层面的，研究已回到源码行核对。未核：DSH 能否单独取消一次前台调用（X-1）、4.0.2→4.0.4 行为差异（X-7）。**二者都不能消掉上面三条反例。**

### B · 拓展 minimal-runtime `tools/local-execution`

**范围**：以 `feat/minimal-runtime@d79484d` 的 local-execution（`src/` 七个文件 4066 行，其中 `host.ts` 1609 行、`ledger.ts` 795 行）为起点，
补 shell/子进程、进程内工具函数与 MCP 调用三类执行者，补后台、帧、等待态、提醒、会话归档与 run 取消两个触发点，
把恢复终态从 `unknown` 改为失败、删掉「accepted 未派发可继续」，套一层 Cordis 插件（它现在是普通类、不导入 Cordis），并把账本迁到 `core/storage`。

**保留下来的真实价值**：持久意图先于外部效果、先于 start 也能落的停止墓碑、`physical`／`cleanup`／`effect` 三维分开记、重启不重放、
执行身份 `CallRef{owner, callId, attemptId}` 携带租户与会话（K-1）、终态只发身份铃而消费者重读持久终态并在启动时扫描补漏、零价计费来源（[R-9][R-9]、研究 E-8）。

**总负担**：它的状态序列 `accepted → dispatch_intent → temporary_opened → rename_intent → terminal` 是**替换写一个文件**的专用序列，
一个通用的子进程或 MCP 执行没有 `temporary_opened`、`rename_intent`；「拓展」之后，通用运行时（状态机、前后台、等待、帧、送达、多执行者）**全部是新写的**，
local-execution 退成其中一种执行者。另要付：账本从自有 JSONL 迁 `core/storage` 或论证它属于 D-026 的「本地日志类」（[R-11][R-11]），64 MiB 上限在超长期待机下终会写满；
部署独占租约崩溃后要人工证明旧 owner 不再运行才能清（[R-13][R-13]），与长期待机、自动恢复相冲突，也把执行者钉死在单机单实例（K-4）。
它未进 main，设计依据属已退役旧链（研究准入核对），**不能作为现行契约的依据**，只能作为观察对象。

**关键反例**：

- **N-7**：恢复把在途执行落成 `unknown / effect: possible`——正是 PF-006 §6.12 点名拒绝的第七种收场；「accepted 未派发可经恢复许可继续」违反 rev 16 的「没有例外」（[R-10][R-10]）。词表可改，但改的是它恢复设计的核心判断。
- **N-2、N-5**：`background: unsupported`、`frames: []`、`subscribe` unsupported，设计正文明文禁止静默降级为内存帧（[R-9][R-9]）——**两项核心能力从零写**。
- **N-4**：停止是协作式栅栏，`force` 固定 unsupported；停止与 I/O 交错的竞态只做了局部修复（[R-12][R-12]）。PF-012 §6.14 要求强制停止这一级存在。

**证据与缺口**：研究读了源码未运行测试（「29/29 通过」是来源自述）。它的 `physical`／`effect` 两维在 PF 收场词表里没有位置，放进账是本包的建议，未经裁定（[design.md](design.md#契约动作链与-cordis-投影)）。

### C · 自研：Cordis 4.0.4 fiber／服务 + `core/storage` 落账，借词汇与模型面、借恢复纪律

**范围**：新写一个以会话为宿主的工具执行运行时。执行记录与账经 `core/storage` 落 SQL；执行宿主是一条**不在 agent runtime fiber 之下**的 Cordis fiber；
执行者接口统一承载子进程、进程内工具函数与 MCP 调用。**借设计，不继承代码**：

| 借自 | 借什么 | 不借什么 |
|---|---|---|
| DSH `dsh-jobs` | `start`／`kill`／`list`／`read`／`wait` 的动作词汇；首胜结算与「完成最后宣布」；`stopping` 中间态（已请求、物理未停）；「id 一经发布，取消权归执行自己」；控制器栅栏；每会话并发上限 | owner＝Agent、`run()` 同步返回进程内钩子、`<kind>-N` 计数器、`reported` 为提醒去重而设的语义 |
| DSH `dsh-tool-jobs` | 三件工具对 PF-007 `BkgJobs()` `list`／`output`／`terminate` 的模型面形状；忙时注入、闲时唤醒的送达分流思路 | 送达目标是活体 Agent、`WeakMap<Agent>` 唤醒预算、`agent/inbox/claimed` 与 `tools/pre-execute` 两个 DSH 事件、`outputLimitBytes` 首尾截断 |
| local-execution | 持久意图先于外部效果；墓碑先于 start 也能落；不重放；`physical`／`effect` 记进账；终态只发身份铃、消费者重读、启动扫描补漏；执行身份带租户；停止与 I/O 交错那组反例作为测试义务 | `unknown` 终态、恢复许可、自有 JSONL、部署独占租约 |

函数级的借用（例如照 DSH `settle` 的首胜顺序写，MIT 许可允许）在提供者设计里逐项登记来源，不算 fork。

**如何兑现**：N-1、N-8 由结构给——宿主 fiber 与 agent runtime 无父子关系，Run 只记「在等哪一次」；N-2～N-5 按产品词表从第一天写对，不从一个方向相反的默认值改过来；
N-6 交原样 `ToolResult`；N-7 由恢复路径给——扫非终态、回收登记过的进程组、在**同一行**上条件写失败、交会话；N-9、N-10 直接落 `core/storage`；K-1 身份带租户；K-2 只依赖 Cordis 4.0.4 官方包与本仓库节点。

**总负担**：**新写量最大**，没有现成测试；两源已经踩过的坑（撤除时 cancel 抛错要强制结算、同 id 换实例不串台、停止与 I/O 交错）若不显式列成测试义务，会被重新踩一遍。
依赖的 `core/storage` 协议**尚未被接受**，会话与 Run 的契约**尚不存在**——这两个前提不闭合，C 只能起草契约，不能开包。
多执行者接口（K-3）的形状两源都没有现成答案，DSH producer 接口是最近的参照。

**关键反例**：没有找到让 C 兑现不了某条性质的结构性反例。它的风险是**成本与遗漏**，不是形状：
N-7 的「失去连续性要连子进程一起失去」（X-5）与执行宿主 fiber 在提供者换代时是否被卸载（X-6）两件事，两源都没有给出可抄的答案，要自己实验。

**证据与缺口**：C 的「能」是**有前提地能**——前提是 `core/storage` 协议能表达同一行上的条件终态写（节点自述一致性套件通过，协议未被接受）、D-026 对活体句柄的读法（X-2）、Cordis 4.0.4 的 fiber 卸载语义（X-6）。

### D · 混合：local-execution 的账本与恢复许可 + DSH tool-jobs 的模型面 + 自写执行器

**范围**：取 local-execution 的 `ledger.ts`（JSONL 追加、`fsync`、前缀校验、恢复折叠）与它的恢复许可逻辑；取 `tool-jobs` 的三件工具与完成送达；执行器自写。

**总负担与关键反例**——借来的两块各撞一条必要性质，改掉之后剩下的就是 C：

- **N-7**：local-execution 的恢复许可（「accepted 且无 `dispatch_intent` 可经许可继续」）恰恰是 rev 16「没有例外」拒绝的那一条（[R-10][R-10]）；它的恢复终态是 `unknown`。**D 点名要取的这一块，正是 PF 明确不要的那一块。**
- **N-1、N-8**：`tool-jobs` 的送达是 `owner.followup`／`owner.inject`，目标是活体 Agent；唤醒预算按 `WeakMap<Agent>` 记、靠 `agent/inbox/claimed` 复位（研究 E-3）。
  它还 `inject` 了 `jobs` 服务，不取 DSH jobs 运行时就得重写它的核心，同时拉入 `dsh-llm`、`dsh-output-retention`、`dsh-tools`、`dsh-system-prompt`、`dsh-agent`（[R-7][R-7]）。
- **N-6**：`tool-jobs` 的 `outputLimitBytes` 首尾截断把卸载提前到了运行时里。
- **身份**：两块的执行身份不相容（`<kind>-N` + 活体 Agent 对 `CallRef` + 执行 epoch），要先定共同身份才能拼（[R-14][R-14]）。
- **N-10**：账本仍是自有 JSONL、64 MiB 上限（[R-11][R-11]）。

**证据与缺口**：去掉恢复许可、把送达换成会话、删截断、把账本迁 `core/storage` 之后，D 保留的代码只剩 JSONL 追加与三件工具的参数形状——**D 退化成「C + 两份外来依赖的残骸」**。
若只做函数级借用而不继承包，那就是 C 已经允许的做法，不另成一条路径。

## 性质矩阵

「保留」＝源的现有语义就是这条，最多改名接线；「改写」＝源有对应机制但方向偏，改的是它已有的形状；
「冲突」＝源的形状与性质相反，要换掉那一块；「新建」＝源里没有，或本路径从零写。C 列的「新建」是路径定义，不是缺陷。

| 性质 | A · fork DSH jobs | B · 拓展 local-execution | C · 自研 | D · 混合 |
|---|---|---|---|---|
| N-1 绑会话 | **冲突**（owner＝Agent 作用域，[R-1][R-1]） | 改写（身份可承载，生命周期跟单机 host，[R-9][R-9]） | 新建（结构保证） | **冲突**（tool-jobs 送达目标是 Agent） |
| N-2 四组合／转后台／默认不许 | **冲突**＋新建（前台不可提升、无等待态、默认开，[R-2][R-2]、[R-4][R-4]、[R-6][R-6]） | 新建（[R-9][R-9]） | 新建 | 新建 |
| N-3 六种收场 | 改写（三种终态、无「等不到应答」，[R-5][R-5]） | 改写（`unknown` 是第七种，[R-10][R-10]） | 新建（照 §5.5） | 改写（两套词表都要改） |
| N-4 中断非失败／单独控制／归档 | 改写（killed≠failed、逐个 kill，无原因与发起者；前台单独取消未核，X-1） | 改写（`interrupted`、逐执行停止，协作式、无强停，[R-12][R-12]） | 新建（借 `stopping` 与取消权归属） | 改写（协作式栅栏只覆盖文件步骤） |
| N-5 发帧 | **冲突**（单游标给模型，[R-8][R-8]） | 新建（[R-9][R-9]） | 新建 | 新建 |
| N-6 卸载在执行之后 | 改写（删首尾截断） | 改写（删超限即失败） | 保留（交原样） | 改写（删截断） |
| N-7 停机不重来、落失败 | **冲突**（内存态，无物可合成，[R-3][R-3]） | 改写（`unknown`→失败、删恢复许可，[R-10][R-10]） | 新建（恢复路径） | **冲突**（取恢复许可即违反「没有例外」） |
| N-8 回收不影响 | **冲突**（随 Agent 撤除取消；前台是工具体 await） | 中性（不依赖 agent，宿主关系未定义） | 新建（结构保证） | **冲突**（`WeakMap<Agent>`、收件箱事件） |
| N-9 留账 | 改写（只有起止时间且随进程消失） | 保留（仅文件动作） | 新建（借账字段与 `physical`／`effect`） | 保留（JSONL） |
| N-10 无 in-memory | **冲突**（契约携带进程内对象，[R-3][R-3]） | 改写（自有 JSONL，[R-11][R-11]） | 保留（直接用 `core/storage`） | 改写（同 B） |
| K-1 租户 | 新建（授权只比 session id） | 保留 | 新建 | 保留（但与 DSH 身份不相容，[R-14][R-14]） |
| K-2 Cordis 4.0.4 与 fork 维护 | 改写（vendor 4.0.2，连带多包 fork，[R-15][R-15]、[R-16][R-16]） | 新建（不导入 Cordis） | 保留 | 改写（两边依赖都背） |
| K-3 多执行者 | 改写（producer 接口是最近形状，但 `run()` 返回进程内钩子） | 新建（只有文件 I/O） | 新建 | 新建 |
| K-4 单机→分布式 | 改写（作者自述须重塑 identity／restart／ownership／observation） | **冲突**（部署独占租约钉单机单实例，[R-13][R-13]） | 视存储跨进程协调（未定） | **冲突**（同 B） |

**读法**：A 有五条必要性质是「冲突」且都落在契约面；B 没有契约面冲突，但 N-2、N-5 与多执行者全部新建，N-7 要改掉它恢复设计的核心判断，K-4 与租约相冲；
D 借来的两块各撞 N-7 与 N-1／N-8。C 没有「冲突」格，代价全在「新建」的量上。

## 推荐与仍待区分的事项

**推荐 C。**先排除不能兑现必要性质的候选，再比剩余路径的总负担（手册「设计选择」）：

1. **A 被排除**：N-1、N-7、N-8、N-10 的冲突都在 DSH jobs 的**契约签名**上（owner 类型、`run()` 返回进程内钩子、进程内 id），研究已回到源码行核对。改掉它们等于重写契约与实现，
   留下的是词汇与算法——而词汇与算法 C 同样拿得到，还不必背 `dsh-scope`／`dsh-agent` 的 fork 与 4.0.2→4.0.4 的差异核对。
2. **B 被排除为基线**：它的强项（持久意图、墓碑、不重放）是一种执行者的纪律，而工具执行运行时要的状态机、前后台、等待、帧、送达、多执行者**全要新写**；
   它恢复设计的核心判断（`unknown`、恢复许可）与 N-7 相反，部署租约与长期待机、K-4 相冲，设计依据属已退役旧链。它更合适的位置是**将来某个文件动作执行者的参照**。
3. **D 被排除**：它点名要取的两块恰好各撞一条必要性质；改掉之后退化成 C 加外来依赖的残骸。
4. **C 的代价是真实的**：新写量最大、没有现成测试、两个前提未闭合（`core/storage` 协议未接受、会话与 Run 契约不存在）。
   这笔代价换来的是：每条必要性质从第一天按产品词表写对，不从一个方向相反的默认值改过来；上表里它是唯一没有「冲突」格的路径。
   **要求**：把两源已知的失败情形（撤除时 cancel 抛错要强制结算、同 id 换实例不串台、停止与 I/O 交错、bash spawn 失败被记成 killed）列成 C 的测试义务，而不是指望自研时想到。

**会让 A 重新上桌的证据**：DSH 上游（或一份已存在的 fork）关掉它自己列的三条 Known Limitations——持久后端、前台提升、owner 不再是活体 Agent——且 `run()` 不再返回进程内钩子；
或 C 起草到提供者设计时出现可复现的缺陷，而 DSH 已有的结算与授权实现能**以包为单位**直接移植并通过 C 的契约测试。

**会让 B 以「执行者」身份被复用的证据**：local-execution 按一份现行已接受契约重做并进 main；那时它是 C 之下文件动作执行者的候选实现，不是运行时基线。

**D 没有独立的翻盘条件**：函数级借用已在 C 里允许。

**不做的理由写在这里而不是删掉**：「满足规格时优先复用成熟实现」是本项目的品味。本推荐没有否定两源的成熟度——DSH 的结算与撤除有 55 条单测、local-execution 的恢复有独立崩溃进程测试——
而是判断它们成熟的那部分语义，恰好在 N-1、N-7、N-8 上与 rev 16 的产品正文方向相反。**接受 C 的人要明知：这是放弃了约 1300 行可 fork 的现成代码，换一份从零写的实现。**

### 仍待区分的实验

| # | 命题 | 最小区分办法 | 会改变什么 | 消费时点与负责方 |
|---|---|---|---|---|
| X-1 | DSH 能否只取消一次前台工具调用而不取消整轮 | 读 DSH `packages/core/tools` 注册表与 agent loop 里 `exec.signal` 的派生（研究「未知」第一行） | **只影响 A 的改动面估计**；A 已被 N-1／N-7／N-8／N-10 的契约面反例排除，**任何结果都不改变推荐**。对「DSH 工具管线能否当调用入口」有用，那是另一份提案的问题 | 低优先；调研执行者 |
| X-2 | D-026「不提供 in-memory」不涵盖子进程句柄、取消回调、等待中的 Promise 这类活体句柄 | 请架构负责人给一句读法，登在 D-026 或新决定 | 全部候选的改动面；C 的持久／句柄分界。**不改变 A、B、C、D 的排序**（A 的问题在契约签名，不在句柄） | 契约起草前；架构负责人 |
| X-3 | 执行记录与账落 SQL 还是 JSONL | 提供者设计比较：首胜结算与墓碑先于派发需要同一行上的条件写（SQL 事务自然）；长期待机下的增长与保留期限 | C 的存储形态；本包倾向 SQL，帧随 `ToolInternalMessage` 进会话日志那一类 | 提供者设计；保留期限归观测与计量 |
| X-4 | 一棵正在跑的进程树能否从「按 run 的前台进程组」迁到独立进程组而不漏后代、不留信号窗口 | Linux 与 macOS 各起一棵三层进程树，中途 `setpgid` 迁移，观察后代归属与迁移期间的 `kill(-pgid)` | 若迁不动：**每次执行一开始就自成一组**，run 取消由运行时按存储里的前台集合逐个发——[`apps/cli` 架构](../../../realization/apps/cli/architecture.md#拓扑与进程模型)「前台每个运行一组」那一行要改。不改变本选择 | C 的执行者设计前；`apps/cli` 节点 |
| X-5 | 据点进程被 `kill -9` 后，它起的工具子进程是否仍在跑 | 两平台各起子进程后强杀父进程，观察存活；Linux 试 `PR_SET_PDEATHSIG`，macOS 无此机制，看恢复时按登记的进程组回收是否足够 | N-7「失去连续性」的实现：记录说失败而世界里它还在跑，就违背了「系统没了它就没了」。两源都没覆盖（DSH 靠 owner 撤除，不是崩溃；local-execution 不起子进程）。不改变本选择 | C 的恢复路径设计前；实现者 |
| X-6 | Cordis 4.0.4 下，承载长活执行的 fiber 在其必需服务换提供者时被卸载重跑，effect 的 disposer 会取消在途执行 | 在 `core/kernel-basis` 补一条 probe：一个 fiber 持长活 effect，换掉它 inject 的服务，观察 disposer 是否执行 | 执行宿主插件的 inject 形状：若成立，宿主只能 inject 极少且不换代的服务，否则一次换代等于一次停机、全部在途执行落失败。不改变本选择 | 提供者设计前；`core/kernel-basis` |
| X-7 | Cordis 4.0.2（DSH vendor）与 4.0.4 在 `Service`、`ctx.effect`、scope 撤除顺序上的差异 | 两版 changelog 与源码 diff | **只影响以包为单位移植 DSH 代码的路径**（A、D）；C 不受影响 | 仅在 A 或 D 重新上桌时做 |

[R-1]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的后台任务寿命挂在-owner-那个活体-agent-实例上不挂在会话上
[R-2]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-只登记后台工作前台执行不进登记表也不能中途转后台
[R-3]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的记录只在进程内存里而且契约本身携带进程内对象不只是实现选了内存
[R-4]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的状态词表没有等待态也没有等不到应答
[R-5]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-分得开-killed-与-failed但不记录中断的原因类别与发起者
[R-6]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-的后台开关默认开启与-pf-006不声明就不能后台方向相反
[R-7]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-运行时与-tool-jobs-在代码依赖上可分离但完成送达与-reported-语义横跨两者
[R-8]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的流式输出是给模型读的单游标拉取不是给人看的帧
[R-9]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-只执行预登记文件的有界读与带修订校验的替换写不执行-shell不后台不发帧没有等待态
[R-10]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-停机恢复从不重放但把在途执行落成状态不明而不是失败
[R-11]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-的执行记录是自有-jsonl-账本不经-corestorage-协议
[R-12]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-的停止是协作式栅栏不承诺限时强停停止与-io-交错的竞态已发现只做了局部修复
[R-13]: ../../../../research/tool-execution-runtime-sources/research.md#local-execution-的-rename-竞态窗口靠部署独占租约兜底陈旧租约只能人工证明后移除
[R-14]: ../../../../research/tool-execution-runtime-sources/research.md#两源在语义上大体互补重叠只在-start--stop--inspect--终态通知这四个动作的形状上
[R-15]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-的依赖面超出-cordis-本身且所对-cordis-版本与本项目不同
[R-16]: ../../../../research/tool-execution-runtime-sources/research.md#dsh-jobs-是-mit-许可的预发布代码契约在三个月内变过形
[R-17]: ../../../../research/tool-execution-runtime-sources/research.md#以下-pf-责任两源都没有承载查过对照表全部-16-行
