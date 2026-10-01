本次做的是「表达」判断，判据读的是 `references/review/expression.md`（位于 `.meta_harness/agents/skills/harness-design-handbook/canonical/references/review/expression.md`）。

- **评审对象**：`capability.run-attempt-facts` v2 的候选修订，以本检出 HEAD 为准。审了 `v2/contract.md`、`v2/examples.md` 和上一级的 `verification.md`，以及它在 registry 里的登记：`catalog.json:5637-5706`、`covers.json:18571-18632`、`version-migrations.json:457-470, 1295-1306`，还确认了 `formal-tasks.json` 和 `frozen.json` 里都没有这份契约的条目。
- **范围与完成度**：范围内的文件都逐条读完。依赖契约只核了被引用的那几条：session-log v2 的 S-10/11/13/20，messages v2 的 S-20/24，call-accounts v2 的 S-37/39，identity-values v1 的 S-17/18/30/33。消费者一侧只看了 tool-execution-runtime v2 里涉及本契约的几行。
- **工具输出**：简报附了设计评审报告。下面逐条处置，凡是工具已经核过的项，我没有再用眼睛重做。

## 工具报告的处置

| 工具项 | 处置 |
|---|---|
| `bare-clause-ref` contract.md:95 | 成立，见非阻断 N1 |
| `analysis-id-in-contract` contract.md:172 | 成立，见非阻断 N2 |
| `dependency-clause-missing` catalog.json:5676 | 成立，见非阻断 N3 |
| `stale-product-rev`（未能判定） | 我补判了：工具没认出来，是因为页首写的是「设计依据」而不是「产品依据」。rev 确实过期，见阻断 B8 |
| `nine-items`（未能判定） | 我对 S-9 补做了九件事的核对，结果见 B1–B5 和 N4 |
| 依赖图 | 这一节没有一条涉及本契约，本次没有用它 |

## 阻断

**B1 · 完整性／表达歧义（身份参数带了默认值）**
- 位置：contract.md:144，S-9 ①：「`session`（`SessionRef`；缺省时取调用方当前所在的会话）」
- 依据：同一契约 S-8 第 117 行写着「会话、运行、尝试缺一即 `invalidInput`，不从进程上下文……补」；⑥ 也写「任一参数缺席 → `invalidInput`」。另见 `data.identity-values/v1#S-17`、`#S-18`。
- 触发场景：调用方不传 `session`。
- 后果：一个实现按 S-8 拒绝，另一个按 ① 从进程上下文补一个会话。按 ① 实现时，越权路径从「传错」变成「不传」。S-11 第三行要求跨进程时重新验证会话身份，前提是会话由调用方显式给出，这个前提也就没了。
- 作者需明确：删掉 ① 里的默认值，`session` 必填。

**B2 · 完整性（成功返回允许只答一半）**
- 位置：contract.md:148，S-9 ⑤：「`runEnded` 认不出时可以省略，只给 `superseded`」
- 依据：S-8 第 118 行「两件事实要么一起答出，要么一起不答」；S-8 表第二行和 G-3 都写着认不出终结记录就是 `unavailable`；§十一第 268 行和 examples.md 第 53 行同样如此；D-060 M74 要求「不给过渡值」。
- 触发场景：产品装配里 G-3 还没闭合，任意一次调用都会走到这里。
- 后果：tool-execution-runtime v2 的 S-13/S-15 只处理 `attemptNotFound` 和 `unavailable` 两种失败，也就是 contract.md:428、475 那两行；它没有「缺 `runEnded`」这个分支。照 ⑤ 实现的提供者会让消费者把运行当作没终结，于是写下一个缺席的 `late`。按 `data.call-accounts/v2#S-39`，缺席的 `late` 表示确定的结论「不晚」。这正是本契约 S-8 和 M74 禁止的情况。
- 作者需明确：删掉 ⑤ 里的「可以省略」，两个成员都必填。

**B3 · 完整性（失败集合没有收口）**
- 位置：contract.md:149，S-9 ⑥：「其他错误由提供者自定」
- 依据：第 136 行写着「⑥ 失败集合（闭合枚举…）」；S-8 的失败值总表写着「本契约的全部失败值」。
- 触发场景：提供者自己定义了一种新的失败。
- 后果：消费者无法穷举分支。tool-execution-runtime 只映射了两种失败值，提供者自定的失败在它那边没有去向。
- 作者需明确：删掉这句。如果确实还有别的失败情形，给它命名并加进 S-8 的总表。

**B4 · 完整性／跨契约一致（在途读被填了默认答案）**
- 位置：contract.md:211，S-12：「撤除时在途的读：调用方可能等不到回答，按『仍是当前、尚未终结』处置，以免挡住落账」
- 依据：本契约 S-1 #4、S-8，§六安全性质第一行把「判不出时答『未取代、未终结』」列为绝不能发生；同一节下一条（第 212 行）写「不给过渡值」；另有 M74。消费者 tool-execution-runtime v2 S-15 第 1181 行写的是读不到就 `dependencyUnavailable{runAttemptFacts}`，什么都不写。
- 触发场景：提供者被撤除或换代时，一次读还在途中。
- 后果：同一个分支，两份契约给了相反的指令。照本契约做，消费者会写下「不晚」；照它自己的契约做，消费者会失败。另外，这一句是在替消费者规定处置方式，越过了本契约的归属。
- 作者需明确：在途读按「没有答案」处理。写清调用方此时收到什么（`unavailable`，或者调用不返回），处置方式改为引用消费者自己的契约，并删掉这个默认答案。

**B5 · 归属越界／跨契约一致（契约正文里写了 Cordis 机制，还点名了一个没人拥有的事件）**
- 位置：contract.md:100，S-7 第 2 条：「提供者以 `ctx.inject(['sessionLog'])` 取得日志服务，并在每次调用里先 `await ctx.serial('session-log/flush')` 再读」
- 依据：判据页的归属表规定，capability 契约里不写具体服务键和库调用。本契约 S-10 写着「不发、也不监听任何事件」，而 `ctx.serial` 正是在派发事件。`capability.session-log/v2#S-20` 写着本版不发、也不听事件，整个 session-log topic 里也没有 `flush`。
- 触发场景：照 S-7 第 2 条实现。
- 后果：实现者只有两条路。一是派发一个没有拥有者的事件，这违反 S-10；而且没有监听者时 `serial` 直接返回，这句话实际上什么也不保证。二是无视一条规范句。两种实现会分叉。S-7 第 2 条需要的可见性，本来已经由 `capability.session-log/v2#S-13` 第 4 条提供。
- 作者需明确：S-7 第 2 条只保留性质，并引用 session-log 的 S-13 第 4 条；取得日志服务的方式交给提供者节点去写。

**B6 · 形式对应（声称的证据超出了实际）**
- 位置：contract.md:187，进展性质第一行：「（已由 TLC 在本契约的行为模型上检查）」
- 依据：本契约 S-13 第 220 行写着「不建形式模型」；verification.md 写着「形式工件：无」；`formal-tasks.json` 里没有这份契约的条目；版本目录下也没有 `formal/`。
- 触发场景：接受者或消费者看到这一行，以为这条进展性质已经过模型检查。
- 后果：有人可能会以一份不存在的证据为前提接受这份契约。
- 作者需明确：删掉这句括注，或者改成实际的证据形式（规范场景 S-14）。

**B7 · 引用与登记（状态与版本血缘写错了，阻断接受）**
- 位置：contract.md:4「状态：已由 D-061 接受」；contract.md:287「本版是首版，没有被采用的旧版本」
- 依据：D-061 的 README 第 39 行接受的是 `capability.run-attempt-facts` **v1** S-1..S-18。`catalog.json:5645` 把 v2 登记为 `candidate`，简报也说是 candidate。`version-migrations.json:457-470` 记录了 v1→v2 的 `identity` 迁移。判据页的硬约定是 candidate 与 accepted 不能混用。
- 触发场景：读这份契约，或者对它做接受动作。
- 后果：读者会把这份还没接受的修订当成已接受的；接受者分不清 D-061 覆盖的是哪一份文本；消费者不知道还有一个已被接受的 v1。
- 作者需明确：页首如实写 candidate 及修订标识；§十三 写明从 v1 来的血缘，以及这一轮相对 v1 改了什么。版本身份本身怎么定，见待裁决 P1。

**B8 · 引用与登记（产品依据的 rev 过期，补的是工具「未能判定」那一项；阻断接受）**
- 位置：contract.md:7「设计依据（PF-012 rev 14）」
- 依据：`product/README.md:34` 里 PF-012 的当前 rev 是 21。PF-012 changelog 的 rev 15 改的正是本契约 S-5 第 1 条所依赖的那条栅栏句（「尝试栅栏只拒绝推进运行的旧写入；已发动作的响应体与迟到账仍保留」），同步改了 §4 和 I-11，并且点名要求「下游复核：相关契约」。rev 16 允许把投影持久化，这和本契约 S-5 第 4 条、§十一「不另存」的论证有关。D-061 的保留前提是「各产品 topic 的当前 rev（见各契约页首）」。
- 后果：接受这份契约时，所依据的前提已经过期。S-5 第 1 条「带栅栏的写一条也写不进」和收窄后的栅栏是否还一致，作者没有复核过。我的读法是：session-log v2 S-10 第 3 条区分了带栅栏和不带栅栏的写，看起来仍然相容；但这只是我的读法，不能代替作者复核。
- 作者需明确：复核 rev 15 到 21 对所引小节的改动，然后把 rev 改成 21；如果有对不上的地方，就登成显式缺口。

## 非阻断

- **N1 · 引用与登记（工具 `bare-clause-ref`）**：contract.md:95 写的是「（见 S-39）」，应改为 `data.call-accounts/v2#S-39`。本契约只到 S-18，不过 S-2 和 S-4 的上下文能让读者推出指的是哪条，所以不算阻断。
- **N2 · 引用与登记（工具 `analysis-id-in-contract`）**：contract.md:172 的「（INV-2）」是分析阶段的编号，不该进契约；它也和第 166 行「本节行不编号」自相矛盾。删掉即可。
- **N3 · 引用与登记（工具 `dependency-clause-missing`）**：`catalog.json:5676` 登记本契约消费 `data.messages/v2` 的 S-97，但目标契约只到 S-50；本契约 S-4 也只列了 S-20 和 S-24。登记和正文对不上，`data.messages` 改动时的消费者影响分析会算错。应删掉 S-97。
- **N4 · 可实施性（判定次序在产品装配里有两种读法）**：⑥ 写的次序是「`invalidInput` → `attemptNotFound`；…⇒ `unavailable`」，而 §十一第 268 行和 verification 修订波都说「产品装配里这一次读恒收 `unavailable`」。S-16 期望 `attemptNotFound`，却没有限定在哪种装配下。
  - 触发场景：产品装配里读一个不存在的尝试。
  - 后果：两种实现的结果不同；照 §十一 做，S-16 在产品装配里过不了。消费者把这两种失败收成同一个值，所以影响有限。
  - 作者需明确：写清 `attemptNotFound` 和 G-3 导致的 `unavailable` 哪个先判；S-16 和 examples 标明适用哪种装配。
- **N5 · 表达歧义**：contract.md:268 写「验收装配里由测试种子答（代 loop 写终结的那一方同时给出它）」，有两种读法：一是种子直接给出 `runEnded` 的值；二是种子只给出认终结记录的办法，答案仍按 S-5 第 4 条从日志算。
  - 证据：提供者节点 `realization/packages/session/run-attempt-facts-derived/design.md:61-66` 把这两种读法当成备选方案，自己挑了一种。这说明开发者确实不得不替作者做决定。
  - 后果：按第一种读法，S-15 和 S-18 测到的是种子而不是提供者，S-5 第 4 条和 S-6 也不再由构造保证。
  - 作者需明确：验收装配里答案同样按 S-5 第 4 条从日志算，测试只负责提供怎样认出终结记录。
- **N6 · 引用与登记（状态词）**：contract.md:17-19 把 `data.messages` v2、`data.call-accounts` v2、`capability.session-log` v2 都标成「candidate」，而 catalog 第 2838、2193、5428 行登记的都是 `accepted`。应改成与 catalog 一致。
- **N7 · 引用与登记**：examples.md:5 引用了 `data.identity-values/v1#S-31`，但 S-4 和 catalog 的依赖条款里都没有它。要么补进 S-4 和 catalog，要么删掉这个引用。
- **N8 · 引用与登记（验证入口过期）**：
  - verification.md:6 和 :19 写着「尚无提供者节点」「最小提供者节点未立」，但 `realization/packages/session/run-attempt-facts-derived/` 已经存在。
  - 「变化的影响」第 49 行写的是「起草 v1」，却没有记录这一轮候选修订。§十三第 289 行要求每次原地修订都记在那里。
  - 后果：接受者看不出这一轮改了什么，而 B1–B6 有可能都出自这一轮。
  - 作者需明确：补上这一轮的修订记录，并更新受阻原因。
- **N9 · 引用与登记（证据不足，未证实）**：contract.md:128 说 `superseded`、`runEnded`、`attemptNotFound` 已由 D-060 N-37 ① 接受。但 N-37 ① 在列举名字时，本契约这一项只列了 `attemptFacts`；verification.md 的「对齐义务」也仍把这三个名字称为候选名。作者应引到能精确点名这三个名字的依据，或者改掉这句说法。

## 范围外待裁决

- **P1 · v2 的版本身份（owner：主线／registry 维护者；接受由产品负责人做）**：`version-migrations.json` 把 v2 记成已接受 v1 的 identity 迁移（`semantic_change: false`）；topic README（不在本次范围内）说 v2 已于 2026-09-26 接受并冻结；`frozen.json` 里没有条目；catalog 和简报都说 candidate。由此有两个问题要裁：这一轮能不能在 v2 上原地修订，还是应该发 v3？如果这一轮相对 v1 改了语义，迁移记录里的 `semantic_change: false` 就不再成立。这里只列出来，不据此否决方案。
- **P2 · 两件事实名要不要立词条（owner：统一语言维护者）**：「已被取代」「已终结」两个名字，契约自己声明没有词条，定义只在 S-5。它们算不算需要先立词条的新概念，由统一语言维护者判断。

## 未覆盖

- 工具已经核过的机械项，我没有重做。
- 文件 hash 我没有算（只读，也没有执行工具），所以不能确认当前 HEAD 的文本是否等于 `version-migrations.json` 的 `target_sha256` 或 D-065 `scope.json` 里记的 hash。检出里没有 v1 原文，也就没法判断这一轮相对 v1 改了什么。建议派发者跑工作区的设计检查补上。
- topic README（`spec/capabilities/run-attempt-facts/README.md`）不在本次范围内，但它说 v2 已接受并冻结、依赖都是 v1、节点已由 D-062 接受，与 catalog 和 `frozen.json` 都对不上。转交派发者。
- **转交「选择」**：产品装配里「已终结」恒为 `unavailable`，导致 tool-execution-runtime 所有要落账的收场都写不下去（§十二第一行、verification 修订波）。这是架构取舍，契约里说已经报给主线（那份契约的 R-42），这里不评。
- PF-012 rev 17–21 只读了 changelog 的摘要；identity-values S-19「四类读面」是否覆盖会话日志的读，没有核。
- 已核对且对得上的：S-4 引用的 session-log v2、messages v2、call-accounts v2、identity-values v1 各条款都存在，内容也和 S-4 的说法一致；catalog 里的 resources 与版本目录一致；covers 的四条都能定位到条款，`reviewed: false` 是诚实的初值；消费者 tool-execution-runtime v2 依赖本契约 S-5、S-6、S-9，这三条都存在。

## 未决政策与证据缺口的 owner

- **契约作者**：B1–B8、N1、N2、N4–N9 的补正。
- **主线／registry 维护者**：N3（catalog 里的 S-97）、P1，以及 topic README 的状态说法。
- **统一语言维护者**：P2。
- **产品负责人**：这一轮修订是否接受。B7 和 B8 闭合之前，接受这一动作的前提不成立。
- **派发者**：hash 与设计检查；规范场景 S-14 到 S-18 都还没跑（verification 写的是「未开始」），没有执行证据。

本报告不代表契约已被接受，也不代表实现已经验证。