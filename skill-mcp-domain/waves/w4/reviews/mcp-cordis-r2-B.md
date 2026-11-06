# w4-mcp-cordis B 面窄复核原文（head 45658242e）

交回时刻 2026-11-06T16:26:48.229Z（会话记录），代理 `a958ee173dd4a5ff7`。原样保存，裁定见 `mcp-cordis-r1.md`。

---

本次做的是**表达**判断，判据页是 `harness-design-handbook` 的 `references/review/expression.md`。我读的是 canonical 页的宿主生成副本：`/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/.meta_harness/.claude/skills/harness-design-handbook/references/review/expression.md`。

**结论：第 2 件（插件行为只有一份规范正文）已闭合。第 1 件（B1）未闭合。** B1 原来列出的每一处都已闭合，但还剩一处同类矛盾，是我上一轮漏列的。修复轮另外引入了一处新矛盾。这两处都判为阻断。

## 对象、范围与完成程度

- **对象**：PR #1158，工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis`，派发者给的 head 是 `45658242e`，上一轮是 `f5ead35f4`。我没有 shell，**没有核实工作树确实停在 `45658242e`**。下文都来自直接阅读当前文件。
- **范围**：简报里的两件。上一轮的非阻断项只在修复带来新矛盾时才提。
- **工具输出**：简报没有附。这次的判断不依赖 scan 读数。`check:docs` 与链接检查也没有附，所以锚点只靠阅读核对：`#cordis-plugin`、`#port-absent`、`#cordis-plugin-verification`，以及 mcp-contract 的 `#services`、`#refusals`、`#outcomes`、`#port-adoption`、`#port-eligibility`、`#port-credentials`、`#port-landing` 都存在。

## 第 1 件：B1，未闭合

**上一轮列出的各处，逐个核对：**

| r1 位置 | 现状 | 判定 |
|---|---|---|
| `SPEC.md:16` 写 devDependency，只在 e2e 用 | `:16` 写 dependency，`./cordis` 在产品源码里调用 `createMcp` 与 `createInMemoryCatalogStore`，与 `package.json:36` 一致 | 闭合 |
| `SPEC.md:218` 写「真实组合只由 e2e 覆盖」，验证表缺插件 | 现 `:253` 加了 `cordis-journey.spec.ts`；`:257-293` 新增「Cordis 插件的验证」一节 | 闭合 |
| `SPEC.md:3`、`:19` 的框定句 | `:3` 写两个入口；`:20` 把「不起进程…不取凭据」收窄到根入口的传输，并指向新一节 | 闭合 |
| `README.md:9` / `README_ZH.md:9` 的框定句 | 已收窄到 root entry / 根入口 | 闭合 |
| README 示例注释写「stops the processes」 | 现 `README.md:58` / `ZH:57` 改为经 `closeAll` 关闭连接，并请落点停止进程（MC-10） | 闭合 |
| `object-model.md:34`「没有继承层次」 | 现 `:46` 写「继承只在 Cordis 插件」，传输一侧没有 | 闭合 |
| `architecture.md` 的模块图、模块表、依赖方向、验证表 | `:16-20`、`:34`、`:36`、`:63` 都加上了 `cordis.ts`、四个包外依赖与两个用例文件 | 闭合 |
| `object-model.md` 的对象图与对象表 | `:20-27`、`:42-44` 加上了四个适配器、三个子类与撤除函数 | 闭合 |
| `README:5` / `ZH:5` 用途句，`package.json` 的 `description` | 都写了传输与插件两件事 | 闭合 |
| 状态表缺插件一行 | `README:19` / `ZH:19` 写已实现、只在脚本化 stdio 上验证、HTTP 旅程未执行、未接受 | 闭合 |
| `context.md:9`、`:13`（追加 2 新增） | `:9` 收窄到传输；`:13` 写经 `closeAll` 请落点交出的句柄停止进程，不声称已停 | 闭合 |

**按本次的问法（是否还有字面矛盾），仍有一处残留，见阻断 1。**

## 第 2 件：插件行为只有一份规范正文，已闭合

- `mcp-host-local/SPEC.md:180` 声明本节是插件行为的唯一规范正文。
- `mcp-host-local/docs/cordis.md:3、24、27、31、41、57、76` 都引用 `SPEC#cordis-plugin`、`#port-absent` 或 `#cordis-plugin-verification`，没有规范语气的缺席答复。`:35` 复述「`closeAll` 之后到达的操作按 S8 答复」，但它引用的是 S8，不是另立一条规则。
- `mcp-host-local/docs/flows.md` 没有插件内容，既没有重复，也没有第二个说法。
- `mcp-cordis-contract/SPEC.md:43` 的性质 9 改为「由使用这四个端口的提供者成员兑现」，并链接 host-local 的 `#port-absent`，不再写「本成员规定它」。同一文件的 `:51`、`:53`、`:66` 也是引用。
- `mcp-cordis-contract/docs/cordis.md:16-19、33、52、77、84` 与 `docs/flows.md:46、50、51` 都写「由使用方规定」并引用 host-local 的 SPEC。
- **没有全称句**：
  - `SPEC.md:194-198` 按端口写适配器的答复，依据 AV6、UE5、CU6、PL4。
  - `:200-204` 按操作写，把范围限定在实际调用了缺席端口的那一步：S1 不含 `cancel`；任务操作按 S2，复用连接时不问端口，新建连接时采用不可读答 `Refusal` 的 `unknown`，资格不是 `granted` 答 `effect-unknown`（`no-connection`）；凭据不可读与落点不可读按 R6；关停按 S8。
  - `README.md:44`、`object-model.md:42`、`src/index.md:9`、`SPEC.md:18` 的决定 1 都是适配器级的「答该端口的 `unknown`」，这句话本身对。`tests/index.md:11` 按步写。

## 阻断

**1. B1 残留：README 说配置只有 `LocalTransportOptions`。这一处我上一轮漏列。**
- 类别：跨契约一致（同一成员内部）、表达歧义。
- 位置：`README.md:71`「The only configuration is `LocalTransportOptions`…」；`README_ZH.md:70`「配置只有 `LocalTransportOptions`…」。
- 依据：同一文件 `README.md:44` / `ZH:43` 写插件配置收四个上界与 `clientInfo`；`SPEC.md:182` 定义了 `McpPluginConfig`。判据要求「公共承诺一份现行源」，也不允许字面冲突。这与 B1 是同一类。
- 触发场景：装配方读「Configuration and operation」一节来确定要提供的配置。
- 后果：他会以为只有传输选项，漏掉插件配置的五个必填字段，加载以 `ValidationError` 失败。合入后同一份 README 前后矛盾。
- 作者需明确：把这一句收窄到根入口的传输，或者把插件配置一并写进去并指向 `SPEC#cordis-plugin`。

**2. 修复引入的新矛盾：「本包不写日志」**
- 类别：表达歧义、跨契约一致（同一成员内部，其中一处在 SPEC 里）。
- 位置：`SPEC.md:117`（H13）「本包不写日志」；`README.md:71`「writes no log」；`README_ZH.md:70`「不写日志」。
- 依据：`SPEC.md:207` 规定撤除函数经 `ctx.logger('mcp').warn` 写警告；源码 `src/cordis.ts:320` 有 `ctx.logger('mcp')`，`:326` 有 `logger.warn(...)`。在 `f5ead35f4` 时撤除函数不写日志，这些句子是真的。采纳 C-1、加了警告之后，它们变成假的。
- 触发场景：读者照 H13 或 README，相信本包不产生日志，于是没有为 `mcp` 设导出器级别，也不审视日志内容。实现者照 H13 也可能认为插件的警告违规。
- 后果：同一份 SPEC 的两节互相矛盾，接受者无法据此接受。H13 是凭据不外泄的承诺，这句支撑句的范围变得不清。
- 作者需明确：这句话的适用范围，例如只限根入口的传输，或者改成「凭据值不进任何日志」。同时确认警告参数（消息、端点引用、范围）不含凭据值。H13 的承诺本身不需要改。

## 非阻断

**完整性漂移：插件入口在几处还没写到。这些不是字面矛盾。**
- 类别：完整性、引用与归属。
- 位置：
  - `SPEC.md:3`「本页只写下列内容」的清单没有插件行为，`:341` 的「维护」也没有插件的重核条件：mcp-contract 的 S1、S2、S8、R6、AV6、UE5、CU6、PL4，mcp 的 MC-5、MC-10，以及 Cordis 升版。
  - `README.md:63` / `ZH:62` 列 SPEC 内容的清单没有插件一节。
  - `README.md:77-78` / `ZH:76-77` 验证命令的注释没有列出两个 cordis 用例文件。
  - `README.md:85` / `ZH:84` 的「Consumers」/「消费者」只列了 `@omne-harness/mcp`。
  - `context.md:7`「必要依赖是契约 mcp-contract」，`:17-21` 的定位图没有 `./cordis` 指向 `@omne-harness/mcp` 的边，`:23` 的具名消费者只有 mcp。
  - `architecture.md:65` 的「设计变化时同步」没有 Cordis 的触发条件。
- 依据：判据「完整性」与「引用与归属」。
- 触发场景与后果：维护者按「维护」或「消费者」清单评估改动的影响时，会漏掉插件这一侧。
- 作者需明确：这几处是否补上插件入口，或者明确写成只限根入口。

## 范围外待裁决

没有。

## 未覆盖

- 没有运行工具：没有核实 head，没有跑 `git diff` 核对修复的文件清单，没有 `check:docs` 与链接检查的输出。
- `SPEC.md:207-208` 与 `docs/cordis.md:26、33-34、70` 里的 Cordis 4.0.4 机制断言没有对源码核对，转 A 面（正确性）。其中包括导出器没有设级别时只导出 `error` 与 `info`，以及 `_unload` 与 `Logger` 的行为。
- `SPEC.md:203` 说任务操作新建连接时凭据为 `unknown` 答 `credential-unavailable`。我只读到 mcp 的 MC-17 第 3 步「`connect` 阶段 `ConnectionFailure` 原样」，没有逐一核实凭据取得落在哪个阶段。这一点只读到这里，不计为发现。
- `mcp-cordis-contract/docs/architecture.md:52` 有一句「MCP 要求端口缺席时服务照常作答、不放行」。它不在本次核对的清单里，读下来与 SPEC 一致，也引用了 host-local。

## Owner

- **派发者**：阻断 1 与阻断 2。`README.md:71`、`README_ZH.md:70` 不在追加 2 第 1 项给 README 的写范围里（只有第 5、9 行、状态表、第 43、57 行一带）。`SPEC.md:117` 属于「其余段落不改」。写范围要再扩一次，或者由派发者自己改。这和上一轮 B1 的教训是同一条。
- **A 面**：上面「未覆盖」里的 Cordis 机制断言。
- **作者或派发者**：非阻断的完整性漂移。

## 相关文件

- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/SPEC.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/README.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/README_ZH.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/src/cordis.ts`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/cordis.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/context.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/architecture.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/docs/object-model.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/SPEC.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/docs/cordis.md`
- `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/docs/flows.md`

接受不是评审的动作。评审完成不表示规格已接受，也不表示实现已验证。
