# Core 开发验证

本开发成员承接核心包的真实组合验证，产品包通过公开构建入口消费。依赖全部是开发依赖，
不会令 core 产品包反向依赖 infra。

当前交付包含存储一致性套件有效性自测与 W1 五包的独立公开消费者。存储部分依据
[storage 实现设计 P-10／C-11／C-12](../../.meta_harness/design/realization/packages/core/storage/design.md#要求到协议再到会红的测试)
与 [验证义务及覆盖缺口](../../.meta_harness/design/realization/packages/core/storage/verification.md#覆盖缺口)。
P／C 编号是该节点的协议与用例编号，没有独立契约坐标。

公开消费者的采用依据是
[kernel-basis](../../.meta_harness/design/realization/packages/core/kernel-basis/design.md)、
[identity-values](../../.meta_harness/design/realization/packages/core/identity-values/design.md)、
[offer-expiry](../../.meta_harness/design/realization/packages/core/offer-expiry/design.md)、
[storage](../../.meta_harness/design/realization/packages/core/storage/design.md) 与
[content-blocks](../../.meta_harness/design/realization/packages/core/content-blocks/design.md)
的实际公开面；数据契约精确采用 `data.identity-values`、`data.offer-expiry`、`data.content-blocks` v1，
接受与冻结从 [registry](../../.meta_harness/design/registry/README.md) 核对。
kernel／storage 采用 D-025／D-026 与上述技术设计，没有独立数据契约坐标。

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
所有可能错误。后续两条 core 组合线在实际公开接口可用后接入，不预先以 fixture 补造行为。

## W1 独立公开消费者

`src/w1-public-consumer.ts` 构建为 `dist/w1-public-consumer.js`，由真实 Node 子进程运行。
它只通过五包根 `exports` 与批准的 `./testing`／`./schema` 子入口加载构建产物，
检查根入口确实解析到各包 `dist/index.js`；Node 应拒绝未公开的 `src/index.ts` 子路径。
三个 Schema 的实际公开字节与冻结 v1 逐 hash 核对。消费时没有产品源码别名或 Vitest 转换器。
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
