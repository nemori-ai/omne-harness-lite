# 2026-09-17 · Meta Capabilities

**这是原始材料，不是结论。**引用请走
[decisions.md](../decisions.md) 与 [design.md](../design.md)。

参与者：产品负责人（裁决）、PM（记录与起草）。

## INT-001 meta 的定义，以及它与「常驻」的关系

- 时间/顺序：**PF-006 被接受为正式版本的同一轮**
- actor：**产品负责人本人**
- 表达方式：`quote`
- 内容：「PF-006 可以正式接受了。下一个是 PF-007，这里注意：PF-007 定义的是
  meta skills 和 mta tools，是的你没看错这里用的是 meta，**这也是我们前面对 PF-006
  将 meta 改成「常驻」的理由**，meta 的定义是**工具的工具、技能的技能**，
  **meta 必定常驻，但常驻不一定是 meta**，你也可以理解 meta skills 和 meta tools
  构成了一个 agent 的 **meta capabilities**，也是我们系统的**「动态性」的来源之一**。」
- 状态：当前有效
- 记录者注：这一条**回溯解释了 [PF-006 那次换词](../../PF-006-tools-and-skills/changelog.md)**——
  当时看着只是措辞对齐，实际是为 meta 这个概念腾位置。两个概念此前被记录者混作一谈。
  记录者据此推出「必定常驻」不是产品选择而是**结构必然**（自指闭环需要不动点），
  推理链见 [decisions.md 第二节](../decisions.md#二pm-推导)。

## INT-002 不可禁用不可替换，六个必需的 meta，以及调研指示

- actor：**产品负责人本人**
- 表达方式：`quote`
- 内容：「**meta 不可禁用也不可替换**。**Tools(), Skills(), Shell(), Computer(),
  Web(), Browser() 这几个是必需的 meta**，除此之外，你去调研 pi、deepseek harness、
  opencode、deepagents、claude code、codex、cursor、kimi code 等，
  它们还提供了哪些 meta tools」
- 上下文：记录者此前问过两个问题——PF-007 的范围收到哪儿，以及 meta 能不能被关掉或换掉
- 状态：当前有效
- 记录者注：两点。
  其一，**「不可禁用不可替换」与 [PF-001 的 official/customized 通则](../../PF-001-identity-scope-and-agent-constraints/design.md#来源official-与-customized)
  构成一处例外**（那条通则说 official 的总是可被替换），已如实记入 decisions 第四节，未掩盖。
  其二，**这六个里有四个（`Shell()` `Computer()` `Web()` `Browser()`）作用于世界，
  按字面的「工具的工具」套不进去**。记录者据此把定义写成「**一整类能力的统一入口**」，
  这是能同时容下六个的唯一读法，已标为 PM 推导待确认。

## INT-003 调研结果（摘要）

- actor：**PM**（记录者自己执行的调研）
- 表达方式：`summary`
- 内容：详见[外部实现调研](2026-09-17-survey-of-harnesses.md)。核心发现是各家的内置能力
  按**作用对象**摊开之后，产品负责人给的六个集中在「世界」与「自己的能力集」两族，
  而**「自己的运行状态」与「他者」两族整个是空的**。
- 状态：当前有效
- 记录者注：据此提出五个候选（`Files()` `Agents()` `Todos()` `Jobs()` `Ask()`——后两个定稿时已改名为 **`TodoItems()`** 与 **`BkgJobs()`**，见 INT-008）
  与一个需要产品负责人表态的（`Cordis()`）。其中 **`BkgJobs()` 与 `Ask()` 被指认为
  [PF-006](../../PF-006-tools-and-skills/design.md) 自己挖的坑**——那里定了执行可转后台、
  定了等待态，却没有对应的入口。**调研只用于发现缺口与印证边界，不作为依据。**

## INT-004 五个全收，Cordis 非首批，全部多命令范式

- actor：**产品负责人本人**
- 表达方式：`quote`
- 内容：「**Files(), Agents(), Todos(), Jobs(), Ask() 这五个都要**，**Cordis() 也要但
  不作为首批交付的，但是产品设计上要囊括进它**，连同我们前面定的那几个，
  **这些 meta tools 全都是 multiple command tool 范式的**，而接下来你要做的就是
  对它们分别进行产品设计。可以结合 omne-next 和你前面的调研一起来当作设计参考」
- 状态：当前有效
- 记录者注：三点。
  其一，**「全都是 multiple command tool 范式」这句间接印证了 INT-002 记录者注里的读法**——
  多命令工具的本质就是一族命令共用一个入口，与「一整类能力的统一入口」是同一件事。
  其二，**「不作为首批交付，但产品设计上要囊括进它」是一条重要的边界**：
  不等于「以后再设计」，而是**现在就要把它的位置、边界与危险性定死**，
  否则将来会有人用别的形状把它做出来。记录者据此把 `Cordis()` 写成**只读**，
  并把「改动装配」明确划到本 topic 之外。
  其三，参考材料的处置见 decisions 第四节——**omne-next 与调研都只作印证，不作依据**。

## INT-005 Skills() 要不要 exec_script，Files() 用 edit 还是 patch

- 时间/顺序：**PF-007 rev 1 初稿提交之后**
- actor：**产品负责人本人**
- 表达方式：`quote`
- 内容：
  - 「**Skills() 需要提供 exec_script 命令吧我觉得？**」
  - 「**Files() 你评估一下，是用 edit 命令，还是用 patch 命令更灵活更高效**」
- 状态：当前有效。**两条均已落稿**
- 记录者注：三点。
  其一，**第一条指出了初稿的一个洞**：[PF-002](../../PF-002-assets-settings-and-permissions/design.md#八类资产)
  明说 skill 可以带资源文件、「读取一个 skill 不等于运行它带的脚本」——
  这句话本身就蕴含脚本是可以被运行的，而初稿通篇没说由谁来跑。
  记录者据此把 `exec_script` 归给 `Skills()`（理由：寻址与权限粒度，见 decisions 第二节），
  并**新增一条红线**：只能跑该 skill 自己带的脚本，否则这扇门就是 `Shell()` 的后门。
  其二，**第二条在产品层面问的其实不是「哪个更高效」**。记录者的判断是：
  两者回答的不是同一个问题，真正该由产品定的是**原子性**——
  「改了一半」的文件既不是成功也不是失败，而且看上去像成功。
  因此落稿为**两个都要**，而**差异写成什么格式属技术设计，产品不定**。
  其三，`exec_script` 要落地，带出一处上游补充：
  **[PF-006 §6.4](../../PF-006-tools-and-skills/design.md#64-依赖声明与解析) 只写了工具声明设施需求，没写技能**，
  已报告未擅改。

## INT-006 shell / bash tool 三家怎么设计的

- 时间/顺序：`exec_script` 与 `patch` 落稿之后
- actor：**产品负责人本人**
- 表达方式：`quote`
- 内容：「**shell 或者 bash tool，在 codex、claude code、pi 里面分别怎么设计的**」
- 状态：当前有效（调研指示，非裁决）
- 记录者注：结论在[调研笔记第七节](2026-09-17-survey-of-harnesses.md#七shell--bash-tool三家的具体设计)。
  两点影响已落进 decisions 第二节：**不采纳 Codex 的「agent 主动申请提权」**
  （与注入模型冲突），以及 **`Shell().session` 取显式而非 Codex 那种隐式持久**。

## INT-007 授权回改三处上游欠账

- actor：**产品负责人本人**
- 表达方式：`quote`
- 内容：「**上游三个欠账授权你去改**」
- 状态：当前有效。**三处已全部闭合**
- 记录者注：三处分别是——[PF-004](../../PF-004-agent-definition-and-assembly/changelog.md)
  的重建触发点（升 rev 3）、[PF-006](../../PF-006-tools-and-skills/changelog.md)
  的「两个入口」与「设施声明的主语」（合并升 rev 2）。
  **PF-004 那处比原先报告的小**：§6.3 早就有「增量装载是个例外」这条规则，
  缺的只是 §5.3 那张「最要紧的表」上拿不到这个例外——**改的是表，不是规则**。

## INT-008 逐扇门 review：Shell / Computer / Agents / TodoItems / BkgJobs

- 时间/顺序：**PF-007 rev 1 定稿之后**，产品负责人逐扇门过目
- actor：**产品负责人本人**
- 表达方式：`quote`
- 内容（按发生顺序）：
  1. 「session security mode 这个不在这边讨论，**shell 你舍弃 codex 的那两个 feature 我认可**，
     不过 **shell 我认为我们的 commands 应该要是 create_session, execute, close_session，info,
     这样运行多个 terminal sessions 同时存在，execute 能接受指定 session_id, cwd, envs,
     run_in_background 等参数**」
  2. 「**Computer() 这个请你直接对标 omne-next/ 的 computer use tool 来设计**」
  3. 「**Agents() 工具的 dispatch 命令的几种模式，对标 omne-next/omne_harness 的来定义，
     同时加上我们要支持调用第三方 harness 的 agent 并约定技术上走 ACP 的范式**」
  4. 「**Todos() 工具我们不采用单份 plan 的形式，而是采用 todo items list 的形式，
     因此 commands 我们设计成 add、remove、mark_complete、list，同时工具名改成 TodoItems()**」
  5. 「**Jobs() 工具名改名为 BkgJobs()**」
- 状态：当前有效。**五条全部落稿**
- 记录者注：五条里有三处值得记下来。

  **其一，第 4 条推翻了记录者的一条推导。**初稿主张「整份覆盖、不做逐条增删改」，
  理由是「逐条改会让当前计划有多个答案」——**这个论证站不住**：它混淆了读与写，
  `list` 永远给出当前全量。更要命的是它**与本 topic 自己的另一条自相矛盾**——
  [`Files()` 的 `write`/`edit` 分开](../design.md#63-files通向文件系统)论证的正是
  「整份覆盖与局部修改失手代价不同」，同一个判据在两扇门上得出了相反结论。
  已记入 [decisions 第四节](../decisions.md#四已知的来源问题)。

  **其二，第 1 条的设计比初稿好，记录者原稿有结构问题。**初稿把「开 / 执行 / 关」
  塞进一个 `session` 命令里，等于在多命令范式里又嵌了一层子命令；
  而**多个终端会话同时存在**这件事初稿完全没有。

  **其三，第 3 条是本系统比前身多出来的能力。**
  `omne-next` 的产品权威条款明确写着「**不批准跨 Tenant 或 third-party harness dispatch**」，
  而本 topic 要支持它。记录者据此把**四条产品后果**写死（权限不可继承、
  数据出境、监管取决于对方、回来的是外部内容），
  其中「**派给外部必须是一项显式授予的权限**」是最硬的一条。
  **ACP 是产品负责人给的技术约束，正文只提一句并标明归技术设计。**

## 记录边界

- 只记参与者实际表达过的内容、公开给出的理由，以及清楚标为记录者解释的摘要。
- 不伪造未发生的对话，不把记录者的推断写成产品负责人的观点。
- **转述不是确认。**本篇 `quote` 条目均为产品负责人本人在会话中的直接表达；
  INT-003 明确标为 `summary`，是记录者自己的调研，不是裁决。
