# 闭包 w2-writeback-mcp：把 W2 裁定写回 MCP 组页、领域页、key-flows 与 README

## 身份与位置

- 工作树：`/home/user/omne-harness-lite/.worktrees/w2-writeback-mcp`，分支 `PanQiWei/skill-mcp-w2-writeback-mcp`，基线 ff17f7701（父分支头，含已合入的 mcp 核心）。
- 角色：developer，implementation_kind = 文档写回。不改源码、不改成员 SPEC。作者署名已设好（PanQiWei），不要改。

## 目标边界

W2 把 `@omne-harness/mcp` 的核心（关口、连接表、发现、状态、连接释放、内存存储）做成了实现，三轮评审产生了一批裁定（连接时限覆盖范围、自动关闭粒度、重读采用、发布边界四项、调用方中止、迟到进程、已知限制）。本闭包把它们写回组页、领域页、key-flows 与 README。正文仍标候选决定。

### 写范围（只这六个文件）

- `packages/mcp/docs/architecture.md`
- `packages/mcp/docs/key-flows.md`
- `docs/domains/mcp/architecture.md`
- `docs/domains/mcp/key-flows.md`
- `packages/mcp/README.md`
- `packages/mcp/README_ZH.md`（存在时）

其它文件一律不写（成员 SPEC、源码、统一语言、Skill 组）。

## 输入（按序读）

1. 写回清单：`/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/writeback.md` 的 MCP 各节。
2. 依据：`packages/mcp/mcp/SPEC.md`（结果与不变量、所有权/失败/生命周期——含「并发」「取消」「时限」「已知限制」、与已定事项的偏离）、`packages/mcp/mcp/README.md`「给下一波」、`packages/mcp/mcp-contract/SPEC.md`（S1、S5、S7–S9）；裁定在 `/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w2/reviews/mcp-core-r1.md` 的各「reduce 裁定」节。
3. 写法：先读 `.claude/skills/asd-ste100/SKILL.md` 与 `references/documentation.md`（投影没生成时读 `.meta_harness/agents/skills/asd-ste100/canonical/`）。中文按清晰规则；保持页的结构。

## 实施规格

1. 逐行按 writeback.md 改；每处必须能在成员 SPEC/README 或裁定里找到依据，找不到的不写，列进报告「未写回」。
2. 「归成员」类句子改为指向成员 SPEC 具体节的相对链接，不复制。
3. 不写工作日志；「第二波」「第三波」只用于状态句与「在第三波」这类范围说明；不加新概念（`residual`、`lingering` 是成员词，组页用「未确认停止的进程」）。
4. 不变式 5、6 的改写要保留原有依据层一列；并发一段放在「MCP 连接」不变式之后。
5. key-flows 的 mermaid 图改动最小。
6. 承接表状态列不改。

## 验收清单

- [ ] writeback.md 的 MCP 每一行要么写回、要么在报告「未写回」有理由。
- [ ] `grep -n "覆盖到 ready\|直到 MCP 连接进入 ready" packages/mcp/docs/architecture.md` 为空或已改写为新覆盖范围。
- [ ] 在工作树根跑 `pnpm run check:docs`、`pnpm run check:design`、`pnpm run format:check`，输出原样记入报告；基线既有失败分开列。
- [ ] 提交 1–2 个，中文信息，trailer `Harness: claude-code`、`Agent-Role: developer`；不推送、不开 PR。

## 自主范围

按成员 SPEC 为准；与裁定冲突时按裁定并在报告列出。不能问派发者，自定后写理由。

## 交回报告（写到工作树 `tmp/writeback-report.md`，最终消息复述要点）

1. 改动的文件与节。2. 未写回项及理由。3. 三条检查的输出摘要。4. 自定裁定。5. 提交 hash。
