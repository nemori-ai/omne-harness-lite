# 闭包规格 w1-mcp-contract

## 身份与位置
- 闭包：w1-mcp-contract
- 卡与修订：#0 r1（无卡，负责人 2026-11-03 会话内要求）
- 工作树：/home/user/omne-harness-lite/.worktrees/w1-mcp-contract
- 分支：PanQiWei/skill-mcp-w1-mcp-contract
- 基线：21175c9f9f05a29d1db509420b75d2b016ed2fbe
- 清晰度：定

上一层：本波 MCP 线实施规格 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/mcp/spec.md 与交付计划 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/mcp/plan.md。本规格与它们冲突时，以本规格为准；与组页正文冲突时停下交回。

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5，effort high。理由：契约成员首次建立公开形状，W2、W3 都依赖它；单成员，规格完整。policy_version 947.1；宿主 Claude Code（云端）。

## 目标边界
目标：把 @omne-harness/mcp-contract 做成 W2、W3 能直接依赖的纯契约成员。按 spec.md 的四个切片顺序做：
1. 接入点正文与类别端口：parseEndpointBody、launchesLocalCommand、mcpEndpointBodyContract()、schema/endpoint-body.schema.json。
2. 清单与结局：清单记录与 KnownAction、completeListing、mergeListing、markUnavailable、actionPermissionItems、classifyOutcome、toContentBlocks、digestDefinition、peerAccountOf、catalogKeyOf、connectionKeyOf。
3. 端口与套件：./provider（五个需求端口、McpTransport、McpTransportFactory）；./testing（五个需求端口的符合性套件、内存替身、classifyOutcome 与 mergeListing 的穷举样本表）；五个服务接口。
4. 成员 SPEC。

形状与决定：
- 以 spec.md「已定事项」1–19 为准，逐条照做，不重新裁定。
- 形状从 DDD 草图起步：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/model/mcp/values.ts、ports.ts、outcomes.ts、catalog.ts、functions.ts、services.ts。草图已用 tsc 校验，catalog.ts 的 mergeListing 已改为只按修订判断。草图与 spec.md 的已知差异：spec 已定事项 3 把 StdioLaunch 的 envNames 改成带来源的 env 项；已定事项 15 新增 connectBound 与 McpConfig 的三个上界字段；已定事项 16 让 classifyOutcome 接收注入的输出校验函数。以 spec 为准。
- connection.ts、in-flight.ts、gate.ts 是 W2 通用实现的参考，本闭包不实现它们。
- 建模说明 /home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/model/README.md 的「MCP 上下文」「建模手法」「建模发现」F1–F5、F9 是本闭包的设计依据。
- 组页 packages/mcp/docs/architecture.md 是技术唯一源。草图与组页不一致时以组页为准，并在交回中列出每一处差异。

不在范围内：五个服务的实现；生产用内存 CatalogStore；传输契约测试与真实服务端夹具；官方 SDK；组页、领域页、统一语言的修改；任何新依赖。

### 写范围
- `packages/mcp/mcp-contract` — 本闭包唯一的写入目录。package.json 只允许改 exports、files 与 scripts，不改 dependencies 与 devDependencies

### 排除的调用方
- `packages/mcp/mcp` — W2 的通用实现草稿，本闭包不改；停止条件：需要它配合时停下交回
- `packages/mcp/mcp-host-local` — W3 的本地宿主草稿，本闭包不改
- `packages/assets/assets` — 资产成员，本闭包只读它的公开类型；停止条件：需要改资产类型才能实现时停下交回
- `pnpm-lock.yaml` — 共享文件，只由 reduce 写；停止条件：需要新依赖时停下交回
- `packages/mcp/docs` — 组页由 reduce 在波末写回

## 验收清单
- A1 公开根、./provider、./testing 三个入口的导出键集合与 spec.md「Implementation Decisions」一致；公开根不导入 ./testing；成员不依赖任何 MCP SDK（判据 MC1）。
- A2 正文的每个拒绝原因一个反例；launchesLocalCommand 对两种传输；deriveDeclarations 按已定事项 5 产出（MC2）。
- A3 completeListing 与 mergeListing 的性质测试：已知动作不静默消失并保留最近合法定义；基于旧修订被拒；任一页失败整次不采用；重名拒绝；空清单是「已取得」；修订加一（MC3）。
- A4 classifyOutcome 穷举表覆盖六种结局，以及 isError、缺 resultType、未知 resultType、JSON-RPC 错误码；输出校验通过注入函数得到三种结论（MC4）。
- A5 toContentBlocks 每种协议内容类型一例；不合法一项转成文本块且不丢其余各项（MC5）。
- A6 五个符合性套件对内存替身全绿；故意违反「对无权主体答复不随接入点是否存在而变」的 UseEligibility 替身使套件变红；CatalogStore 套件覆盖修订冲突与「从未写入时以 absent 为期望」（MC6）。
- A7 pnpm package:template scan --member packages/mcp/mcp-contract --json 除草稿标记外无缺项，或剩余项在交回中逐条说明（MC7）。
- A8 SPEC 封闭 spec.md「已定事项」1–19 与组页第 401、430、465、525、599–604 行列给本成员的未定项；schema/endpoint-body.schema.json 与已定事项 3 一致（MC8）。
- 收尾门禁：pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract；pnpm run preflight；pnpm run format:check；pnpm run lint:rules。失败时先在基线上复跑同一命令，区分既有失败与本闭包引入的失败。
- 接受级别 L2。提交 trailer：Harness: claude-code、Agent-Role: developer；作者用环境变量里的 PanQiWei 身份，不写 Co-Authored-By。按切片提交，至少四个提交。

## 实施规格
负责人原则：MCP 领域只交付领域内部与用 MCP 的词表达的对外契约；契约与 SPEC 不点名调用方。MCP 不做授权流程、不保管凭据、不选进程落点、不判定动作权限、不自动重发。

### 命名账本
- 值：EndpointName、EndpointHolding、AdoptionRevision、CredentialBinding、ActionName、DefinitionDigest、Generation、CatalogRevision、CorrelationKey、RequestState、TaskId、ProtocolVersion、Millis、Untrusted、EndpointRef、AuthKind、StdioLaunch、TransportDeclaration、EndpointDefinition、ConnectionTarget、EndpointSettings、PeerAccount、ConnectionKey、CatalogKey、PeerIdentity、ActionDefinition、KnownActionId、CallMode。
- 清单：KnownAction、UnavailableReason、AdoptionBasis、Freshness、ActionCatalogRecord、CatalogState、CompleteListing、ListingDefect、MergeRefusal。
- 结局：CallOutcome、DeliveredContent、OutputCheck、TaskStatus、Refusal、NotSentReason、InvokeResult。
- 端口（./provider）：AdoptionView、AdoptedEndpoint、UseEligibility、EligibilityVerdict、BlockedReason、CredentialUse、CredentialHandle、CredentialPurpose、ProcessLanding、ProcessHandle、StopScope、CatalogStore、ExpectedRevision、McpTransport、McpTransportFactory、TransportFailure、ListingPage、CallRequest、AuthorizationDiscovery。
- 服务接口：EndpointInspection、ActionDiscovery、ActionCalls、TaskControl、ActionInvoker、EndpointStatus、Connections，及结果值 CatalogView、RefreshResult、InvokeRequest、ContinueRequest、EndpointStatusView、McpConfig、McpPorts、McpServices。
- 纯函数：parseEndpointBody、launchesLocalCommand、mcpEndpointBodyContract、digestDefinition、toContentBlocks、classifyOutcome、completeListing、mergeListing、markUnavailable、actionPermissionItems、peerAccountOf、catalogKeyOf、connectionKeyOf。

## 性质及证据义务
- 无披露：UseEligibility 与 AdoptionView 的套件必须有用例，比较「无权主体问已存在的接入点」与「无权主体问不存在的接入点」的答复完全相同。交回中贴出用例名与变红证据。
- 不可信：对端自报内容在类型上只能经 Untrusted 取得。交回中说明类型上怎样保证。
- 无 SDK：交回中贴出 package.json 的依赖段与源码 import 清单。
- 品牌授予：每个品牌只由一个校验函数授予；as 只出现在校验之后。交回中列出全部 as 的位置。

## 施工计划
1. 在基线上跑收尾门禁中的成员门禁，存输出。
2. 切片 01：先写变红的测试，再实现正文解析、类别端口与 schema。提交。
3. 切片 02：清单与结局的纯函数，先写性质测试与穷举表。提交。
4. 切片 03：端口、服务接口、套件与替身，先写违反无披露的替身证明套件会变红。提交。
5. 切片 04：写 SPEC，跑全部验收与门禁。提交。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖。推送与 PR 由 reduce 做。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w1-mcp-contract。另一位写者并行写 packages/skills/skill-contract，写范围不相交。派发者唯一合回。可以用 SendMessage 向派发者提澄清问题；派发者的回答会记进本规格「追加记录」。改变范围的要求只以「追加记录」为准。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w1-mcp-contract/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 再读：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w1/mcp/spec.md 全文；/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/line-mcp/context-map.md「先读什么，读到哪停」所列范围；/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/constraints.md。
- 协议：MCP 2026-07-28 修订，只在写 classifyOutcome、toContentBlocks 时按需取对应类型。
- 必须加载：ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100。
- 模板：成员已是 typescript-package@3.0.0 草稿骨架；成员文档要求见 docs/member-documentation.md。

## 当前认知
- 已确认：基线上本成员是模板草稿，build、typecheck、test 通过；四个公共成员与 content-block 已由 reduce 声明为依赖。
- 假设：MCP 2026-07-28 的结果形状可以只用 JsonValue 表达，不需要 SDK 类型。不成立时停下交回。
- 未知：无。

## 返回与恢复
内联交回：每个提交号；每条验收的命令与结果（含日志时间与提交号）；草图与组页的差异表；全部 as 的位置；无披露用例名与变红证据；未覆盖项。过程输出留 /home/user/omne-harness-lite/.worktrees/w1-mcp-contract/tmp/w1-mcp-contract/。

## 已知会受影响的现有用例
- `packages/mcp/mcp-contract/tests/public-entry.spec.ts`：模板生成的入口测试，按新的导出集合改写。

## 停止条件
- 必须改写范围外文件或新增依赖才能通过检查时停下交回。
- 组页与本规格冲突时停下交回，不自行选一边。
- 协议结果形状必须依赖 SDK 类型才能表达时停下交回。

## 追加记录

### 第 2 轮（2026-11-03，reduce 追加；依据 waves/w1/reviews/decisions-r1.md）

第 1 轮评审（正确性、设计与实践、SPEC 表达、交付边界）的裁定如下。全部照做；每条标了裁定编号，不重新裁定。差分变异与结构读数的处置见本节末尾「第 2 轮补充」（reduce 收到报告后追加）。基线不变（21175c9f9），在现有分支上继续提交。

**A. 契约形状（合入前改，之后只做可加改动）**
1. [G1] 删除 `CallMode`、`InvokeRequest.mode`、`ContinueRequest.mode`、`NotSentReason` 的 `mode-unsupported`、`ActionDefinition.taskSupport` 以及 C1/C2 里按 `taskSupport` 判方式的条款。2026-07-28 由服务端逐次决定是否建任务（SEP-2663：clients do not signal task preference on the request itself），`task` 结局只由对端应答决定。客户端是否声明 tasks 扩展能力归传输实现（W3），SPEC 写一句。
2. [G2] 任务多轮输入：`McpTransport.getTask` 的答复带 `inputRequests?: Untrusted<JsonValue>`；新增 `McpTransport.updateTask(taskId, inputResponses: JsonValue)`，答 `'accepted' | 'already-terminal'` 或 `TransportFailure`；`TaskControl` 新增 `provideTaskInput(access, task: TaskRef, inputResponses)`。组页第 445 行由此封闭，SPEC 删未封闭项。
3. [E15] 凭据句柄按用途分型：`HttpCredentialHandle { authorize(headers), reportRejection(), release() }` 与 `ProcessCredentialHandle { release() }`（带品牌、对 MCP 不透明）；`CredentialUse.acquire` 的答复按 `purpose` 返回对应类型。SPEC 写明：`process-env` 句柄的兑现归 `CredentialUse` 与 `ProcessLanding` 两个实现方之间的约定，MCP 只传递不读取；内存替身的 WeakMap 旁路就是这条约定的内存版。
4. [E16] `deriveDeclarations` 对每个 `source: setting` 的 env 项另产出 `setting:placement-identity:env.<NAME>`。`processEnv` 缺该名时「未发出」，`config-missing` 的 `item` 扩为 `'connect-timeout' | 'target' | \`env:${string}\``。
5. [E18] `AdoptedEndpoint.settings` 每项改为 `{kind:'absent'} | {kind:'invalid', text: string} | {kind:'value', value: <品牌>}`；`NotSentReason` 与 `Refusal` 增加 `{kind:'config-invalid', item}` 与 `{kind:'config-missing', item}`（`Refusal` 原来没有 `config-missing`）。
6. [E22] `TaskRef` 带 `connectBound?: Millis`；`queryTask`/`taskResult`/`cancelTask`/`provideTaskInput` 与 `current`/`peer`/`refresh` 的失败联合统一为 `Refusal` 加连接类原因（`credential-unavailable`、`authorization-required`、`landing-unavailable`、`connection-unavailable`）。
7. [E19] `AuthorizationDiscovery`：`resourceMetadata` 改为可选，另带 `metadata: 'fetched' | 'unavailable'`；SPEC 写明 `scopes` 取 `WWW-Authenticate` 的 `scope`、缺则取元数据 `scopes_supported`，`issuers` 取元数据 `authorization_servers`。
8. [E23] `PeerIdentity.instructions` 的 `digest` 改为品牌 `InstructionsDigest`，格式同 `DefinitionDigest`，对截断前全文算；截断在完整 UTF-8 字符边界内。
9. [E27] `EndpointStatusView` 增加 `residual?: readonly {kind:'process', confirmed: StopScope}[]`；`lost` 状态带同样的 `residual`。
10. [C11] `completeListing` 收 `basedOn: CatalogRevision | 'absent'`（取得前经 `CatalogStore.read` 读到的修订）；`mergeListing(current, listing)` 只核清单自带的 `basedOn`，删去调用方另给的参数。
11. [C14/C21] 伪造或复制的 `CompleteListing` 抛 TypeError；`MergeRefusal` 只剩 `'stale-revision'`。写法统一为品牌类型 + 模块私有 WeakSet + 登记并收窄的私有守卫；`actions` 冻结到集合层（C15）。
12. [C12] S7 的 `lost` 原因拆出 `authorization-required`。
13. [C18] 套件命名改为 `mcp<Port>Conformance()`（`mcpAdoptionViewConformance` 等）；补 `runConformanceCase`、`isNotApplicable`（沿 tool-contract 形状）。
14. [C16] `./provider` 去掉与根重复的 `AuthorizationDiscovery`、`BlockedReason` 导出。
15. [E30] `ConnectionTarget` 的词法：`http` 只允许回环主机（`localhost`、`127.0.0.1`、`::1`），其余 `invalid`。

**B. 行为修正**
16. [C7] `inputRequests` 存在时必须是对象，否则 `protocolError`/`result-malformed`。
17. [C8] `auth:"none"` 的正文含 `source:"credential"` 的 env 项判 `malformed`；`transport:"stdio"` 配 `auth:"oauth"` 判 `malformed`（授权规范只用于 HTTP）。
18. [C9] 省略 `content` 的结果答 `protocolError`/`result-malformed`。
19. [C13] 内存 `UseEligibility` 替身：未授予的主体保持 `not-eligible`，`setUnreadable(..., false)` 不把它变成 `granted`。
20. [E17] 本次运行内保存已发出任务表，键（租户、主体、持有、taskId）；四个任务操作只对发起者可用，非发起者、重启后或表里没有的一律答 `unknown`，不随任务是否存在而变。这是服务接口层的要求，写进 S2 与套件说明；实现在 W2/W3。
21. [E25] 设施名词法与 Skill 对齐 `^[a-z][a-z0-9-]{0,31}$`。

**C. SPEC 与 schema**
22. [C10/E24 之 M-M1] V4 改为「下列对端内容用 `Untrusted` 包住：…；其余对端内容原样交出，同样不是身份或授权依据」，点名 `issuers`、`scopes`、`inputRequests`、定义里的 title/description/icons/_meta、`fault.message`/`data`。
23. [E20] 写明 `reportRejection` 由传输实现在收到 401/403 且该请求曾用句柄授权时调用，先回报再报 `authorization-required`。
24. [E21] S1 的例外加 `closeAll`；`list` 用 `endpoints` 加逐项资格判定，任一项 `unknown` 则整次 `unknown`。
25. [E22] 写明 K1 `credential-missing` → `credential-unavailable(missing)`；缺凭据配值时 `current`/`peer` 答 `config-missing(credential)`。
26. [E24] 为 `not-connected`（本次运行无连接，`peer` 不连接）、`superseded`（写入时 `CatalogStore` 答修订冲突）、`listing-incomplete`（页失败、重名、超上界）补条款；`UseEligibility` 的 `unknown` 入表。
27. [E26] `NotApplicable` 单列为「不适用」，既不是通过也不是失败；本成员对内存替身的测试把它当失败。
28. [C17] 写明八个只查非空的品牌是名义区分。
29. [C20] 写明 WeakSet 登记是进程内凭证：不可序列化传输；双份加载互不承认。
30. [E29] 封闭表：连接超时上界指向 S4、分页与动作上界指向 C1、「三项字段」改「四个字段」；C3 规范化写转义方式与输出编码（UTF-8，JSON 字符串按 RFC 8785 转义）；D2 写 base64 标准变体带填充；D5 位置从 0 计；E5 写明 `deriveDeclarations`/`references` 抛 `TypeError` 且文本带原因；O4 补出 `peer-error`；`stop()` 幂等；`observe` 抛出不影响调用；`refresh` 时 `CatalogStore` 读取不可用答 `unknown`。
31. [E13] 类型是形状的唯一来源：删去 R2、R3、S7 与失败码总表里逐项抄写的联合，只留每一项何时出现；封闭集合保留为代码列表并加一条测试钉住与类型相等。
32. [E14] 依据改引「负责人 2026-11-03 裁定」并把决定写全；L261 的「W2」改为「`@omne-harness/mcp` 的内存实现」。
33. [E29] schema `$id` 带格式版本 `:1`。
34. [#12] `package.json` 的 `files` 加 `schema`。

**D. 文档与测试**
35. [#13] README.md、README_ZH.md 写实（去掉草稿标记）；`docs/public-api.md`、`docs/architecture.md` 写实；`docs/flows.md`、`object-model.md`、`context.md` 各写一段真实说明；`docs/cordis.md` 写不适用的理由。按 `docs/member-documentation.md`。
36. [交付 1] 加 `tests/provider-types.spec-d.ts`，用 `expectTypeOf` 列出 `./provider` 的类型导出集合。
37. [交付 3] `tests/public-entry.spec.ts` 的导入遍历改用 TypeScript 编译器 API 或同时匹配两种引号。

验收追加：A1–A8 照旧；新增 A9：`CallMode`/`mode-unsupported`/`taskSupport` 在 `src` 与 SPEC 中无命中；A10：`provider-types.spec-d.ts` 存在且通过；A11：README 无草稿标记，`pnpm package:template scan --member packages/mcp/mcp-contract --json` 的 findings 为空。收尾门禁照旧。按本节的 A、B、C、D 分别至少一个提交。
