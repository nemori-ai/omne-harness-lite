# 交回 w3-docs-mcp-fix1

## 1. 结论
做完。第 1–5 条与能改的非阻断都已改，门禁四项退出 0。三条非阻断没改（MC-N9、MC-N10 在写范围外；MC-N3 的登记缺拥有者与退出条件），MC-N11 与第 6 条一并不改，理由在第 7 节。

## 2. 提交
- `d543dd236` docs(mcp): 组页与入口页的 SDK 复用句、传输行、清单变化通知、条款链接对齐现状（#1119）。作者与提交者读回均为 `PanQiWei <594557445@qq.com>`。

## 3. 改了哪些文件
- `packages/mcp/docs/architecture.md`：复用句（原 :19、:83）、`McpTransport` 行（:350）、依赖倒置行（:573）、验证表两处（:689 的「只有它依赖官方 SDK」、:692 的清单变化通知）、:52、:194、:87、:72、:623、:693。
- `packages/mcp/docs/key-flows.md`：:19。
- `packages/mcp/README.md`：成员表 mcp-host-local 行、mermaid 节点、组合验证两处（原 :51、:55）。
- `packages/mcp/mcp/README.md`、`README_ZH.md`：契约一节的链接、维护一节。
- `docs/domains/mcp/architecture.md`：`ActionInvoker` 行。
- `packages/mcp/mcp-host-local/SPEC.md`：只改依据表「组工程设计」一行的范围格。
- `oxfmt` 把 `docs/architecture.md`、`docs/domains/mcp/architecture.md`、`README.md` 里被改动行所在的表格重新对齐，所以这三份的 diff 行数远多于实质改动。实质改动按本节列的位置读。

## 4. 验收
### 4.1 第 1–5 条
1. 已改（MC-B1）。`architecture.md` :19、:83 与 `README.md` 成员表改为「优先复用；复用会违反三条硬承诺，或契约根已有同一条规则时不复用，逐块决定见 mcp-host-local 的 SPEC」。证据：`grep -rn "只在复用会违反" packages/mcp docs/domains/mcp` 为 0 行。
   - 已改（MC-B2）。取删除一种。`architecture.md` :692 与 `README.md` 组合验证一条删「清单变化通知」。`architecture.md` :317、:412 的「本组不订阅清单变化通知」是现行条款，保留。`grep` 旧句「断流、清单变化通知、需要输入」为 0 行。
   - 已改（MC-B3）。`mcp/README.md` 与 `README_ZH.md` 的契约一节改为链接 [MC-10](`SPEC.md#mc-10`)、[MC-14](`SPEC.md#mc-14`)（两个锚点在 `mcp/SPEC.md` :74、:90 已存在），并另指「所有权、失败与生命周期」一节。`grep "clauses MC-10 and MC-14|MC-10 与 MC-14"` 在两份 README 为 0 行。
2. 已改（W-4）。`architecture.md` :350：「产品源码不导入官方 SDK，传输按协议实现。通用实现不认识 SDK，SDK 只在 mcp-host-local 的测试与探针里作对照与对端」。:573：「传输实现（含 HTTP 客户端）只在 mcp-host-local，官方 SDK 只在它的测试与探针里」。证据：`grep "只在传输实现一侧使用|SDK 和 HTTP 客户端只在"` 为 0 行。顺带改 :689「因为只有它依赖官方 SDK」为「只有它的测试用官方 SDK 作对端与对照」，同源旧句，评审没点名。
3. 已改。`mcp-host-local/SPEC.md` 第 10 行（规格写第 12 行，文件里依据表的该行是第 10 行，其余各行未动）：「官方 SDK 只出现在本成员的测试与探针」。钉 `26ab418a7` 不变。`git diff -U0` 只有一个 hunk `@@ -10 +10 @@`。
4. 已改（N-11）。`README.md`「组合验证」一节：「mcp-host-local 的 `tests/e2e/` 在本机真实服务端上验证它与 `@omne-harness/mcp` 的组合行为（PR #1149）。攻击、资源与耐久没有证据。」证据：旧句「组合行为、攻击、资源与耐久都没有证据」在目标页为 0 行。注意：本分支没有 `mcp-host-local/tests/e2e/` 目录，它随 PR #1149 到达，所以我只写成行内代码，没有做链接，`check:docs` 不会因此断链。
5. 已改（TP-5 余项）。`mcp/README.md` 与 `README_ZH.md` 的维护一节不再列条款到模块文件的对照，也不再列 `GenerationPolicy` 与 `internal/settings.ts`，改为指向 `docs/architecture.md`（该页的模块表按条款号列模块）。证据：两份 README 里 `calls.ts` 为 0 行。

### 4.2 非阻断（MC-N）
见第 7 节。

### 4.3 门禁（在 `d543dd236` 上，工作树根）
| 命令 | 退出码 | 输出尾部 | 日志哈希（sha256 前 16 位） |
| --- | --- | --- | --- |
| `pnpm run check:docs` | 0 | `PASS: 2751 Markdown files; local links and skill mirrors.` | `66939373a7a4a61d` |
| `pnpm run check:design` | 0 | `PASS: 354 个词条、69 条对象条目、10 项待裁、17 个当前 PD，对账一致。` | `2f535c3bfc528e0c` |
| `pnpm run format:check` | 0 | `All matched files use the correct format.` | `82ab9e79ce03699a` |
| `pnpm run lint:rules` | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 6199 个提交的署名，无违反。` | `39cc2f87155e0fa3` |

日志目录：`/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/logs/w3-docs-mcp-fix1-<命令>.log`。

### 4.4 改动范围
`git diff --name-only f2fc80ace..HEAD` 只有七个文件，全在写范围内：`docs/domains/mcp/architecture.md`、`packages/mcp/README.md`、`packages/mcp/docs/architecture.md`、`packages/mcp/docs/key-flows.md`、`packages/mcp/mcp-host-local/SPEC.md`、`packages/mcp/mcp/README.md`、`packages/mcp/mcp/README_ZH.md`。`mcp-host-local/SPEC.md` 的 diff 是第 10 行一行。

## 5. 门禁日志的时间与提交
四份日志都跑在 `d543dd236` 上，写在最后一次改动（提交）之后。日志时间见文件的修改时间。

## 6. 变异表
不适用，本闭包不改行为。

## 7. 非阻断逐条处置与其他决定
| 编号 | 处置 | 位置或理由 |
| --- | --- | --- |
| MC-N1 | 已改 | `architecture.md` 不变式 5（:194）与 `key-flows.md` :19 改为「建连时限从这次建连开始（连接进入 `preparing`）起计时」，不再出现 `attempt()`；精确起点仍链接 MC-5。`mcp/SPEC.md` MC-5 写明 `preparing` 是在途建连的状态，所以这个说法与成员 SPEC 一致 |
| MC-N2 | 已改 | 去掉「W3 实际采用」与「后续小卡」：`architecture.md` :72、:623、:693，`README.md` 成员表与 mermaid 节点。改为「仓库实际采用 2.4.0」，并写「该行的同步归 RFC-0001 的拥有者」，带 RFC-0001 的链接。没有写具体的人或卡号，因为材料里没有 |
| MC-N3 | 部分改 | 已改：:623 的依据列分开写，协议线与 SDK 版本依据技术基础，复用策略依据 mcp-host-local 的 SPEC，回退一次依据契约 T3 与裁定第 6 条。不改：在组页登记一条对技术基础的偏离。评审要求「带拥有者与退出条件」，这两项材料里没有，补出来是新的决定。:72 与 :83 已如实写了版本不同与不导入 SDK，只是没有列成偏离表项。需要卡拥有者定：登记在哪张表，拥有者与退出条件 |
| MC-N4 | 已改 | `architecture.md` :87 依据层改为契约 T3 与裁定第 6 条，并写「官方规格已弃用该传输，所以只回退一次，不另建传输」 |
| MC-N5 | 已改 | 与 W-4 同一处（:350） |
| MC-N6 | 已改 | 按第 3 条的指定改法（「官方 SDK 只出现在本成员的测试与探针」）。评审建议的整格改写没有采用，因为规格限定只改这一句 |
| MC-N7 | 已改 | `architecture.md` :52 改为「五个需求端口与传输各一个符合性套件（传输的是 `mcpTransportConformance`）、本地真实服务端夹具（在 mcp-host-local）」 |
| MC-N8 | 已改 | `docs/domains/mcp/architecture.md` `ActionInvoker` 行加「关停与中止的情形见组工程设计」，链接到组页「资格与换代」 |
| MC-N9 | 不改 | 改动点在 `docs/domains/mcp/key-flows.md` :7，不在写范围。停止条件第 2 项适用于这一条，其余照做。需要派发者把该文件加入写范围，或另派。改法：「另带 `requestState` 或输入答复（至少一项）与发出代际」 |
| MC-N10 | 不改 | 改动点在 `packages/mcp/mcp-contract/SPEC.md`，不在写范围 |
| MC-N11 | 不改 | 评审写明它「不属于 B 面，给拥有者核对」，没有具体改法。第 6 条 M-2 的裁定是组入口的「mcp-host-local → mcp」是方向规则，不改。允许依赖列写官方 client 与 `package.json` 里它在 devDependencies 不一致：要对齐，须先定「允许依赖」列写不写测试依赖，这是组入口的规则，不是改一句话 |

其他决定：
- 第 6 条（M-2）：按裁定没有改 `README.md` 依赖方向句。
- 钉不动：三份成员 SPEC 的组设计钉都没动（`26ab418a7`）。
- mermaid 节点的标签加了「只在测试与探针里」，与成员表一致。该节点是评审 N2 指到的同一行，所以一并改。
- 不在本轮范围、没动：`mcp/README.md` 与 `README_ZH.md` 的状态行仍写「W2、W3」，这是评审没点名的过程叙述。需要时另派清理。
