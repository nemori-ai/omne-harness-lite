# W1 MCP 线实施规格：`@omne-harness/mcp-contract`

格式沿 `claim` 技能 `references/spec-template.md`，方法 Matt `to-spec`。只写差额，共用部分引用。

- 卡：无卡，负责人 2026-11-03 会话内要求；波包 [w1/wave-pack.md](../wave-pack.md)；F `21175c9f9f05a29d1db509420b75d2b016ed2fbe`
- 上一层：[线级地图](../../line-mcp/context-map.md)；[共用约束](../../constraints.md)；[范式 r1](../../operating-model.md)
- 主工作类型：feature → poteto-mode
- 风险级别：L2。契约成员首次建立公开形状。秘密值与租户隔离的实际保护在 W2、W3 的实现里，按 L3 读

## Problem Statement

W2 的连接、关口、清单与发现，W3 的调用口与两种传输，都要依赖 MCP 的值、结局、端口与服务接口。现在 `mcp-contract` 只是模板草稿。组页列给「mcp-contract 的 SPEC」的未定项有十余项（拒绝与未发出原因的封闭集合、凭据用途值域、授权发现字段、`StdioLaunch` 的变量绑定、上界与配置缺项等），不封闭它们，W2、W3 的写者只能各自猜。

## Solution

把 `mcp-contract` 做成纯契约成员：公开根给调用方（值、结局、失败、五个服务接口、纯函数、接入点正文的类别端口），`./provider` 给实现方（五个需求端口、`McpTransport`、`McpTransportFactory`），`./testing` 给实现方自测（五个需求端口的符合性套件与内存替身，`classifyOutcome`、`mergeListing` 的穷举入口）。成员 SPEC 封闭组页列给本成员的未定项。不依赖官方 SDK。

## 依据与已定事项

| 依据 | 精确修订 | 本规格采用的范围 |
| --- | --- | --- |
| 组工程设计 `packages/mcp/docs/architecture.md` | F | 「协议基线与兼容」「模型」「值对象」「MCP 连接」「MCP 动作清单与 MCP 已知动作」「设置声明与逐动作权限」「MCP 声明的端口」「应用服务」「调用结果」「内容交付」「失败种类」；Q-MC03 剩余义务第 599–604 行 |
| 组入口 `packages/mcp/README.md` | F | 「成员与依赖」 |
| DDD 与 SOLID 建模 `tmp/skill-mcp-domain/model/README.md` | 2026-11-03 本地 | 「MCP 上下文」全节；「建模发现」F1–F5、F9 |
| 类型草图 `tmp/skill-mcp-domain/model/mcp/{values,ports,outcomes,catalog,functions,services,gate}.ts` | 2026-11-03 本地，`tsc` 通过 | 形状的起点。与组页冲突时以组页为准 |
| 资产公开类型 `packages/assets/assets/src/identity.ts` | F | `BodyContract` |
| 公共值 `packages/common/json-text/src/types.ts`、`packages/common/content-block/src/index.ts` | F | `JsonValue`（保留数字字面量）、`ContentBlock` |
| MCP 协议 2026-07-28 修订 | https://modelcontextprotocol.io/specification/2026-07-28 | 结果形状、`resultType`、多轮输入、任务扩展、授权 |

已定事项（reduce 裁定，写者照做）：

1. **入口**：`exports` 为 `.`、`./provider`、`./testing`，都写 `source`、`types`、`import`。
2. **类别名**：接入点正文登记的类别是 `mcp`。
3. **接入点正文**：`{ "name": …, "transport": "stdio" | "streamable-http", "launch"?: { "command", "args"?, "cwd"?, "env"?: [{ "name", "source": "setting" | "credential" }], "facilities"? }, "auth": "none" | "static" | "oauth" }`。`launch` 只在 `stdio` 时出现且必需。name 的词法同 Skill name（`^[a-z0-9]+(?:-[a-z0-9]+)*$`，1–64），必须等于能力名，否则拒绝为 `name-mismatch`。拒绝原因集合：`malformed`、`name-mismatch`、`transport-unknown`、`auth-unknown`、`launch-missing`、`launch-unexpected`。JSON Schema 放 `schema/endpoint-body.schema.json`。
4. **`StdioLaunch` 的变量绑定**（组页第 600 行）：`env` 每项写变量名与来源。`setting` 表示取 `AdoptionView` 交来的同名非秘密配值；`credential` 表示由凭据句柄在起进程时注入。正文不写值。
5. **设置声明项**：三项固定设置按「设置声明与逐动作权限」一节。声明项编码同 Skill：`setting:<类别>:<名字>`。连接目标 `setting:placement-identity:target` 只对 `streamable-http` 产出；凭据 `setting:placement-identity:credential` 只在 `auth` 不是 `none` 时产出；连接超时 `setting:preference:connect-timeout` 总是产出。逐动作权限项本波不经类别端口产出（组页「剩余义务」：`deriveDeclarations` 拿不到清单），只提供纯函数 `actionPermissionItems`。
6. **对端账号**：只由 `peerAccountOf(auth, binding)` 派生；`CredentialUse.acquire` 只答句柄（建模发现 F2）。
7. **`AdoptionView`**：两个操作 `endpoints(access, scope)` 与 `endpoint(access, ref)`（建模发现 F1）。
8. **组内端口**：`McpTransport` 与 `McpTransportFactory` 在 `./provider`（建模发现 F3）。
9. **`mergeListing`**：只按清单修订做条件判断，不跨连接比较代际（建模发现 F4）；输入只能是 `completeListing` 构造的完整清单。
10. **未发出原因**：封闭集合 `not-available-to-you`、`blocked`（带 `local-command-not-enabled` 或 `disabled`）、`unknown`、`correlation-key-in-use`、`cancelled`（建模发现 F5）、`definition-changed`、`action-unavailable`、`mode-unsupported`、`credential-unavailable`（带 `missing`、`rejected`、`unknown`）、`authorization-required`（带授权发现）、`landing-unavailable`、`connection-unavailable`、`config-missing`（带 `connect-timeout` 或 `target`）。
11. **不可用原因**：封闭集合 `no-longer-offered`、`connection-unavailable`、`authorization-required`、`credential-unavailable`、`landing-unavailable`。
12. **结局**：`CallOutcome` 六种（`complete`、`toolError`、`inputRequired`、`task`、`protocolError`、`unknown`），`unknown` 的子因 `stream-broken`、`process-exited`、`abandoned`。
13. **授权发现**（组页第 599 行）：`{ resourceMetadataUrl: string, resourceMetadata: Untrusted<JsonValue>, issuers: string[], scopes: string[] }`。
14. **凭据用途**（组页第 599 行）：`{ kind: 'process-env' } | { kind: 'http-authorization', target }`。
15. **上界与配置**（组页第 603、604 行）：`McpConfig` 必填字段 `principalKey`、`maxListingPages`、`maxActions`、`instructionsByteLimit`，SPEC 写明含义与合法范围，不给默认值。连接超时缺值时，用调用方在操作请求里给的可选 `connectBound`；两者都没有时，未发出原因是 `config-missing`（`connect-timeout`）。`refresh`、`invoke`、`continueWithInput` 的请求带可选 `connectBound`。
16. **`classifyOutcome`**：输入是对端应答（结果或 JSON-RPC 错误）与一个注入的输出校验函数 `(structured, outputSchema) => OutputCheck`。本成员不依赖 JSON Schema 校验库，校验函数由 W2 的通用实现提供。
17. **`toContentBlocks`**：规则按「内容交付」一节。公共 `ContentBlock` 表达不了的内容原样带协议类型交出；不合法的一项转成说明类型与原因的文本块。
18. **不可信值**：`serverInfo`、`instructions`、annotations、进度与日志通知都用 `Untrusted<T>` 包住。
19. **服务接口**：五个服务只写接口与结果值，不写实现，也不写占位实现。`ActionInvoker` 写成 `ActionCalls & TaskControl`。

## 原则与约束

无新增，见[共用约束](../../constraints.md)。另加一条：官方 SDK 的任何类型不进入本成员。

### 跨域概念的五问

1. 需要的外域概念：租户（来自 `access`）、接入点持有、采用修订、凭据配值。缺少租户与对端账号就无法隔离连接；缺少采用修订就无法在正文或配值变化时换连接。
2. 持有与采用修订的含义归 assets，凭据配值归设置与凭据保管方；MCP 只比较相等，不解释、不保存秘密。
3. 持有、采用修订、凭据配值都是 MCP 不解释的品牌字符串；租户用 `legal-identity` 的 `TenantId`。
4. 采用不可读答 `unknown`；未采用答 `not-available-to-you`；凭据失败按 `credential-unavailable`；交接表见组页「MCP 声明的端口」。
5. 换掉调用方或端口提供者时，隔离键、无披露与「不自动重发」不变。反例：同一接入点被两个租户采用，两者的连接键不同。

### 失败语义

| 情形 | 行为 | 由谁负责 | 怎样验证 |
| --- | --- | --- | --- |
| 正常 | 纯函数返回 `ok` | 本成员 | 穷举测试 |
| 失败 | 返回封闭集合里的原因；不抛出（类别端口按 assets 约定除外） | 本成员 | 每种原因一个反例 |
| 未知 | 端口答 `unknown` 时不压成拒绝或空 | W2；本波由符合性套件约束端口 | 套件用例 |
| 取消与清理 | 本成员没有异步资源 | — | 不适用 |
| 外部效果 | 无 | — | 不适用 |

## User Stories

1. 作为接入点作者，我要在加载时知道正文是否合法、是否可能启动本机命令，以便修正正文。
2. 作为资产治理，我要从类别端口得到三项固定设置的声明项，以便配值落到正确类别。
3. 作为端口实现方，我要五个需求端口的符合性套件，以便证明我的实现合规，尤其是「对无权主体答复不随接入点是否存在而变」。
4. 作为通用实现的写者，我要 `mergeListing` 只接受完整清单并保持已知动作，以便不用再推导采用算法。
5. 作为调用方，我要「未发出」与「已发出」在类型上分开，以便知道哪些结局可能有对端效果。
6. 作为调用方，我要对端自报的内容在类型上标为不可信，以便我不把它当作身份或授权依据。
7. 作为后续波段的写者，我要成员 SPEC 封闭全部未定项。

## Implementation Decisions

- 模块：`values`、`outcomes`、`catalog`（清单记录、`KnownAction`、`completeListing`、`mergeListing`、`markUnavailable`、`actionPermissionItems`）、`endpoint`（正文解析与类别端口）、`classify`（`classifyOutcome`、`toContentBlocks`）、`keys`（`peerAccountOf`、两个键函数）、`services`、`provider`、`testing`。单文件不超过约 300 行。
- 公开根导出：值、结局、失败、服务接口与结果值、纯函数、类别端口工厂 `mcpEndpointBodyContract()`。
- `./provider` 导出：`AdoptionView`、`AdoptedEndpoint`、`UseEligibility`、`EligibilityVerdict`、`CredentialUse`、`CredentialHandle`、`CredentialPurpose`、`ProcessLanding`、`ProcessHandle`、`StopScope`、`CatalogStore`、`ExpectedRevision`、`McpTransport`、`McpTransportFactory`、`TransportFailure`、`ListingPage`、`CallRequest`、`AuthorizationDiscovery`。
- `./testing` 导出：五个需求端口的符合性套件 `describe<端口>Conformance`，内存替身 `createMemoryAdoptionView`、`createMemoryUseEligibility`、`createMemoryCredentialUse`、`createMemoryProcessLanding`、`createMemoryCatalogStore`，以及 `classifyOutcome`、`mergeListing` 的穷举样本表 `classifyOutcomeCases`、`mergeListingCases`。
- 形状从草图 `model/mcp/*.ts` 起步；与组页不一致时以组页为准，在交回中列出差异。

## Testing Decisions

- 先写变红的测试，再实现。
- `classifyOutcome`：按协议 2026-07-28 的结果形状做穷举表，覆盖六种结局与 `isError`、缺 `resultType`、未知 `resultType`、JSON-RPC 错误码。
- `mergeListing` 性质测试：已知动作不静默消失；基于旧修订被拒；只接受完整清单；空清单也是「已取得」；修订加一。
- `completeListing`：任一页失败整次不采用；重名拒绝。
- `toContentBlocks`：每种协议内容类型一例；不合法一项转文本块且不丢其余。
- 正文解析：每个拒绝原因一个反例；`launchesLocalCommand` 对两种传输。
- 符合性套件对五个内存替身全绿；故意违反无披露的 `UseEligibility` 替身使套件变红；`CatalogStore` 套件覆盖修订冲突与「从未写入时以 absent 为期望」。
- 测试接缝：公开入口与 `./provider`、`./testing`（包名导入）。

| 检查 | 命令 | 何时跑 |
| --- | --- | --- |
| 成员门禁 | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract` | 每次提交前 |
| 预检 | `pnpm run preflight` | 交回前 |
| 结构扫描 | `pnpm package:template scan --member packages/mcp/mcp-contract --json` | 交回前 |
| 差分变异 | `pnpm run mutation`，范围本成员 | reduce 在合入前跑 |

- 不能声称：真实对端、真实凭据、真实进程落点的行为（W3 与 M2 之后）。

## 待决事项

无。

## Out of Scope

- 五个服务的实现、内存 `CatalogStore` 的生产实现（W2，mcp）。
- 传输契约测试套件与真实服务端夹具（W3）。
- 官方 SDK 依赖。
- 修改组页、领域页、统一语言（reduce 在波末做）。

## Further Notes

- 判据 MC1–MC8 见 [plan.md](plan.md)「判据」。
- `./testing` 的内存 `CatalogStore` 替身与 W2 `mcp` 里的生产内存实现不是同一个东西：前者只为套件自测，后者是第一波的真实实现。W2 决定是否复用。
