# W1 第 2 轮裁定（草稿）

## Skill 第 2 轮交回（c3d693b48）写者自定事项

| # | 自定 | 裁定 |
| --- | --- | --- |
| 1 | `sealSnapshot` 新增缺陷 `invalid-root-name`，返回不抛 | 接受：TypeError 只给调用方编程错误 |
| 2 | 控制字节缺少或多出也答 `version-changed` | 接受 |
| 3 | `..` 段一律 `malformed`，只有绝对路径入口判 `outside-package` | 接受本轮；波末写回组页时把 `outside-package` 的含义写成「入口不是包内相对路径（绝对路径）或解析后落在包根之外」 |
| 4 | PS7（按定位存放的来源）与 PR4（无资产版本）答 `NotApplicable` | 接受 |
| 5 | 导入遍历用正则（TypeScript 7.0.2 没有 JS API） | 接受 |
| 6 | `unsupported` 只留 `no-readable-package` | 接受；reduce 作为组页拥有者确认，波末写回 |
| 7 | 「YAML 读不出时不判 name-mismatch」差异无裁定编号 | 补编号 C22′：接受该细化，波末写回组页 |
| 8 | `complete` 定义改为「实际范围终点不小于总长」 | 接受 |
| 9 | E8 优先于 decisions-r1 Skill #5 | 接受，decisions-r1 已改 |

待增量复审（代码、SPEC 表达）与 reduce 复跑结果。

## MCP 第 2 轮交回（a48f6bc09）写者自定事项

| # | 自定 | 裁定 |
| --- | --- | --- |
| 1 | 公开纯函数 `boundInstructions` | 接受：规则只有一处且可测 |
| 2 | 新类型名 `OperationFailure`、`ConnectionFailure`、`ConfigItem` | 接受 |
| 3 | `config-missing` 的项加 `credential` | 接受（C25 的要求本来就蕴含它） |
| 4 | `superseded` 覆盖写入冲突、`mergeListing` 答 stale、发布前换代三种；删 `newer-adoption` | 接受；E24 的措辞按此修正 |
| 5 | `inspect`/`release` 用 Extract 收窄失败联合 | 接受：两者不连接、不读配值 |
| 6 | spec-d 加正则，不用编译器 API（TS 7.0.2 无 JS API） | 接受 |
| 7 | 封闭集合的代码列表放测试里 | 接受 |
| 8 | `::1` 按 `URL.hostname` 的 `[::1]` 比较 | 接受 |
| 9 | `byName` 比较器「大于分支返回 0」的存活 | 判为等价：TimSort 只用 `compare < 0` 决定左右与归并取数，键唯一时返回 0 与返回正数不可区分。在比较器注释写明，不再追 |

待增量复审（代码、SPEC 表达）与 reduce 复跑结果。

## Skill 第 2 轮代码增量复审（无阻断）→ 第 3 轮小追加（草稿）

| # | 发现 | 裁定 |
| --- | --- | --- |
| S3-1 | `./provider` 的类型导出集合没钉住（`export type *` 能绕过三处检查） | 在 spec-d 里用类型层集合相等钉住，或 `exportedNames` 同时匹配 `export *`/`export type *` 并断言其不存在 |
| S3-2 | SPEC「与组页的差异」表依据栏：L63 引不存在的裁定；L67 错引 C18（实为闭包规格「不在范围内」，是延期不是取消）；L70 无编号 | 改来源：L63 记「reduce 裁定 C22′（2026-11-03）接受该细化」；L67 记「闭包规格 W1 范围外，套件随 `@omne-harness/skill` 的实现在下一波加入 skill-contract/testing（可加改动）」；L70 记「reduce 裁定 S2-6（2026-11-03）」 |
| S3-3 | PR4 在材料无资产版本时整条不适用，来源层那一支无用例 | 补一例：不带资产版本、依据来源层与采用来源层不同 → `basis-not-lawful`；内存替身按来源层核对 |
| S3-4 | E10 的 `entry-unreadable` 在快照阶段失败，打破组页 L318 拒绝次序（无快照时判不了 manifest-missing） | 接受为次序例外：SPEC 写明「来源在快照阶段答 `entry-unreadable` 时，检查以 `malformed` 结束，不再按次序判其余原因」；波末写回组页 |
| S3-5 | `UnsupportedWhat` 封闭成单值 | 接受（组页拥有者确认）；波末写回组页 |
| S3-6 | 包内链接解析后落在包外：快照收字节后，`snapshot` 阶段没有规定答什么 | `SkillPackageSource.snapshot` 可以答 `outside-package`（链接解析后落在根外），`inspect` 映射为 `rejected: outside-package`，读取映射为 `outside-package`。SPEC 端口要求与映射表补上；波末写回组页 |
| S3-7 | 建议 1：缺字节/多字节答 `version-changed` 可能把调用方缺陷包装成竞争 | SPEC parse-preconditions 补一句：来源失败由调用方先按映射表处理，再调 `parseSkillPackage`；行为不改 |
| S3-8 | 建议 3：`isShortText` 与 `isBoundedText` 近似重复 | 合并：`isShortText = isBoundedText(v, 256) && isWellFormed && !hasControl` |
| S3-9 | 建议 4：`closed-sets` 比的是测试本地列表，没比 `INSPECT_REJECTIONS` 的次序 | 改为比 `failures.ts` 导出的常量 |
| S3-10 | 建议 2：`rootName` 只拦空与 `/` | 保持；SPEC 写一句理由（根名只用于与 name 比较） |
| S3-11 | 观察：`docs/public-api.md` 与 SPEC L26 对公开根读者的说法不一致 | 统一为「调用方；端口实现方另读 `./provider`」 |

## MCP 第 2 轮代码增量复审（无阻断）→ 第 3 轮小追加（草稿）

| # | 发现 | 裁定 |
| --- | --- | --- |
| M3-1 | `inputRequests` 两条路径信任包装不同（`CallOutcome.inputRequired` 裸 JsonValue；`TaskReport` 包 Untrusted）——reduce 裁定 #2 与 #22 打架 | 两处都用 `Untrusted<JsonValue>`；V4 把它列进「包住」组 |
| M3-2 | `./provider` 类型导出集合守护有漏洞（`export type *`、`export { type X }` 绕过）；spec-d 注释说错手段 | 同 S3-1：正则补两种写法并反向断言 provider.ts 只有 `export type { … } from` 一种形式；注释改实 |
| M3-3 | V3 文字窄于实现（按 WHATWG `URL.hostname` 规范化后比较，`http://127.1/` 等通过） | V3 写明：按 WHATWG URL 解析后的主机比较回环集合；保存原文；传输实现须用同一解析 |
| M3-4 | 根入口类型引用了只在 `./provider` 能命名的 `ExpectedRevision`、`StopScope` | 两个类型挪到根入口，从 `./provider` 去掉 |
| M3-5 | `config-invalid` 的 `env:<NAME>` 到不了（`ProcessSetting` 无 invalid 态） | S4 写明 env 项只有缺失一种配置失败；`ConfigItem` 的 env 项只出现在 `config-missing` |
| M3-6 | S5 没写发布边界核对「取消」与「当前授权」时答什么 | `KeptReason` 增加 `cancelled`；当前授权核对失败时操作以 `Refusal` 失败，不发布，S5 写明 |
| M3-7 | `OutputCheck.violates.reason` 是否契约 | O3 写明：固定值 `structured-content-missing` 是契约；校验函数给出的其他文本不是 |
| M3-8 | `boundInstructions` 对非法 `byteLimit` 抛 RangeError 只在 JSDoc | S3 补一句 |
| M3-9 | 重复：`isDefinitionDigest`/`isInstructionsDigest` 同体；两处相同的 SHA-256 断言；`compareKeys` 与 `byName` 同形 | 合成内部 helper |
| M3-10 | JSDoc「`purpose` is its brand」不实 | 改为「以 `purpose` 字段区分」 |
| M3-11 | 比较器等价理由注释缺 | 在 `byName` 与 `compareKeys` 旁写明「V8 TimSort 只用 `< 0`；不是语言层等价」 |
| M3-12 | `completeListing` 冻结的 `basis` 是调用方引用 | 复制后冻结 |
| M3-13 | 观察：`classifyError` 用 `Number(lexeme)` 判整数，接受 `1e2`、`-32600.0` | 改为词形 `/^-?\d+$/` |
| M3-14 | `release` 在接入点被禁用时答 `blocked`，连接只能靠 `closeAll` 释放 | 接受：组页不变式 6 要求 `Connections` 在下一次使用边界之前自行关闭被禁用接入点的连接；S 条款写明 |

## Skill 第 2 轮 SPEC 表达复审（无阻断；17 条第 1 轮发现 15 闭合 2 部分）→ 并入第 3 轮

| # | 发现 | 裁定 |
| --- | --- | --- |
| S3-12 (M1) | 快照遇出包链接答什么没写；`ListFailure` 无 `outside-package` | 同 S3-6；`PinFailure` 加 `outside-package`（read/list/export 都可能得到）。连带后果写明并接受：有出包链接的包整包不可读，这是包的缺陷 |
| S3-13 (M2) | 端口要求两处现行源；SPEC 漏「SkillRef 指向依据所指的材料」「无已知集合的实现不答 known-unavailable」 | SPEC 是端口要求的现行源，补这两句；波末组页 L229–241 改为摘要并指向 SPEC。PR3 补一例「带早先版本的依据 → adopted 且 SkillRef 指向早先材料」，内存替身已支持 |
| S3-14 (M3) | `basis-not-lawful` 少前提 | L371 加「身份对该主体合法对应时」；无对应时带依据也答 `none` |
| S3-15 (M4) | 实际范围怎样报告未定义 | 定义：实际起点 = 不小于请求起点的第一个字符边界（二进制条目即请求起点），截到总长；实际长度 = 实际交出的字节数；起点 ≥ 总长时报 `{start: 总长, length: 0}`；文本收成空范围时报实际起点（已后移的边界）与 0，调用方按「至少 4 字节」续读 |
| S3-16 (M5) | 差异表漏 list/export 收 signal；封闭表漏组页 L306 | 补两行 |
| S3-17 (M6) | 资产事实变不成 Skill 值（name 不合词法、资产版本超长）时 resolve 答什么 | 类别端口 `judge` 收紧：`name` 必须合 `SkillName` 词法，否则拒绝 `name-invalid`（新拒绝码，assets 的 `Judgment.rejected` 是开放字符串；波末同步资产规格「skill 一段」）；资产版本不合 `AssetVersion` 词法时端口答 `known-unavailable`，原因「资产版本不可表示」 |
| S3-18 (N1–N9) | 索引与措辞：public-api 漏 `PackageInspection`；`ParseInput`/`ParseFailure` 不导出；README 说 acceptance 不存在；schema pattern 的 `.` 不匹配 U+2028/2029；L345「不持有状态」与 WeakSet 矛盾；裁定编号只存在于 tmp；资产正文的入口能否是控制文件；原因列表漏两处来源映射；L363 「必须相符」比组页严；来源层分支无用例 | 全部照改。`ParseInput`、`ParseFailure` 导出到公开根；编号保留并注明「过程标签，决定内容已写全」；资产正文入口同样不得是控制文件；L363 按 PS2 写「包不变时」；来源层用例同 S3-3 |

## MCP 第 2 轮 SPEC 表达复审（1 阻断、10 应修）→ 第 3 轮

| # | 发现 | 裁定 |
| --- | --- | --- |
| M3-15 (B1) | 非调用请求发出后的失败无落点；任务操作与协议映射没写 | `TransportFailure` 三分：`not-sent`（无对端效果）、`no-answer`（已发出无应答，效果未知）、`error-answer`（已发出，收到 JSON-RPC 错误：code、message、data?）。`OperationFailure` 增加 `effect-unknown`（带子因），四个任务操作在 `no-answer` 时答它。T6 写映射：`getTask` 读 tasks/get 的 status、inputRequests、completed/failed；`getTaskResult` 读同一应答的 completed/failed；`-32602` 答 `expired`；其余 `error-answer` 原样交出。`updateTask`/`cancelTask` 去掉 `already-terminal`（协议是 ack-only），终态经 `getTask` 得知。T4 的 401/403 归 `not-sent`，T1 用「有无对端效果」定义 |
| M3-16 (A1) | refresh 里某页传输失败两读 | `not-sent`（连接类）→ `ConnectionFailure`，连接转 degraded，`markUnavailable` 用对应原因；`no-answer`/`error-answer` → 页失败 → `kept(listing-incomplete)`，连接转 degraded |
| M3-17 (A2) | 撤采用后 cancelTask 取不到连接材料 | 任务操作需要现有连接或可重建的采用材料；两者都没有时答 `effect-unknown(no-connection)`。波末写回组页 L467：取消在途调用不需连接，任务操作需要 |
| M3-18 (A3) | 配值缺陷的适用面、次序、invalid 凭据视图 | S4 加表：连接类操作需要 target（HTTP）、credential（auth≠none）、connect-timeout、env（stdio）；`current` 只需 credential（组键）；`release`/`inspect` 不需要配值。次序：target → credential → connect-timeout → env 按正文次序，报第一项。`EndpointStatusView.credential` 加 `invalid` |
| M3-19 (A4) | instructions 由谁截断、上界怎样送达 | `McpTransportFactory.open` 的材料带 `instructionsByteLimit`；传输在 `discover` 时对全文算摘要再调 `boundInstructions` |
| M3-20 (A5) | `principalKey` 只要求稳定 | 写明：同一租户内不同主体映射不同文本，同一主体本次运行内相同；违反是装配方缺陷 |
| M3-21 (A6) | 句柄取得次数与释放时点 | 每条连接按凭据配值 acquire 一次，所有 `credential` 变量共用；进程句柄在 `stop()` 确认后释放；HTTP 句柄随连接关闭释放 |
| M3-22 (A7) | 任务表项寿命 | 本次运行内不删除；终态交出后再查仍转发对端 |
| M3-23 (A8) | `residual` 两处落点 | 只在 `lost` 状态上；视图原样反映状态；重建成功或 `release` 确认后清除 |
| M3-24 (A9) | `basisCurrent` 条件 | 比协议版本与能力（规范化 JSON 相等），不比代际；无连接答 `no-connection` |
| M3-25 (A10) | README 带出 SPEC 没有的行为 | S3 写 RangeError 前提；README 引 SPEC |
| M3-26 (N1–N14) | 见报告 | 全部照改。N2 统一为 `env.<NAME>`；N14 `createMcp` 对非法 `McpConfig` 抛 RangeError |
| M3-27 (范围外 1) | 两份 SPEC 把 reduce 的裁定写成「负责人裁定」 | 两边改为「领域设计裁定（2026-11-03）」；不冒称负责人 |

## 第 3 轮交回的写者自定事项（全部接受）

- Skill（d4114ff6f）：`isBoundedText` 放 `names.ts`（避免 shape↔names 成环）；`name-invalid` 排在 `name-mismatch` 之后、工具引用之前；PS8/PR3/PR4 新例各用可选夹具字段，缺时 NotApplicable；内存来源对不指向包内文件的链接答 `entry-unreadable`；「SkillAccess 套件」依据栏不写波次名。
- MCP（654e422fd）：`OperationFailure` 另含 `error-answer`（第 47 条漏列，写者补对）；照做 M3-3、M3-5；`resourceMetadataUrl` 的 well-known 回退为连接目标的 `/.well-known/oauth-protected-resource`；不合法的连接超时答 `config-invalid`，不退回 `connectBound`。

## MCP 第 3 轮 B1 改法复审（B1 残留 1 阻断）→ 第 4 轮（只 MCP）

| # | 发现 | 裁定 |
| --- | --- | --- |
| M4-1 | 非调用请求收到读不懂的应答无落点 | `TransportFailure` 加 `{kind:'answer-malformed', what}`（status 不在五值、`input_required` 缺 `inputRequests`、`completed` 缺 `result`、错误对象缺整数码或消息、`tools/list` 缺 `tools`、`discover` 结果不合形）；`OperationFailure` 同步加；`ErrorAnswer.code` 按 O4 词形判整数，否则 `answer-malformed` |
| M4-2 | T2「原样不分类」范围 | 限定为 `call` 的应答；非调用请求由传输解释到 SPEC 点名的形状为止 |
| M4-3 | `getTask` 「读内容」 | `getTask` 不交内容，删「内容」；`getTaskResult` 也发 `tasks/get`，读 completed/failed |
| M4-4 | S5 与 S7 冲突；degraded 原因缺 | 非调用请求的 `not-sent`（`authorization-required`、`connection-unavailable`）按 S7 转 `lost`；页的 `no-answer`/`error-answer`/`answer-malformed` 转 `degraded(list-failed)`；`markUnavailable` 后 `CatalogStore` 冲突答 `superseded`，不可用答 `unknown` |
| M4-5 | `current`/`peer` 永不产生新失败；`refresh` 中 `discover` 的已发出失败两读 | `current`/`peer` 用 Extract 收窄；`discover` 的 `no-answer` → `effect-unknown`，`error-answer`/`answer-malformed` → `connection-unavailable` 且连接 `lost(discover-failed)` |
| M4-6 | S9「进程句柄」同名不同义；unconfirmed 与准备失败时的释放 | 改称「进程凭据句柄」；`stop()` 返回后即释放（不论范围）；准备失败立即释放 |
| M4-7 | 关闭后遗留进程无原因 | `LostReason` 加 `close-unconfirmed`：`release`/`closeAll`/自动关闭答 `unconfirmed` 时状态为 `lost(close-unconfirmed)` 带 `residual`；`tree-confirmed` 才回 `none`。「确认停止」= `stop()` 答 `tree-confirmed` |
| M4-8 | 建议 8–10 | S8 写「状态为 none 时」；T6 写 `update`/`cancel` 对已过期任务得 `error-answer(-32602)`；`AdoptionView` 答 `unknown` 时 `cancelTask` 答 `Refusal unknown` |
| M4-9 | 范围外：`cancelTask` 不核资格却可重建连接 | 任务操作可复用现有连接而不核资格；要新建连接必须 `UseEligibility` 答 `granted`，否则 `effect-unknown(no-connection)`。取消只减少效果，不启动新进程 |

## 第 4 轮交回（MCP 302441beb）写者自定事项（接受）
- `ReadFailure = Exclude<OperationFailure, 已发出类三种>`，公开根导出；`LostReason` 加 `discover-failed`。
- 两边 provider 导出形式用例改为耐插桩（Skill 由 reduce 改 3adb30b2c；MCP 由写者改）。
