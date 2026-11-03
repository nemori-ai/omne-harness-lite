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
