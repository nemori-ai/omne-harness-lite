# W4 计划类评审 第 1 轮（两线 plan.md）

- 评审者：design-reviewer，种类 plan，Claude Opus 5.5 high。2026-11-06 11:13 后派出，11:20 前交回（宿主记 217 秒）。
- 对象：`waves/w4/mcp/plan.md`、`waves/w4/skill/plan.md`（revision 1，写者档位已改之后的版本）。依据：两线 spec、`waves/w4/plan.md`、`waves/w4/wave-pack.md`、`waves/w3/card-body-after.md` 的 C5、C6。
- 结论：阻断 3，非阻断 7。choice 与 expression 未派。

## 阻断（评审原文摘要）

| 编号 | 文件:行 | 问题 | 建议改法 |
| --- | --- | --- | --- |
| B1 | `mcp/plan.md` M4-2 与切片 01 文件清单 | M4-2 的 `grep -rnE 'lostOfNotSent\|lostOfNoAnswer\|lostOfOutcome' packages/mcp/mcp/src` 在正确实施后仍命中 `internal/build.ts:101,130` 的同名私有函数（只给已失败的建连标 `LostReason`）。spec 第 4 条把「建连里的 `discover`」纳入按标记判断，文件清单却没有 `build.ts`（`build.ts:308` 是建连里 `discover` 的唯一调用处） | 收窄 grep 到 `lost.ts` 的导出与导入方；或把 `build.ts` 列入并写处置。写明建连中 `discover` 带不带标记时 `build.ts` 怎样处置 |
| B2 | `mcp/plan.md` 切片 01 只列 `mcp-host-local/src/`；`wave-pack.md` 写集同 | `mcp-host-local` 的用例用 `toEqual` 断言线路不可用答复的精确形状（`tests/stdio.spec.ts:153`、`session.spec.ts:1532`）。带标记后会变红，写者必须改 `tests/`，越出写范围 | 文件清单与波包写集加 `packages/mcp/mcp-host-local/tests/`；SPEC 与 `verification/` 要同步的也列入 |
| B3 | `mcp/plan.md`、`skill/plan.md` 的共享写；`wave-pack.md` | 共享写没列两个新契约成员对各自契约成员的依赖（`mcp-cordis-contract → mcp-contract`，`skill-cordis-contract → skill-contract`）。模板只加 `@deepseek-ai/cordis`（`create.ts:77`）。写者不改依赖段，这项输入没有生产者 | 共享写补两个新成员的依赖段（及 `./testing` 需要的 devDependencies），同一次 `pnpm install` |

## 非阻断（摘要）

1. 共享写提交到哪个 head、F 在共享写之前还是之后、中间态（草稿成员、指向不存在 `dist/cordis` 的导出）让 preflight 失败时归谁。
2. 两份 plan 把 `pnpm-workspace.yaml` 列为共享写，波包没有；`packages/*/*` 已覆盖新成员，catalog 已有 cordis。
3. M4-1 只 grep 两个短语，改写不删行也能过；应读回整个偏离小节。
4. M4-2 第二条 `grep -B4` 命中 `lost.ts` 的定义行，判断条件可能在 4 行外，要人工判读。
5. 差分变异、metrics 与写者门禁的并跑没有排期；两线各一次 metrics。
6. 符合性条款、违约实现与传输实现同一写者产出，独立性只靠守护写者与关口 A。
7. 进展页与实现架构页刷新、卡正文当前进展更新没落到 MCP 03 待办；C6 证据入口（`handoff.md` 第 5 节）没写；M4-7 没读回卡正文「成果交回」。

## 派发者裁定（2026-11-06）

- B1：成立。按应然把「转 `lost`」定成全函数，写进 `mcp/spec.md` 第 1 节第 4 条：只对就绪连接上的请求适用；建连失败无论带不带标记都结束建连（MC-5），`build.ts` 不改，不在本切片写集里。M4-2 改为核对 `lost.ts` 的导出与三个服务文件的导入。
- 同时收窄 `UnusableCause`，去掉 `abandoned`（没有生产者；新公开字段不能带一个无意义的值）。这把 W3 停放的一项 0.1.0 形状项提前，理由是本切片把这个类型放进每个公开答复。
- B2：成立。切片 01 与波包写集加 `mcp-host-local/tests/`（含 `tests/fixtures/`、`tests/model/`）与 `mcp-host-local/SPEC.md`。
- B3：成立。共享写补两个新成员的依赖段；`./testing` 的 devDependencies 按 spec 用到的契约成员一并加。
- 非阻断 1：采纳。共享写在派发前提交到父分支，F 定为共享写之后的父分支头；共享写提交只含草稿成员与依赖，preflight 失败归 reduce 处置。
- 非阻断 2：采纳，删 `pnpm-workspace.yaml`。
- 非阻断 3、4：采纳，改判据命令。
- 非阻断 5：采纳，写排期：D 与 metrics 只在没有写者跑门禁时由 reduce 跑；metrics 两线合成一次，放在两条线的 Cordis 闭包都合入之后。
- 非阻断 6：采纳，违约实现与「条款 × 违约」用例划给守护写者。
- 非阻断 7：采纳，补进 MCP 03 待办与验收。
