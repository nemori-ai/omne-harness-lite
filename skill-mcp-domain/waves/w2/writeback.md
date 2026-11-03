# W2 波末写回清单（组页、领域页、key-flows、README）

来源：三份成员 SPEC（`skill`、`skill-host-local`、`mcp` 的 SPEC.md）、`reviews/{skill-host-r1,skill-r1,mcp-core-r1}.md` 的 reduce 裁定、`schema-check.md`。写回由两个写回闭包在父分支头 ff17f7701 上做，正文仍标候选决定；写回不授予技术接受。行号以 ff17f7701 为准。

## packages/skills/docs/architecture.md

| 位置 | 现在 | 改为 | 依据 |
| --- | --- | --- | --- |
| 页首状态句 | 只有 skill-contract 已实现 | `skill-contract`、`skill`、`skill-host-local` 都已实现（候选，第二波，尚未取得技术接受）；`SkillCatalog` 仍只有接口 | 成员 SPEC |
| 「端口」映射表 | 没有快照阶段的 `entry-not-found`/`bytes-mismatch` 行 | 加一行：来源在快照阶段答 `entry-not-found` 或 `bytes-mismatch`（契约规定来源不得这样答）→ `read`/`list`/`export` 为 `source-unavailable`；`inspect` 为 `source-unavailable`/`version-changed` | skill SPEC「映射」；skill-r1 裁定 3 |
| 「端口」`DirectorySource` 段 | 两步描述 | 加：失败映射以成员 README「行为」为准（非 UTF-8 名、设备/管道/套接字、悬空/成环链接 → `entry-unreadable`；遍历预算 65536 次访问；每个条目一律 `realpath → 根内判定 → lstat`，文件 `O_NOFOLLOW` 打开；残余窗口；`open` 忽略 digest） | skill-host-local README「行为」 |
| 「读取」第 5–6 步 | 次序正确 | 补一句：第 5 步由 `materialOf` 承担，带依据时所钉材料就是依据本身，`describe` 的 `material.basis` 也是它 | skill-r1 裁定 5 |
| 「读取」第 11 步 | 无 | 补：`SKILL.md` 没有合法定界时整个条目是正文（`bodyOffsetOf` 为 `undefined`） | skill-r1 X4 |
| 「读取」`signal` 段 | 「每次调用端口之前与返回之后」 | 补：包括第 2、3 步的两个判定端口 | skill-r1 阻断 2 |
| 「读取」范围 | 无「请求终点」定义 | 补一句：请求终点 = 请求起点 + 请求长度 | skill-r1 X3 |
| 「应用服务」纯函数 | 列表 | 加 `bodyOffsetOf`（公开根） | 契约 SPEC |
| 「验证」 | 三个套件 | 加 `skillAccessConformance`（15 条，两个夹具世界；A1–A3 只在对应端口对无权主体作答的世界里能看出读取判定被跳过） | 契约 SPEC「符合性套件」 |

## docs/domains/skills/architecture.md 与 key-flows.md
- 状态句：三个成员已实现（候选）。
- 端口实现方一节：`DirectorySource` 的真实失败映射指向成员 README。
- key-flows F-SK01/读取图：`describe` 的 material 取依据；读取判定的两次端口调用也在检查点内。

## packages/skills/README.md
- 成员表：`skill`、`skill-host-local` 改为「已实现（候选）」，各写一句公开根内容；`skill` 的示例依赖 `skill-host-local`。

## packages/mcp/docs/architecture.md

| 位置 | 现在 | 改为 | 依据 |
| --- | --- | --- | --- |
| 页首状态句 | 只有 mcp-contract 已实现 | `mcp-contract` 与 `mcp`（核心：类别端口、读口、状态口、连接；`ActionInvoker` 与 `createMcp` 在第三波）已实现（候选，尚未取得技术接受）；`mcp-host-local` 模板草稿；`mcp-cordis-contract` 未建 | 成员 SPEC |
| 「MCP 连接」不变式 5 | 时限覆盖到 ready | 改为：从取凭据起覆盖取凭据、进程启动、打开传输、协商；取页阶段另起同一上界；端口不尊重信号时连接表自己放弃等待并收口迟到结果 | mcp SPEC「时限」 |
| 「MCP 连接」不变式 6 | 撤采用或被禁用后关闭 | 补粒度：被挡下（`disabled`、`local-command-not-enabled`）是接入点级，`not-eligible`/`unknown` 是主体级，不关闭；`ensure` 建连前重读采用：未采用答 `not-available-to-you`，不可读或修订不符答 `unknown`，不建连 | mcp-core-r1 O1、裁定 2 |
| 「MCP 连接」并发 | 无 | 加一段：同键单飞建连；同键单飞关闭与拆除（关传输 → 停进程 → 释放句柄）；同持有的 `ensure` 串行决定哪个修订的条目存在；迟到结果按代际识别并收口 | mcp SPEC「并发」 |
| 「应用服务」读口 `refresh` | 「保留原采用」三种原因 | 补：发布边界四项核对（代际仍当前、未中止、资格仍 granted、采用修订仍相同）紧挨存储写入；调用方 `signal` 不进共享建连，中止只答 `kept(cancelled)` 不标记清单；取页超时按页失败 → `kept(listing-incomplete)` + `degraded(list-failed)` | mcp SPEC；mcp-core-r1 O3、B1、B3 |
| 「应用服务」`Connections` | `release`/`closeAll` 报告确认范围 | 补：时限后才交来的进程也被停止，范围不是 `tree-confirmed` 时进 `residual`；进程凭据句柄在 `stop()` 返回后释放（迟到进程也是）；已知限制：端口 reject 时资源归宿不保证、落点永不答复时句柄不释放、`closeAll` 不阻止之后的建连 | mcp SPEC「已知限制」 |
| 「资格与换代」 | S1 全部操作 | 补：`queryTask`/`taskResult`/`provideTaskInput` 复用连接时不核资格（prep 已改 SPEC S1）；状态口 `list` 不触发关闭 | mcp-contract SPEC S1 |
| 「设置声明」连接超时 | — | 补 `connectBound` 的使用 | S4 |
| Q-MC06 | 已改 | 无 | — |

## docs/domains/mcp/architecture.md 与 key-flows.md
- 状态句：`mcp` 核心已实现（候选）。
- F-MC01：`ensure` 建连前重读采用；临界区。F-MC02/F-MC03（发现与刷新）：发布边界四项；取页时限；调用方中止。F-MC06：迟到进程与 residual。

## packages/mcp/README.md
- 成员表：`mcp` 改为「已实现核心（候选）」，写明四个服务与 `createInMemoryCatalogStore`；`createMcp` 第三波。

## 成员 SPEC（W3 prep，写回闭包不动）
- `skill-contract`：导出 `MANIFEST_PATH`/`DECLARATION_PATH`、`PAGE_LIMIT`、`sameCapability`；端口答畸形值的处置统一。
- `mcp-contract`：`refresh` 的 `signal?`、`McpConfig.now?`、`canonical`/`sameJson` 与 `testing-values` 导出、端口 reject 语义；见 `schema-check.md`。
