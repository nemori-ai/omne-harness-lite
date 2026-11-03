# 当前波队列（Skill 与 MCP）

格式沿 `.meta_harness/human/map-reduce-delivery/templates/wave-queue.md`，按[范式 r1](operating-model.md) 变通：没有收口卡，F 是父分支头。

- 当前波：W2 通用实现与本地来源，已收波（父分支 78e978ab6，交接 [w2/handoff.md](w2/handoff.md)）；F = b0f2ec7fb15a3f8572a36ef71af2fd30bf90ca01；计划修订 r3；2026-11-03 派发。三个实现闭包已合入（478e56381、0956ccf01、ff17f7701），写回闭包已合入（3248c271a、78e978ab6）。W1 已收波（父分支 c5a49fd46，交接 [w1/handoff.md](w1/handoff.md)）
- active 线：Skill 线（闭包 `w2-skill`、`w2-skill-host`）、MCP 线（闭包 `w2-mcp-core`）；reduce 的 `w2-spike`。波包 [w2/wave-pack.md](w2/wave-pack.md)
- 下一波预案：W3 调用、传输与目录（`w3-mcp-call`、`w3-mcp-host`、`w3-skill-catalog`），见[波段计划](rolling-plan.html)；W3 的契约可加调整清单在 [w2/schema-check.md](w2/schema-check.md)。预案不授权开工
- 待负责人决定：无

## 修订表

| 修订 | 时刻（UTC） | 变化 | 原因 |
| --- | --- | --- | --- |
| r1 | 2026-11-03 | 首版 | — |
| r3 | 2026-11-03 | W2 开波：`SkillAccess.export` 从 W3 提前到 W2（与 read 共用三段）；`createMcp` 推后到 W3，W2 交 `createMcpCore`（invoker 不能用桩）；w2-prep/prep2 由 reduce 提交（依赖、两处 SPEC 裁定、组页四处写回、`serverInfo` 可选） | 开波前检查与 2026-07-28 核对 |
| r2 | 2026-11-03 | 波末加两个写回闭包（组页、领域页、README），写集按组分开，由子代理写、reduce 合入 | 写回项约 40 处，reduce 串行写比两写者并行慢；波内「共享文件只由 reduce 写」在波末无在途闭包时不再约束 |

## W3 开波前检查项

- 合 `origin/integration/mainline`。
- W3 prep（reduce）：按 [w2/schema-check.md](w2/schema-check.md) 末三节回写两契约的可加调整；把官方 SDK 2.3.1 加进 catalog 与锁文件（只给 `mcp-host-local`）。
- `w3-mcp-call` 首项：连接表遗忘谓词与 teardown 每步 try/finally（成员 SPEC「已知限制」）；临界区内重读受时限约束；`release`/`closeAll` 在落点在途时答 `unconfirmed`。
- `w3-mcp-host` 只用 SDK `Transport` 层（spike 结论）；自写 stdio 流传输与 HTTP fetch 钩子；真实服务端夹具自写 `tasks/*`。
- `w3-skill-catalog`：`SkillCatalog`；`skill` 的真实来源示例。
- `acceptance:lock` 的 7 个主线历史提交与 `execution-environment-host-local` 三条基线失败：与两域无关，报给 main。

## W2 开波前检查项

- 对照 2026-07-28 schema 逐项核两成员 SPEC 的线上形状。
- 两线规格形态一致（套件 `ConformanceCase[]`、品牌 `isX`、三入口）。
- Skill `parse/manifest.ts:47–55` 边界夹具；MCP `brands.ts:50–52`、`endpoint.ts:117–153` 夹具。
- MCP `listing.ts`↔`catalog.ts` 类型环下沉；Skill read-body 读取器克隆记清理候选。
- 开波时把 `origin/integration/mainline` 合进父分支（范式 FI）。
- Skill SPEC 张力：`#ports` 同时写「没有已知集合的实现不答 `known-unavailable`」与「资产版本不可表示时答 `known-unavailable`」，两者相遇时未定；W2 `w2-skill` 规格先裁。
- MCP 组页三处与 SPEC 不一致未写回（写回清单漏列）：`EndpointStatus` 凭据视图（组页二态 vs S7 四态）、不合法内容项写法（D4）、参数名 `actionName` vs 类型 `action`；传输契约测试与真实服务端夹具归哪个成员（Q-MC06）未裁。W2 开波写回。
- MCP SPEC S1 与 S2 张力：S1 要求除 `cancel`/`cancelTask`/`closeAll` 外每个操作先核采用再核资格；S2 写任务操作复用现有连接时不核资格。`queryTask`/`taskResult`/`provideTaskInput` 复用连接时是否跳过 S1 的资格核对未定；key-flows 暂按 S1 字面写。W2 `w2-mcp-core` 规格先裁（M4-9 的本意是复用不核）。
- MCP 组页承接表 `method-and-resource-access.md` 行与 Skill 组页同名行的状态列仍写「未承接」：取得技术接受后才改。
