# W3 文档写回复核 r2

只读复核。只判 r1 的阻断与未达到项是否消失，以及修复有没有带进新的阻断。没有重新评审其余内容，没有改仓库文件。

- 对象 1：PR #1151（Skill），`.worktrees/w3-docs-skill`，`1eab83b81..7a426a670`（6 个文件，20 行改动）。
- 对象 2：PR #1152（MCP），`.worktrees/w3-docs-mcp`，`f2fc80ace..f55d750d4`（9 个文件；`packages/mcp/README.md` 与两份组页的表格因重排对齐有空白改动，用 `git diff -w` 只看内容改动）。
- 两棵树上 `pnpm run check:docs` 都通过：`PASS: 2751 Markdown files; local links and skill mirrors.`

## 结果表

| 条目 | 结果 | 证据 |
| --- | --- | --- |
| SK-B1 | 消失 | `docs/domains/skills/architecture.md:31` 现为「摘要与检索先按请求过滤或按查询匹配，只对留下的身份问它」。与契约 `skill-contract/SPEC.md:394`（过滤先于核验）、`:395`（匹配先于核验）和组页 `packages/skills/docs/architecture.md:309` 一致，不更宽也不更窄。grep「摘要与检索对每个身份」在 `docs/domains/skills`、`packages/skills` 为 0 |
| SK-B2 | 消失 | `docs/domains/skills/architecture.md:58` 现为「不带依据的描述不带Skill 材料依据，不带依据的读取与列出返回不支持，带依据的操作照常」。与契约 `:349`（`unsupported` 只对不带依据的 `read`、`list`；`export` 总带依据）及同页 `:43` 一致。grep「不带Skill 材料依据，读取」为 0 |
| SK-B3 | 消失 | `packages/skills/docs/architecture.md:316` 现为「读控制文件时字节不符为 `version-changed`，快照阶段的 `bytes-mismatch` 为 `source-unavailable`」。与契约 `:532` 逐点一致。grep「检查途中字节不符」为 0；grep「字节不符」只剩 `:316`、`:481`（读控制文件时）、`:250`（`open` 的端口答复）和 key-flows `:9`，都是新规则 |
| SK-B4 | 消失 | `docs/domains/skills/key-flows.md:9` 现为「读控制文件时字节不符报版本已变」，与组页 `:481` 和契约 `:532` 一致 |
| SK-B5 | 消失 | `packages/skills/docs/architecture.md:82`、`:327` 都改为「`metadata` 是映射但有非文本值时只保留文本值，不是映射时不保留，两种都带兼容提示」，与契约 `:247` 逐字一致。grep「不是文本映射时只保留」为 0。`:323` 的「`metadata` 不是文本映射」是四种软偏离的名称（对应提示 `metadata-not-text-map`），不是保留规则，不构成旧句 |
| MC-B1 | 消失 | `packages/mcp/docs/architecture.md:19`、`:83` 与 `packages/mcp/README.md` 的 mcp-host-local 一行都改为「复用会违反三条硬承诺，或契约根已有同一条规则时，不复用，逐块决定见 SPEC」。与 `mcp-host-local/SPEC.md:121–126`（硬承诺、规则归契约、无协议行为三类理由；「规则归契约」= 契约根已实现的规则）一致，没有再把「无协议行为」一类写成硬承诺。链接 `../mcp-host-local/SPEC.md#sdk-reuse` 的锚点在 SPEC `:119`。grep「只在复用会违反」在 `docs/domains/mcp`、`packages/mcp` 为 0。`:623` 的依据列也已拆开：协议线与 SDK 版本归 RFC-0001，复用策略归 host-local SPEC，回退一次归契约 T3 与裁定第 6 条 |
| MC-B2 | 消失 | `packages/mcp/README.md:51` 与 `packages/mcp/docs/architecture.md`（验证行）都改为「覆盖现代对端与旧对端、断流、需要输入与任务」。grep「清单变化通知」在 `docs/domains/mcp`、`packages/mcp` 只剩 `architecture.md:317`（「本组不订阅清单变化通知」）与 `:412`（「本组不订阅，保持为假」），都与契约 C2、T3 一致 |
| MC-B3 | 消失 | `packages/mcp/mcp/README.md:70` 改为链接 `SPEC.md#mc-10`、`SPEC.md#mc-14` 与「所有权、失败与生命周期」一节。锚点 `mc-10`（`mcp/SPEC.md:74`）、`mc-14`（`:90`）、章节锚点（`:166`）都存在。`README_ZH.md:70` 同改。同一提交还把「维护」一节的模块对照指向 `docs/architecture.md`，该页 `:11–30` 确有模块与条款对照 |
| W-4 | 消失 | `packages/mcp/docs/architecture.md` 的 `McpTransport` 行现为「产品源码不导入官方 SDK，传输按协议实现。通用实现不认识 SDK，SDK 只在 mcp-host-local 的测试与探针里作对照与对端」，与同页 `:19`、`:83` 以及 host-local SPEC（产品源码不导入 `@modelcontextprotocol/*`；`devDependencies` 只给测试对照与 `tests/probes/` 用）一致。依赖倒置行（`:573`）现为「传输实现（含 HTTP 客户端）只在 mcp-host-local，官方 SDK 只在它的测试与探针里」。grep「官方 SDK 只在传输实现一侧」「官方 SDK 和 HTTP 客户端只在」为 0；grep「SDK 只出现在本成员」只剩 `mcp-host-local/SPEC.md:10` 的新文（「本成员的测试与探针」） |

仍在的编号：无。

## 对改动行的核对（新阻断检查）

Skill 的改动行逐条对照契约与组页：

- 兼容策略的依据改指成员规格兼容提示，该节有锚点 `#compatibility-hints`，没有写更宽的内容。
- `SkillCatalog` 一行加「留下的身份中任一个读取权无法判定时返回 `unknown`」，与契约 `:383` 一致。
- 组页验证节「共同前提是每次端口调用都会结束。无披露（S1）另要求两个判定端口对无权主体的答复不随身份是否存在而变」，与性质账本 P0、S1 一致。性质账本锚点 `#ledger` 在 `skill/verification/README.md:22`。
- key-flows 新增「所钉材料的 `SKILL.md` 没有合法头部定界时 `read` 答 `source-unavailable`」，与契约 `:339` 和组页读取第 11 步一致。
- 符合性套件一句写 `./testing` 另有 `SkillAccess` 与 `SkillCatalog` 的套件，与组页 `:3` 一致。

MCP 的改动行：

- 建连时限从「连接进入 `preparing`」起计。组页状态图 `:224` 写「`[*] --> preparing : 启动尝试，代际加一`」，与 `mcp/SPEC.md` MC-5、`:177` 的「`attempt()` 之后」同一时点，没有更宽。
- `mcp-contract/SPEC.md:160–162` 的「与组页的差异」改成一段「十处差异组页已按本页写回」，并写「本页与组页现在没有差异」。抽查 `peerAccountOf`、`CredentialUse` 按用途分型、`taskResult` 另有 `cancelled`、`protocolError` 对未知 `resultType`，组页 `:39`、`:352`、`:469`、`:528` 都对得上。没有发现与契约相反的陈述。全仓无指向该小节标题的链接。
- `docs/domains/mcp/key-flows.md:7` 的「`requestState` 或输入答复（至少一项）」与契约 S2、O2 一致。
- `docs/domains/mcp/architecture.md` 的 `ActionInvoker` 行加指向组页 `#资格与换代` 的链接，该节标题在 `packages/mcp/docs/architecture.md:493`。
- `mcp-host-local/SPEC.md:10` 范围格改为「官方 SDK 只出现在本成员的测试与探针」，与 `:151` 一致。
- `mcp/README.md`、`README_ZH.md` 的「维护」一节只留指向 `docs/architecture.md` 的链接。

## 新阻断

无。

## 观察（非阻断）

- `packages/mcp/README.md` 与两份组页的表格因重排对齐产生大量空白改动，会放大 PR 的行数，内容无变化。
- `packages/skills/docs/architecture.md:323` 的「`metadata` 不是文本映射」作软偏离名称，与 `:82`、`:327` 的措辞并存。读者可能读成保留规则。不影响条款，不计阻断。
