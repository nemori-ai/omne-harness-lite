# W1 波末写回清单（组页、领域页）

来源：两份成员 SPEC 的「与组页的差异」表、decisions-r1/r2、各评审的「范围外」。写回由 reduce 在两个闭包合入父分支后做，正文仍标候选决定。行号以 F（21175c9f9）为准。

## packages/mcp/docs/architecture.md

| 行 | 现在 | 改为 | 依据 |
| --- | --- | --- | --- |
| 171 | 对端账号随 `acquire` 交回 | 对端账号只由 `peerAccountOf(认证方式, 凭据配值)` 派生；`acquire` 只答句柄 | G4、F2 |
| 174 | `ActionDefinition` 含 `execution`（含 `taskSupport`） | 删 `execution`/`taskSupport`；annotations 另存为不可信 | G1 |
| 316 | 明文 `http` 是政策，不在本页定 | 只允许回环主机用 `http`，其余拒绝 | E30 |
| 317、513 | 缺凭据「按缺凭据失败」 | `current`/`peer` 答 `config-missing(credential)`；连接类操作答 `credential-unavailable(missing)` | K1 |
| 342 | `acquire` 答句柄与对端账号 | 句柄按用途分型（HTTP、进程），兑现归两实现方约定 | E15 |
| 343 | `ProcessLanding.start` 的 env | env 项分 `setting`/`credential` 来源；`setting` 项由类别端口声明 `setting:placement-identity:env.<NAME>` | E16 |
| 「设置声明与逐动作权限」 | 三项固定设置 | 加第四组：env 的 setting 项；非法配值答 `config-invalid` | E16、E18 |
| 401 | 不可用原因候选成员 | 以 SPEC 封闭集合为准 | — |
| 407–436 调用口 | `mode`、`taskSupport`、`mode-unsupported` | 删除；`task` 结局只由对端应答决定；`continueWithInput` 换代后是「未发出/unknown」 | G1、N13 |
| 421、427、430 | 「方式」相关句 | 删除 | G1 |
| 437–446 状态口 | `taskResult` 无 `cancelled`；无 `provideTaskInput`；445 行未封闭 | `taskResult` 加 `cancelled`；新增 `provideTaskInput`；任务操作只对发起者、需连接材料；445 由 SPEC T6 封闭 | #1、G2、E17、M3-17 |
| 443 | 「发出代际」 | 保留 | — |
| 459 vs 467 | `cancelTask` 既在五操作里又是例外 | 统一为例外：取消在途调用不需连接，任务操作需连接材料，撤采用后答 `effect-unknown(no-connection)` | M3-17 |
| 480–491 调用结果 | `inputRequired` 两字段必填 | 两字段可选、至少一项；`inputRequests` 包 `Untrusted` | #2、M3-1 |
| 「MCP 声明的端口」表 | 五个端口 | 加组内端口 `McpTransportFactory`（材料带 `instructionsByteLimit`）；`AdoptionView.endpoint`；`AdoptedEndpoint.settings` 三态 | F3、F1、E18 |
| 525 | 失败码归 SPEC | 指向 SPEC 的封闭集合与失败码索引 | — |
| 「MCP 连接」不变式 3 | `adopt` 带连接代际 | 只按清单修订；代际在发布边界核对 | F4 |
| 604 剩余义务 | 配置错误报告形状 | 已由 SPEC S4 封闭 | E18 |
| Q-MC03 剩余 599–603 | 授权发现字段、变量绑定、上界 | 已由 SPEC R4、E3、S3 封闭；601 仍开 | — |

## docs/domains/mcp/architecture.md
- 第 28 行 `CredentialUse`：句柄分型，对端账号不由端口答。
- 第 30 行 `AdoptionView`：加按引用取单项、配值三态。

## packages/skills/docs/architecture.md

| 行 | 现在 | 改为 | 依据 |
| --- | --- | --- | --- |
| 18、34 | 复用 `ContentBlock` | 读取内容是文本或字节两种；内容块组装归接收方 | 已定事项 4 |
| 65、433、458 | `./testing` 导出 `SkillAccess` 套件 | 随 `@omne-harness/skill` 的实现以可加改动加入 | 闭包范围 |
| 71、77、87、324、346、491、524、539 | 「归 skill-contract 的规格」 | 改指 SPEC 对应条款 | SPEC 封闭表 |
| 229–241 端口要求 | 完整正文 | 改为摘要，指向 SPEC「需求端口」（现行源） | S3-13 |
| 235、238 | 依据核对 | 端口不核对摘要；带版本核版本、不带核来源层；SkillRef 指向依据所指材料 | E1、S3-13 |
| 274 | `PackageInspection` 在公开根 | 在 `./provider` | G3 |
| 276 | `list`/`export` 不带 signal | 带 signal，可答 `aborted` | S3-16 |
| 291–292 映射 | `open` 的失败映射 | `snapshot` 也可答 `outside-package`、`entry-unreadable`；映射表补两行 | E10、S3-6 |
| 306 | 诊断编号与预算归规格 | 预算已封闭；只有 `detail`，无编号 | S3-16 |
| 316 | 链接与非常规文件 | 快照阶段答 `entry-unreadable`/`outside-package`，检查以该原因结束（次序例外） | S3-4 |
| 318 拒绝次序 | 七项 | 加次序例外；`name-mismatch` 被 YAML 格式错误盖住时判 `malformed` | S3-4、C22′ |
| 386、398 | `outside-package` 含义 | 入口不是包内相对路径（绝对路径）或解析后落在包根之外；`..` 段判 `malformed` | S2-3 |
| 404 | `unsupported` 三种情形 | 只有「没有可读的包」一种 | S2-6 |
| 资产正文一节 | `skillBodyContract` 可加扩展 | 另加：`name` 必须合 `SkillName` 词法（`name-invalid`）；四个扩展字段名保留 | S3-17、C3 |
| Q-SK02 剩余 492 | 资产规格「skill 一段」同步 | 外部义务，保留 | — |

## docs/domains/skills/architecture.md
- 端口实现方一节：`snapshot` 的两种新答复；资产版本不可表示时答 `known-unavailable`。

## 两组 README
- 成员状态：`skill-contract` 与 `mcp-contract` 由「模板草稿」改为「已实现（候选）」；入口三分写明。

## 统一语言 / 领域对象
- 新词候选：无新概念（`effect-unknown`、`config-invalid` 是失败码，不是概念）。复核 UL-mcp-known-action 的「不离开清单」与 `markUnavailable` 一致。
