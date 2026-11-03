# W1 第 1 轮裁定（草稿，评审收齐后定稿）

裁定人：reduce（本会话）。依据写在每条里。标「待评审」的条目等相应评审面的报告。

## MCP 写者自报的偏离

| # | 偏离 | 裁定 | 依据 |
| --- | --- | --- | --- |
| 1 | `taskResult` 答复增加 `cancelled` | 接受；波末写回组页状态口 | 协议任务扩展有「已取消、无结果」的终态；组页表漏了这一种 |
| 2 | `inputRequired` 的 `inputRequests` 与 `requestState` 都改为可选，两者都缺答畸形 | 接受；波末写回组页「调用结果」 | 协议规定至少有一项 |
| 3 | `degraded` 与 `lost` 的原因集合由 SPEC 封闭（S7） | 接受 | 组页第 181 行只写状态，原因集合本来就归成员 SPEC |
| 4 | 传输交出原样对端应答，由 `classifyOutcome` 分类 | 接受；草图据此修正 | 组页「纯函数」一节写的就是「对端应答到 CallOutcome」；校验函数传输拿不到 |
| 5 | `ActionDefinition` 去掉 annotations，另存为 `Untrusted` | 接受 | 已定事项 18 |
| 6 | 清单的 `actions` 用按名排序的只读数组，不用 `ReadonlyMap` | 接受 | 运行时对象不直接成为数据契约（根 AGENTS） |
| 7 | `AdoptionView.endpoint` 未采用时答 `'not-adopted'` | 接受 | 判别值比 `undefined` 诚实 |
| 8 | `markUnavailable` 保留 `no-longer-offered` | 接受 | 原因更准确 |
| 9 | 14 个公开品牌守卫 `isX` | 接受，并定规则：只做检查的值公开 `isX(value: unknown)`；会变换输入或失败原因多于一个时才公开 `toX → Outcome`。Skill 修复轮据此改 | 设计与实践面的建议；typescript-best-practices 的 verifying type guard |
| 10 | 组页第 601 行不封闭 | 接受；MC8 的行号表是 reduce 列错，已定事项 5 优先 | 逐动作权限项要资产 SPEC 扩展 `deriveDeclarations` 的上下文，拥有者在资产一侧，M2 之后 |
| 11 | 组页第 445 行不封闭 | 接受；记为 W3 调用口的设计输入 | 牵涉新的对外操作 |
| 12 | `package.json` 的 `files` 没带 `schema` | 修复轮补上 | 与 Skill 一致；schema 要随包发布 |
| 13 | README 与 `docs/` 仍是模板占位 | 修复轮写成：双语 README、`docs/public-api.md`、`docs/architecture.md` 写实；其余专题写一句真实说明（`cordis.md` 写不适用的理由） | `docs/member-documentation.md`：有真实内容的成员不留占位 |

## Skill 写者自报的偏离

| # | 偏离 | 裁定 | 依据 |
| --- | --- | --- | --- |
| 1 | 公开根多 `toAssetVersion`、`toPackageDigest` | 接受 | `SkillResolution` 的实现方要从资产正文读 `package.digest`，没有授予函数就只能写 `as` |
| 2 | W2 需要「正文起点」与「资产正文读成声明投影」两个公开函数 | 接受，W2 以可加改动加进 skill-contract | 可加改动不破坏已合入的契约 |
| 3 | `./testing` 运行时导入 vitest（devDependency） | 修复轮改为与 tool-contract、mcp-contract 一致的无框架形态：套件返回 `ConformanceCase[]`，用 `node:assert` | 仓库先例；消费者不必装 vitest；两个契约成员形态统一 |
| 4 | `acceptance/` 四个文件未建 | reduce 以 main 角色在闭包分支上补建 | 验收锁只允许 main 或 qa 改 |
| 5 | `export` 的总量上限未写 | SPEC 加一句「上限随 W3 的 export 实现封闭」 | export 在 W3 |
| 6 | 组页第 492 行：`skillBodyContract` 扩展的技术接受与资产规格同步 | 记为外部剩余义务，不在本波 | 拥有者是资产规格 |
| 7 | `package.json` 的 `description` 过时 | 修复轮改写 | 不是依赖字段 |
| 8 | `sealSnapshot` 收文件字节而非条目 | 接受，健康评述记一笔代价：来源须整包读入内存才能交快照 | 算法只有一处 |

## 正确性与设计两面提出的（修复轮）

| # | 候选 | 发现 | 裁定 |
| --- | --- | --- | --- |
| C1 | Skill | `parseSkillPackage` 控制字节不符抛 TypeError | 改为返回 `version-changed`；TypeError 只留给伪造快照（`assertSealed`） |
| C2 | Skill | `scripts/../run.sh` 判 `outside-package` | 改为 `malformed`（`..` 段是非法路径，不是解析后出包） |
| C3 | Skill | 四个扩展字段名成为保留字段 | SPEC 写明；不改行为 |
| C4 | Skill | schema `"const": 1` 对 `1.0` 放行 | 改为 `"type":"integer","const":1` 并在 description 写明词形 |
| C5 | Skill | `SkillPackageSource` 套件不核 `open` 的 `digest` | SPEC 补规则：按内容摘要存放的来源找不到该 digest 答 `package-not-found`；不按摘要存放的来源可以忽略它，字节由 Skill 按条目摘要核对。套件补一例：内存来源对外来 digest 答 `package-not-found` |
| C6 | Skill | 走不到的分支、`findings` 出参、`parse-package.spec.ts` 551 行 | 前两项修；测试文件按拒绝原因拆 |
| C7 | MCP | `inputRequests` 不核对形状 | 存在时必须是对象，否则 `result-malformed` |
| C8 | MCP | `auth:none` + `source:credential` 加载期放行 | 判 `malformed`；同理 `stdio` + `oauth` 判 `malformed`（授权规范只用于 HTTP） |
| C9 | MCP | 省略 `content` 当 `complete` | 改为 `result-malformed`（协议要求 content 必需；与 O5 一致） |
| C10 | MCP | SPEC V4 比实际宽 | 改为列举哪些内容经 `Untrusted` |
| C11 | MCP | 清单不绑定取得时读到的修订 | `completeListing` 收 `basedOn: CatalogRevision | 'absent'`；`mergeListing` 只核清单自带的 `basedOn`，去掉调用方另给的参数 |
| C12 | MCP | S7 `preparation-failed` 吞掉「需要授权」 | 拆出 `authorization-required` |
| C13 | MCP | 内存 `UseEligibility` 替身默认 `granted` | 未授予的主体保持 `not-eligible` |
| C14 | MCP | 伪造 `CompleteListing` 答 `not-complete` | 改为抛 TypeError，`MergeRefusal` 只剩 `stale-revision`；与 Skill 一致 |
| C15 | MCP | `completeListing` 浅冻结 | 冻结到集合层 |
| C16 | MCP | `./provider` 重复导出根已有类型 | 去重 |
| C17 | MCP | 八个品牌守卫只查非空 | SPEC 写明是名义区分 |
| C18 | 两边 | 套件形态 | 统一到 tool-contract 形态：`ConformanceCase<F>[]` + `node:assert`，命名 `skill<Port>Conformance()` / `mcp<Port>Conformance()`，每用例一份新 fixture；补 `runConformanceCase`、`isNotApplicable`。Skill 删子进程变红证明，改为进程内 `failing()`。`ConformanceCase` 等三件本波仍各成员一份，是否进公共成员 W4 再议 |
| C19 | 两边 | 判定类答复 | 统一成带 `kind` 的判别联合；Skill 的 `ReadVerdict` 改为 `{kind:'granted'}|{kind:'refused'}|{kind:'unknown'}` |
| C20 | 两边 | WeakSet 代价 | 两份 SPEC 写明：进程内凭证，不可序列化传输；双份加载时互不承认 |
| C21 | 两边 | 「只能由构造器造出」写法 | 统一：品牌类型 + 模块私有 WeakSet + 登记并收窄的私有守卫；伪造抛 TypeError |

## 组页层面的裁定（reduce 自己的设计错误，合入前改契约，波末写回组页）

| # | 发现 | 裁定 |
| --- | --- | --- |
| G1 | `CallMode`、`mode`、`mode-unsupported` 来自 2025-11-25 线；2026-07-28 由服务端逐次决定是否建任务，`execution.taskSupport` 已不在 schema | 删除 `CallMode`、`InvokeRequest.mode`、`NotSentReason` 的 `mode-unsupported`、`ActionDefinition.taskSupport`。`task` 结局只由服务端应答决定。客户端是否声明 tasks 扩展能力归 W3 传输 |
| G2 | 任务 `input_required` 经 `tasks/get` 取 `inputRequests`、`tasks/update` 交回答复，契约没有 | 契约层补齐：`McpTransport.getTask` 答复带 `inputRequests?`；新增 `McpTransport.updateTask(taskId, inputResponses)`；`TaskControl` 新增 `provideTaskInput(access, task, inputResponses)`。实现在 W3。组页第 445 行由此封闭 |
| G3 | `PackageInspection.inspect(locator)` 在公开根带出 `PackageLocator` | `PackageInspection` 接口移到 `./provider`：它的调用方是来源与资产登记一侧，不是读者 |
| G4 | 组页第 171 行「对端账号随句柄交回」与第 342 行不一致 | 波末改第 171 行 |



| # | 发现 | 裁定 |
| --- | --- | --- |
| 1 | 两边类型层的导出集合没有测试 | 修复轮各加一个 `*.spec-d.ts`，用 `expectTypeOf` 列出 `./provider` 的类型导出集合 |
| 2 | Skill `public-entry` 的导入遍历读 `dist` | 修复轮改读 `src`（与 MCP 一致）；`dist` 过期会误过 |
| 3 | MCP 导入遍历只认单引号 `from './…'` | 修复轮改用 TypeScript 编译器 API 或同时匹配两种引号 |
| 4 | MC8 把第 601 行列为必封闭项 | reduce 列错，见上表 MCP #10；plan.md 的 MC8 行改正 |

## SPEC 表达面提出的（修复轮）

| # | 候选 | 发现 | 裁定 |
| --- | --- | --- | --- |
| E1 | Skill | S-B1 `resolve` 是否核对摘要 | 按组页 L238：端口不核对摘要。带资产版本核版本，不带核来源层；摘要由 Skill 在读取第 7 步核。套件用例改为「资产版本不合法」才答 `basis-not-lawful`；SPEC L230/L249 统一 |
| E2 | Skill | S-M1 字节范围 | 65536 是每页封顶，也是缺省长度；`length` 超过封顶向内收到 65536；`start` ≥ 总长交空内容、`complete: true`；负数或非整数是前提违反，抛 TypeError；零长度交空内容、`complete` 按 `start ≥ 总长` 判。本版本不可配置；README 删「可覆盖的策略值」 |
| E3 | Skill | S-M2 `open` 的 `digest` | 同 C5 |
| E4 | Skill | S-M3 模块实例 | 同 C20 |
| E5 | Skill | S-M4 `SafeReason` | SPEC 写明 `toSafeReason`/`isSafeReason` 只判词形；披露义务写进 `SkillResolution` 的端口要求 |
| E6 | Skill | S-M5 中止 | 每次端口调用前与返回前各检查一次 `signal`，任一次已中止即答 `aborted`，不交部分内容 |
| E7 | Skill | S-M6 BOM | 保留 BOM（`ignoreBOM: true`），文本与范围对齐 |
| E8 | Skill | S-M7 export 上限 | 本版本没有上限；写明。将来加上限是破坏性改动，到时另裁 |
| E9 | Skill | S-M8 资产正文的跨项规则 | 适用同一套规则：重复判 `malformed`，入口必须已规范化 |
| E10 | Skill | S-M9 非常规文件 | `SourceFailure` 增加 `'entry-unreadable'`，来源在 `snapshot` 时答；Skill 的 `inspect` 映射为 `malformed`，`read`/`list`/`export` 映射为 `source-unavailable`。波末写回组页端口表 |
| E11 | Skill | S-M10 偏离登记 | SPEC 加「与组页的差异」一节（每条附裁定）与「组页行号→条款」封闭表，参照 MCP SPEC |
| E12 | Skill | S-N1/N2/N5/N6 | 照改：schema description 补三项；长度单位统一按码点；`rootName` 非空且不含 `/`；格式 |
| E13 | 两边 | S-N3/M-N6 类型重抄 | 类型是形状唯一来源；SPEC 只写每一项何时出现与行为句，删去逐项抄写的联合与对象字面量；封闭集合保留为代码列表并加一条测试钉住与类型相等 |
| E14 | 两边 | S-N4/M-N4 依据指向 tmp | 改引「负责人 2026-11-03 裁定」并把决定写全；正文不出现波次名 |
| E15 | MCP | M-B1 `process-env` 句柄 | 句柄按用途分型：`HttpCredentialHandle { authorize, reportRejection, release }`、`ProcessCredentialHandle { release }`（对 MCP 不透明的品牌对象）。兑现归 `CredentialUse` 与 `ProcessLanding` 两个实现方之间的约定（领域交接页已写），MCP 只传递不读取；替身的 WeakMap 旁路就是这条约定的内存版，SPEC 写明 |
| E16 | MCP | M-B2 `env.source: setting` 声明通路 | 修订已定事项 5：`deriveDeclarations` 对每个 `source: setting` 的 env 项另产出 `setting:placement-identity:env.<NAME>`；`processEnv` 缺该名时「未发出」，`config-missing` 的 `item` 扩为 `'connect-timeout' \| 'target' \| \`env:${name}\``；多个 `credential` 项共用同一份凭据配值，各自注入什么归 E15 的约定；`auth:none` + `credential` 判 `malformed`（C8） |
| E17 | MCP | M-B3 任务操作限发起者 | 本次运行内保存已发出任务表，键（租户、主体、持有、taskId）；`queryTask`、`taskResult`、`cancelTask` 三个都只对发起者可用，非发起者、重启后或表里没有的一律答 `unknown`，不随任务是否存在而变。已知限制：任务不跨重启 |
| E18 | MCP | M-B4 非法配值 | `AdoptedEndpoint.settings` 每项改为 `{kind:'absent'} \| {kind:'invalid', text} \| {kind:'value', value}`；修订已定事项 10：`NotSentReason` 与 `Refusal` 增加 `config-invalid`（带 item）与 `config-missing`（带 item）。L47 封闭表改实 |
| E19 | MCP | M-M2 授权发现取值 | `scopes` 取 `WWW-Authenticate` 的 `scope`，缺则取元数据 `scopes_supported`；`issuers` 取元数据 `authorization_servers`；`resourceMetadata` 改为可选，另带 `metadata: 'fetched' \| 'unavailable'`（修订已定事项 13） |
| E20 | MCP | M-M3 `reportRejection` | 由传输实现在收到 401/403 且该请求曾用句柄授权时调用，先回报再报 `authorization-required` |
| E21 | MCP | M-M4 S1 范围 | `closeAll` 列为例外；`list` 用 `endpoints` 加逐项资格判定，任一项 `unknown` 则整次 `unknown` |
| E22 | MCP | M-M5 状态口与读口 | `TaskRef` 带 `connectBound?`；三个任务操作与 `current`/`peer`/`refresh` 的失败联合统一为 `Refusal`（含 `config-missing`/`config-invalid`）加连接类原因（`credential-unavailable`、`authorization-required`、`landing-unavailable`、`connection-unavailable`）；K1 `credential-missing` → `credential-unavailable(missing)` 写明 |
| E23 | MCP | M-M6 `instructions` | 在完整 UTF-8 字符边界内截断；摘要对截断前全文算 SHA-256，格式同 `DefinitionDigest`，品牌 `InstructionsDigest` |
| E24 | MCP | M-M7 失败码闭合 | 为 `not-connected`（本次运行无连接，`peer` 不连接）、`superseded`（写入时修订冲突）、`listing-incomplete`（页失败、重名、超上界）补条款；UE `unknown` 入表；按 E13 钉住 |
| E25 | MCP | M-M8 设施名词法 | 与 Skill 对齐 `^[a-z][a-z0-9-]{0,31}$` |
| E26 | MCP | M-M9 `NotApplicable` | 单列为「不适用」，既不是通过也不是失败；成员自己对内存替身的测试把它当失败（替身必须全覆盖） |
| E27 | MCP | M-M10 残留进程 | `EndpointStatusView` 增加 `residual?: readonly {kind:'process', confirmed: StopScope}[]`；`lost` 带 `residual` |
| E28 | MCP | M-M11 445 | 由 G2 封闭，删未封闭项 |
| E29 | MCP | M-N1/N2/N3/N5/N7 | 照改：封闭表引用；C3 规范化写转义与编码；D2 base64 标准变体带填充；D5 从 0 计；`$id` 两边都带格式版本 `:1`；`stop()` 幂等、`observe` 抛出不影响调用、`refresh` 读取不可用答 `unknown` |
| E30 | MCP | 明文 `http` | 只允许回环主机（`localhost`、`127.0.0.1`、`::1`）用 `http`，其余 `invalid`；写进 V3 |
| E31 | MCP | 601 未封闭 | 接受（见 MCP #10） |

## 待评审面补充

- 结构读数面：超线函数的处置（拆分 / 保留并写理由）与两处克隆。
- 差分变异面：存活清单与处置。
