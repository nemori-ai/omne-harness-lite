# Core 开发验证

[English](README.md) · 简体中文

本开发成员承接核心包的真实组合验证，产品包通过公开构建入口消费。依赖全部是开发依赖，
不会令 core 产品包反向依赖 infra。

本工具检查真实存储一致性、W1 独立公开消费者、五个正文提供者的资产组合、流装配组合及独立打包消费者。
存储性质与负控依据见 [Storage SPEC](../../packages.0.0.1.legacy/core/storage/SPEC.md) 和
[验证义务](../../packages.0.0.1.legacy/core/storage/verification/README.md)。其他行为由实际成员的公开入口及薄 SPEC 约束，
从[架构维护入口](../../.meta_harness/design/architecture/README.md)定位拥有者。本工具不定义产品政策。

从仓库根准备锁定环境并运行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness-lite/core-verification... run build
pnpm --filter @omne-harness-lite/core-verification run typecheck
pnpm --filter @omne-harness-lite/core-verification run test
```

存储有效性自测的两条稳定用例：

| Test ID | 实际判据 |
|---|---|
| `storage.conformance.real-sqlite` | 未改动的公开 `openStorage` 在临时文件 SQLite／WAL 上运行完整套件，19 条全部通过，零跳过 |
| `storage.conformance.detects-disabled-foreign-keys` | 测试侧复用公开 `SqlStorage` 和 `NodeSqliteDriver`，仅在写连接取得后、事务开始前关闭并读回确认 `foreign_keys`；同一完整套件中恰 C-11／C-12 因期望 `ReferenceViolation` 而收到 `undefined` 失败，其余 17 条通过 |

子进程退出码、信号、超时、机器报告与目标断言分别检查；启动错误、缺依赖、没有测试、
任意其它错误、跳过或超时不能满足预期失败。错误提供者只是开发侧包装，不是另一套
产品行为或内存替身；SQLite 的写事务、错误映射、读快照和句柄关闭仍由真实公开实现承担。

每次执行在根 `tmp/core-verification/` 创建唯一目录，保存子进程原始 stdout／stderr、
JSON 报告、执行参数和外键注入观察。父测试拥有子进程及私有数据库目录：结束后删除
自己的临时数据库，保留原始证据；超时停止该次进程组。HUB 验收应保存这些唯一证据再退休工作树。

本成员没有 PostgreSQL、跨进程持久、租户装配外键或断电保证的验收覆盖，也不声称覆盖
所有可能错误。流装配组合线使用已接受并已释放的实际公开接口。

隔离任务可通过 `OMNE_CORE_VERIFICATION_EVIDENCE_ROOT` 选择自己拥有的证据目录；
相对路径从执行仓库根解析，绝对路径也必须位于本检出的 `tmp/` 内，空值／越界路径响亮失败。
原默认路径及全部判据保持不变。W6 命令示例：

```sh
OMNE_CORE_VERIFICATION_EVIDENCE_ROOT=tmp/w6-core-verification/my-run \
  pnpm --filter @omne-harness-lite/core-verification run test
```

配置根下分别创建 `storage`、`w1-public-consumers`、`asset-consumers`、`stream-consumers`、`packed-consumers`；
不会据此改写已经保存的原始日志或推导清理其它目录的权限。

## W1 独立公开消费者

`src/w1-public-consumer.ts` 构建为 `dist/w1-public-consumer.js`，由真实 Node 子进程运行。
它只通过五包根 `exports` 与批准的 `./testing`／`./schema` 子入口加载构建产物，
检查根入口确实解析到各包 `dist/index.js`；Node 应拒绝未公开的 `src/index.ts` 子路径。
三个 Schema 的实际公开字节分别与已采用的 identity v1／offer v2／content v3 冻结字节逐 hash 核对。
消费时没有产品源码别名或 Vitest 转换器。
下表是有限场景，产品定义仍归上面的契约与实现映射。

| 稳定子场景 Test ID | 判据与采用范围 |
|---|---|
| `w1.kernel.outcome-public` | 公开 succeed／fail 产生互斥的成功／失败形状，isSuccess 判别；kernel 投影表 |
| `w1.kernel.public-lifecycle` | 公开 definePlugin 的非法配置启动失败且 apply 未执行、合法配置 apply 恰一次且生效；fiberIsActive 与 resolveOptional 在撤除前后同判；Cordis 4.0.4 |
| `w1.kernel.public-assembly-cleanup` | 公开 bootAssembly 撤除服务；两个先前已 ACTIVE 插件后第三 apply 抛原 Error，等待整体以同一实例拒绝且 cleanup 按 second→first；节点装卸表 |
| `w1.identity.public-values` | 品牌解析、TenantId 结构相等／唯一规范序列化、同账号不同租户；S-2／S-5／S-7／S-13 |
| `w1.identity.in-band-closed-input` | 缺席、空值、边界空白、未知枚举与额外身份分量以 invalidInput 到达；效力不可用保持独立失败支；S-10～S-12／S-31～S-33 |
| `w1.identity.public-parent-snapshot` | 显式快照的近到远链、上级算自身、不可用／环不返回短链；S-14／S-15；不是正式 Alloy 重跑 |
| `w1.identity.public-warrant` | 公开签发／核实正例、重放仍可核、错误用途／账号／密钥／缺席／自制凭证拒绝；S-35 原语范围 |
| `w1.offer.public-time-shape` | RFC3339 按时间点相等、正时长构造、非法时长带内拒绝、形状通过不代替跨字段判定；S-4／S-14／S-22 |
| `w1.offer.public-evaluation-order` | 等于到期仍 pending、严格晚于才过期、不可用先于不存在、已有终结记录优先、三种终态同 false；S-8／S-13／S-20 |
| `w1.storage.exception-dependencies` | 只映射 StorageUnavailable；三个其他错误类及任意调用方抛出值按同一实例重抛，不转不可用；节点失败映射 |
| `w1.storage.public-migrations` | 公开迁移组合保留片段、顺序名及相同函数引用，重复名字响亮失败；节点迁移装配面 |
| `w1.content.public-lossless-json` | 六种精度／书写形式、解码重复键、嵌套重复键、中性 failed、opaque 传输边界与非法 JSON 写拒绝；S-12／S-24／V-11 模块部分 |
| `w1.content.public-block-judgment` | 完整调用大参数往返、自有冻结值、具名优先拒绝、不修补输入、半截 rawArguments 原样保留；S-12／S-13／S-24／S-26／S-27 |
| `w1.content.public-metadata-meaning` | 媒体规范形式／无模态、能力结构相等、附件只按 storage/key 相等、精确非负整数 bytes；S-6／S-7／S-20／S-21 |

`tests/w1-public-consumer.spec-d.ts` 的六组 `w1.types.*` 只从根公开声明导入。
它们覆盖 Outcome 分支、身份品牌、效力与解析结果区分、过期状态／时钟品牌、存储协议／只读核对、
opaque 与互斥调用形状；各 `@ts-expect-error` 同样由严格 tsc 检查，负例若不再报错会失败。
offer 的不可变只在已设计的 readonly 类型面断言，不增加 runtime 深冻结承诺。

`tests/dependency-surface.spec.ts` 另核对已批准的依赖例外，与存储失败映射场景分开：

| 稳定 Test ID | 判据与采用范围 |
|---|---|
| `w1.consumer.adopted-dependency-exceptions` | 实际读取 kernel／storage 根入口的源码、构建声明与构建 JS 的相对依赖图；kernel 只出现 Cordis／Standard Schema 类型，storage 只出现 Kysely 类型，二者根 JS 都无外部运行时依赖；批准的 `kernel-basis/testing` 仅有 Cordis、`storage/conformance` 仅有 Kysely `sql` 与 Vitest 的运行时依赖；D-025／D-026 与两节点实现设计 |
| `w1.consumer.dependency-parser-detects-forbidden-edges` | 在受控文本负控中识别 import／export／require／动态 import／类型 import，包括禁止方向与产品根入口取用测试子路径的边；忽略注释、拒绝计算式模块名，不能把不可核对的动态路径当通过 |

检查器复用 TypeScript 编译器 AST，在实际入口图中记录每个读取文件的 hash，并在
`tmp/w1-public-consumers/dependencies-*` 保存报告；它是受控入口图核对工具，不是通用
模块解析器或全仓隔离证明。开发成员自身可以同时消费 core 与真实 infra 提供者；
这一点不能成为产品 core 反向依赖 infra 或业务包的例外。

父用例 `w1.consumer.built-public-packages` 核对固定14项清单、全通过、零遗漏及正常退出。
`w1.consumer.detects-wrong-outcome-expectation` 故意把答案42预期改成0，在同一真实消费者上
要求恰 Outcome 场景以 AssertionError 失败、其余13项通过、退出码1且无信号／超时；
启动失败或任意非零退出不能代替该负控。它验证测量错误能被发现，不是产品源码变异测试。

每次父用例在根 `tmp/w1-public-consumers/normal-*`／`negative-*` 保存原 stdout／stderr、
执行元数据及 JSON。报告中的14个子场景与父测试／类型测试计数分开，不相加声称产品自测数。
独立 Node 子进程只服务本次公开消费边界，不构成部署的跨进程接收协议、持久重启或每一跳数无损证据。
实际租户隔离、标识唯一、凭证领域守卫／秘密保管、生产时钟及 JSON 外部读写仍在相应 owner。

## 完整根类型消费者

`tests/w1-public-types-complete.spec-d.ts` 直接从已构建的五包根入口 `import type`，
覆盖本次明确盘点的 103 个具名类型：identity 24、offer 10、kernel 4、storage 27、content 38。
三个包的同名 Schema 类型使用本地 alias，公开名字仍由独立库存核对。库存测试通过
TypeScript 的实际模块解析验证入口是 `dist/index.d.ts`，并逐项比对声明与直接类型导入。
值／类型双用途的类导出由前述值消费者覆盖，不混入显式类型导出计数。

| 类型场景 Test ID | 最低有效使用与重要约束 |
|---|---|
| `w1.types.complete.kernel-named-protocol` | PluginDefinition 消费 Standard Schema 与具型 config；FiberStateValue 只认采用版本状态；Outcome／Ack 可用 |
| `w1.types.complete.identity-six-brand-directions` | AccountId／OrganizationId／LoginStateId 两两双向共六条不可赋；通用 Branded／OpaqueIdentifier 可实例化 |
| `w1.types.complete.identity-values-and-snapshots` | 身份记录、角色／组织种类、资格／解析结果、层级与上级快照／派生结果可消费；读失败不伪装缺席 |
| `w1.types.complete.identity-warrant-and-schema` | 凭证与密钥类型消费公开函数返回；用途闭合；Schema 类型可用 |
| `w1.types.complete.offer-time-and-input` | 正时长与时间点品牌不可互换；状态求值显式输入／Clock 可用；Schema 类型可用 |
| `w1.types.complete.storage-types` | 协议、四型异常联合、迁移片段与 preflight 输入／结果可消费；核对的表集合只读 |
| `w1.types.complete.content-json-and-schema` | JSON 值、数组、对象、读结果与 Schema 可用；只读数组无写面，任意函数不是 JSON |
| `w1.types.complete.content-blocks-and-metadata` | 块结构与媒体／派生／附件元数据类型可构造；带派生表示必须同时给 transcript |
| `w1.types.complete.content-call-result-and-judgment` | 调用、半截调用、结果、原因与判定类型可消费；结果内容不包含工具调用、拒绝不含修补状态 |

`public-type-surface.spec.ts` 的库存核对还用故意漏导入与 alias 的文本验证检查器自身。
每次保存独立 `tmp/w1-public-consumers/types-complete/inventory-*` 报告，包含完整名单、
根声明及相对声明／源码图 hash、实测 HEAD／dirty 状态与编译选项；不覆盖旧证据清单。
实际严格类型检查的原始结果与库存结果分别登记，库存通过本身不代替 tsc。
既有 Outcome 失败／配置类型、OfferTiming readonly 和 opaque／互斥调用的类型负例继续运行。
这些场景只证明公开类型入口可消费与列出的类型约束，不逐字段镜像实现，也不执行类型夹具
来声称产品运行行为、持久性或 runtime 深冻结。

## W6 真实 core 组合与打包消费者

实际消费者只通过成员的构建后公开入口组合。具体场景及目标断言由测试源码维护，
不是中央版本登记或单次执行台账。Skill 当前读取／值与保留正文消费者的范围仍须区分，
这些夹具不关闭未裁决的完整 Skill 语义。

`w6-asset-consumer` 只通过已构建的公开入口连接五个真实 bodyContract → asset-model →
asset-evaluation。它使用实际 Skill 文本读取、清单解析、记录判断、求值、Slash 展开、
MCP 动作命名、Tool 参数判断和 Messages 递归边界；没有在 fixture 中实现这些行为。
caller 提供的文件条目、时刻、成员资格与 MCP 快照是显式前提，不证明真实文件系统、
OAuth、当前成员资格、第三方计费或持久化事实。Connector 第六端口按阶段范围延期。

资产组合 fixture 按已接受 AE4 显式传入根的 `definition`、`references`、`attributes` 和 `source`。当前合成根使用 `attributes: []` 与已有 `ast_root` 第1版来源；重排指纹和类别拒绝用例保留这两个成员，避免被输入形状检查提前拦截。根正文仍是不透明测试占位，因此这组测试不证明 PRE-9 的真实根正文来源，不改变产品默认策略。

`tests/w6-asset-consumer.spec.ts` 核对固定16个 Test ID，正常运行全绿。
指定负控只把工作区权限的预期 `self` 改为 `member`，要求恰
`w6.asset.workspace-normalized-skill-reading` 报 AssertionError，其余15项绿；
超时、启动错误、信号与任意非零退出都不能算该负控通过。原始输出及执行信息分别保存于
`tmp/w6-core-verification/asset-consumers/normal-*`、`negative-*`。

构建后运行独立打包验证：

```sh
OMNE_CORE_VERIFICATION_EVIDENCE_ROOT=tmp/w6-core-verification/my-run \
  node tools/core-verification/dist/w6-packed-consumer.js
```

该命令 `pnpm pack` 实际成员，在自己的临时消费者内离线安装 tarballs；消费者的
overrides 同时把传递的 `0.0.0` 依赖钉回这批 tarballs，避免从 registry 取同名包。
它不改包内容、不使用源码别名或 workspace 源码软链接。20 个目标的公开子路径期望在验证源码中独立固定，不从被测制品生成。
支持依赖按实际 workspace 生产／peer 依赖闭包打包，不增加目标 API 覆盖数。
首次离线运行前须准备锁定外部依赖的 pnpm 缓存，缓存缺失属于环境失败，不能算产品负控。

根与批准声明子路径的类型从 TypeScript 已解析导出符号枚举（含 `export type *`、别名与
值／类型双用类），逐个 `import type` 并重新导出，独立 `tsc` 在严格模式、
`skipLibCheck: false` 下检查；全部公开 JSON 子入口同样以实际 JSON import 消费并核对解析位置。
库存自身有星号／别名／双用途类型的受控反例。
这证明公开声明闭包可消费，业务语义的类型约束仍由相应公开类型场景和节点测试承担。
同一份已构建资产消费者还复制到独立 tarball 消费者，明确检查11个公开根入口全部解析
在该消费者的 node_modules 下，并运行上述固定16个资产子场景；这次运行的输入、stdout
与构建产物 hash 单独保存，不把 workspace 运行改标成打包证据。

流消费者使用当前 Messages 与 ModelResponse 的公开根。受控模型路由明确给出适配绑定和完整的纯文本档案约束。这些仅组合流装配的夹具没有适配器请求投影、输出摘要证据或上游用量，因此 MR9 校准明确记录 `not_retained`／`missing_usage`，不虚构观察。报告的 `specEpoch: 3` 及下表历史契约坐标标识原 W6 验证时期，不表示当前包根仍提供旧版，也不把历史制品重新签收。

只运行这条流组合和帧数负控：

```sh
pnpm --filter @omne-harness-lite/core-verification exec vitest run tests/w6-stream-consumer.spec.ts --maxWorkers=1
```

`w6-stream-consumer` 通过 CB／CA → AR → SA → Messages／MR 的六个实际公开根入口运行13个固定场景，
相同构建 JS 也在独立 tarball 消费者再次运行。判据沿用独立采用的规范输入和手算值，覆盖：

| 稳定 Test ID 后缀（前缀 `w6.stream.`） | 判据与采用范围 |
|---|---|
| `duplicate-parameters-versus-outer-text` | 参数解码重复键保留完整 raw＋unparseable；接收外层 JSON 重复键为 malformed；CB3 S-24、AR2 S-29、SA3 S-10／S-11 |
| `lossless-numbers-and-opaque-arguments` | 大数与极小数原文跨 SA／Messages 保留；参数内部块形状不参与外层 ID 唯一；SA3 S-10、Messages3 S-37 |
| `bad-name-retained-as-unparseable` | 非法名及超长名完整封口为 unparseable，合法128字符可解析；CB3 S-12、SA3 S-10 |
| `cut-incomplete-versus-safe-merge` | 未封口及破坏性裁剪为 incomplete；安全合并与已封口状态区分；SA3 S-12／S-33 |
| `decoded-voice-split-invariance` | 实际已解码字节分片与整块相同；串接 base64 文本拒绝；AR2 S-19、SA3 S-27 |
| `tool-frame-replace-and-account` | 真替换填、开块顺序、首次内容、工具结算；8接收帧＋1合并帧＝9，真实 FrameAccount／ToolCallAccount 形状；SA3 S-13、CA2 S-11／S-15 |
| `trim-pairing-and-frame-formulas` | 配对 long／rejected 抵消、两条帧公式及各原因精确手算；SA3 S-14、CA2 S-15 |
| `reported-and-unknown-accounts` | 报回与未知分开，零不当未知；负金额／错来源／重复账拒绝且原态保留；CA2 S-20、SA3 S-13 |
| `refusal-priority-and-historical-state` | 表示层优先、八种序列失败、拒绝前后公开历史投影不变；SA3 S-25／S-26 |
| `snapshot-value-and-branching` | 已取快照不可变、同原态分支独立；首次内容位置含空填边界；SA3 S-4／S-7／S-16 |
| `nested-message-identity-boundary` | CB／SA 允许的派生块与外层重复 ID 在 Messages 中拒绝；Messages3 S-39、AR2 S-24 |
| `model-settlement-shapes` | complete／truncated 与真实模型消息、开始／结束／派发记录衔接；SA3 S-8、Messages3 S-10、MR3 S-13 |
| `lost-failure-delivered-and-in-band` | 丢失／中断／带内失败及 delivered 分开；MR3 S-27 的失败优先级、late 必须有所属引用；MR3 S-15／S-27 |

`tests/w6-stream-consumer.spec.ts` 要求正常13项全部通过。帧数负控只把上述手算9改成10，
要求恰 `w6.stream.tool-frame-replace-and-account` 以目标 AssertionError 失败、其余12项绿，
不能用任意非零退出代替。五 API 的闭合结果、快照只读与 complete／unparseable 类型由
`tests/w6-stream-types.spec-d.ts` 严格检查。输入时间、run／attempt／callId 及报账来路是显式前提，
这批 core 步骤不证明 transport、执行副作用、持久日志或引用真实存在。下表说明对应责任边界。

实际 Node 消费根与明确公开的运行时子路径。Schema 回归基准见
[packed-schema-identities.json](fixtures/packed-schema-identities.json)：30 份原始资源对应 29 个不同身份，
每份保留独立的 URI、摘要及公开入口期望。基准不从候选 tarball 重新生成，也不作为产品契约登记。
验证器从安装后的 tarball 读取资源，检查原始字节、URI 与引用闭包，并用实际 Ajv 2020-12 编译所有 `$defs`。
错期负控要求恰 `w6.schema.current-and-retained-coordinates` 报 AssertionError，其余五项通过。
内部 Connector Schema 仅是结构资源，不冒充实际 Connector bodyContract。
每包 private/src/dist、相邻路径和未公开版本必须分别产生 TS2307 与
`ERR_PACKAGE_PATH_NOT_EXPORTED`，任意编译错误／异常不能代替正确拒绝。
公开 `storage/conformance` 另在独立 Vitest 宿主检查可导入；真实 SQLite 与
C11／C12 效力由 W1 子进程场景检查，导入函数不能代替数据库验证。

### 组合范围与外部责任

| 实际检查的组合 | 夹具外仍由谁负责 |
|---|---|
| 实际 SQLite 提供者；关闭外键的目标断言负控 | storage-sql 拥有引擎／WAL 行为；不证明 PostgreSQL、掉电耐久性或行锁失效检测 |
| CB／AR／SA 原文、无损参数、封口及递归消息身份 | transport 拥有真实来源与迟到交付；Session Log 拥有跨消息唯一性和持久化 |
| CA／AR／SA 帧结算、未知费用及 MR／Messages 结果形状 | 模型／工具运行时拥有真实派发、迟到费用、引用存在和持久同提交 |
| AM／AE 五个实际正文端口、属性覆盖／锁定／权限投影 | Connector 第六端口不在此范围；输入拥有者负责 PRE-1～PRE-9、快照、工厂完整性及持有层唯一性 |
| 工作区清单、carrier、记录身份及 workspace-only Skill 读取 | 文件读取者负责真实文件系统快照、符号链接边界、目录身份及输入时刻 |
| TenantId 比较、author／owner／official 与跨租户持有拒绝 | 身份／Session／资产拥有者负责有效成员资格、唯一键及持久化 |
| MCP 动作命名、输入 Schema、非法参数及动作权限 | 注册与桥接拥有者负责真实抓取、固定快照、不可用动作、调用超时与费用来路 |
| TD 保留属性、原样字符串工具结果及 CB 可见性 | 工具运行时负责实际设置／权限效果、结果身份与卸载字节；上下文拥有者负责最终受众与投影 |
| Skill 正文、Slash 展开、声明值与权限 | 发布拥有者负责不可变包字节；运行时负责有效 usableBy、资源获取与设置消费 |
| SA 快照、分支、裁剪、替换帧及中断形状 | 运行时负责调用登记、不可解析内容不执行、真实取消、帧发出与交付 |
| CB／Messages 压缩投影及结果记录判断 | Session／上下文拥有者负责不可变日志、压缩记录与真实引用 |
| Slash 保留名、词法名与空声明规则 | 治理拥有者负责发布拒绝和用户呈现；运行时负责调用前权限 |

上述边界不能通过这套纯组合测试自行关闭。保留 Schema／正文资源仅在明确公开路径上消费，
不恢复旧中央登记、旧目录或版本冻结流程。

每次完整打包命令在 `tmp/w6-core-verification/packed-consumers/run-*` 保存 tarball、
消费者输入／源码、安装与编译原始输出、逐命令状态、声明库存、Schema／JS hash 和报告。
工具只拥有自己创建的目录，保留证据供 root 接收后统一退休；测试绿不等于自行接受。
