# W4 计划类窄复核（第 2 轮，只核 B1–B3）

- 评审者：design-reviewer，种类 plan，Claude Opus 5.5。2026-11-06 交回（宿主记 235 秒）。对象：`mcp/plan.md`、`skill/plan.md`、`wave-pack.md`、`mcp/spec.md` 第 1 节第 4 条的工作树现状。
- 结论：B1、B2、B3 都消失；没有新阻断。

| 条目 | 结果 | 证据（摘要） |
| --- | --- | --- |
| B1 | 消失 | M4-2 第一条只查 `lost.ts` 的导出；调用点清单可列出（`calls.ts:311,325`、`tasks.ts:153,157`、`discovery.ts:136`），由 A 面人工读回。`build.ts` 不改的说法在 spec 第 4 条末段、plan 切片 01、波包写集三处一致；`build.ts` 只用 `NoAnswerCause` |
| B2 | 消失 | `mcp-host-local/tests/`（含 `fixtures/`、`model/`）与 `SPEC.md`、`verification/` 已进切片 01 与波包写集 |
| B3 | 消失 | 两个新成员对契约成员的依赖在 reduce 共享写里，三处一致；F 定在共享写之后；`mcp` 移进 `mcp-host-local` 的 dependencies 不成环 |

## 观察（非阻断）与处置

1. M4-1 的 `awk` 起始模式写成 `^## `，成员 SPEC 的标题是 `### 与已定事项和契约的偏离`，读回永远为空。处置：改成起始 `^### 与已定事项`、遇到下一个 `^##` 停的写法（plan 与闭包规格同改）。
2. M4-2 第二条 `-A8` 看不到 `from` 行之上的导入名。处置：改为直接 grep 三个名字在三个服务文件里无输出。
3. 共享写时点在 `mcp/plan.md` 一处写「派发 Skill 线切片 01 之前」。处置：统一为「派发任何闭包之前」。
4. `skill-host-local` 已有 `skill` 的 devDependency，应写「移到 dependencies」。处置：plan 与波包同改。
5. `mcp-contract/docs/public-api.md` 列有 `UnusableCause`，不在切片 01 文件清单。处置：写进闭包规格的写范围。
- 转交派发者的选择问题：`close()` 之后的 `not-sent` 带不带 `unusable`。裁定：不带。关闭是本端的决定（同 `abandoned`），这条连接的结束由连接表负责；写进闭包规格第 2 条。
