## 交付

W4 MCP 线切片 02，闭包 `w4-mcp-cordis`（卡 #1119）。宿主在真实 Cordis `Context` 上装 MCP 插件，消费者按三个服务键取到服务，在本地传输与脚本化对端进程上走「刷新 → 调用」。撤除插件时，连接与进程经 `closeAll` 收口。

- **新成员 `@omne-harness/mcp-cordis-contract`**（`service-contract` 变体）。`./cordis` 导出七个抽象 Service 与七个键常量：三个服务键（`mcpActionDiscovery`、`mcpActionInvoker`、`mcpEndpointStatus`）与四个端口键（`mcpAdoptionView`、`mcpUseEligibility`、`mcpCredentialUse`、`mcpProcessLanding`）。键只在 `static provide` 书写一次，键常量取自它（IC-2）。根入口没有运行导出（IC-4）。
- **`mcp-host-local` 的 `./cordis`**：插件工厂 `createMcpPlugin(parts)`，经 kernel-basis 的 `definePlugin` 定义（IC-14）。
  - 工厂参数收函数与本地对象（`principalKey`、`checkOutput`、`clock`、`fetch`）。可序列化的上界与 `clientInfo` 进配置，全部必填。
  - 插件造四个端口适配器，每次调用都从装载时的 `ctx` 现取，缺席时答该端口的 `unknown`。
  - 插件造内存清单库与本地传输工厂，调一次 `createMcp`，逐个 `new` 三个服务子类，共一条 fiber。
  - 插件登记一个撤除函数：`await connections.closeAll()`，不捕获。
- 两个成员的 SPEC、README 与 `docs/` 写到现状。`mcp-host-local/SPEC.md` 的 `./cordis` 一行、组页与领域页由切片 03 写回。

依据：W4 MCP 规格第 9–12 条、D-W4M-1、D-W4M-3；W4 波包决定 1–4；`docs/architecture/cordis-integration-conventions.md` IC-1～IC-9、IC-14、IC-16。

## 验证

- 四个成员的 `build typecheck test` 与 `test:slow` 退出 0。
- `package:template scan`：两个成员结构都是 `pass`，集成没有 `deviation`。
- 装配用例（真实 Cordis 4.0.4，27 条）覆盖下列情形：
  - 旅程，以及每个服务方法的转发。
  - 四个端口逐个缺席，补上端口后照常发布。
  - 资格端口换代、采用端口换代。
  - 配置的接受与拒绝。
  - 撤除后进程已退出、三个键取不到。
  - 撤除时在途调用答 `abandoned`。
  - Cordis 撤除函数拒绝时写日志的机制探针。
- 写者对用例做了变红验证。

评审按 C-SM-08 的一次关口进行，结果贴在卡 #1119。本 PR 在切片 01（`w4-mcp-unusable`）之后合入。
