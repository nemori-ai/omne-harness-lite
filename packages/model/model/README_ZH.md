# @omne-harness/model

[English](README.md)

## 职责与状态

本成员已有独立执行、凭据判定、受理、流保存、实例观察与已确认调用收场、结果读取及 processed ACK 实现和独立内存测试入口。本地凭据保管归 [model-host-local](../model-host-local/README_ZH.md)，领域协议归 [model-contract](../model-contract/README_ZH.md)。

| 能力或入口 | 当前支持 |
| --- | --- |
| `executeModel` | 经显式传输执行一次，覆盖取消及资源关闭 |
| 凭据判定及 `deliver` | 凭据判定为纯函数，`deliver` 委托传入的 resolver |
| `createModelRuntime` | 受理、查询、取消意图、原流保存、实例观察与下述支持范围内的调用收场；结果读取与 processed ACK 已实现，retained ACK 仍 unavailable |
| `createModelSendBoundary` | 显式依赖下提交回执与窗口、同步凭据围栏、一次 start 和唯一事实消费 |
| `createModelPreparationResources` | 生产准备租约：每个档案供应商一个家族绑定，按调用方访问依据读一次 lineage 引用的调用事实，判决锚点与来源，并在每份预算报告校准判决；没有 lineage 时交出家族计量器本身 |
| `@omne-harness/model/testing` | 内存 Commands 与五个可控依赖端口；发出记录在清理后保留固定请求的消息身份序列 |
| 耐久 Commands 及生产托管执行 | 未实现 |
| Cordis 运行宿主及厂商执行 | 本成员未实现 |

## 使用

受理在排队前同步复用 judgeAdmit，畸形输入不会建立调用或预留容量。[输入契约](../model-contract/SPEC.md#封闭输入判断)规定冻结副本、资格对象同一性和解析限制。第一课教受理判断；第四课先通过纯请求判断，再真实驱动供应商 input-over-limit。

选择本实现的独立程序与宿主从[消费与构造](docs/context.md)进入。executeModel、createModelRuntime 及构造参数的设计已接受，精确形状见[公开接口设计](docs/public-api.md)，executeModel、createModelRuntime 与 createModelSendBoundary 已从根入口导出；独立能力工厂仍未实现。

内存测试从 `@omne-harness/model/testing` 导入 createTestModelDependencies。显式配置、authority、evidence 和 owner 的用法见[测试入口](docs/public-api.md#内存测试入口)。返回的五依赖可构造真实 runtime 壳。

内存测试提供者交付 sealed/partial 及真实 trims。显式项数与字节目标按完整项组页，超目标大项独页，整个页受原受理容量约束。消费者须处理未封值与提醒。具体配置及局部上限见[测试入口](docs/public-api.md#内存测试入口)。

调用方在受理前编码并保存调用引用。inspect、connect 和 beginRead 接收该引用与当前 Access。第五课保存操作引用及原 ACK result/evidence，恢复后重入原操作。见[共同引用契约](../model-contract/SPEC.md#可保存调用引用)。

请求组装方经准备租约计量。它用 Commands、家族绑定来源、供应商端口与 `maxCitedCalls` 构造 `createModelPreparationResources`，再以自己的访问依据、档案和可选的 `lineage` 取得租约。租约以该访问依据读一次 lineage 引用的调用的发出记录，在每次家族计量前判决锚点与来源，预算在 `calibration` 报告判决。规则见 [SPEC“准备资源与校准租约”](SPEC.md#准备资源与校准租约)。

## 运行教学示例

在仓库检出中使用 Node.js 24 或更高版本和 pnpm 10.28.1。这些 workspace 包尚未公开发布。示例不需要厂商账户、网络或真实凭据。

在仓库根为新检出准备依赖并运行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness/model... -r run build
pnpm --filter @omne-harness/model examples
```

依赖已备好且锁文件未变时直接复用。修改源码后重新构建。示例从公开包入口加载实际构建产物。

按以下顺序阅读和运行。每个脚本也可独立执行：

| 脚本 | 操作和可观察结果 |
| --- | --- |
| [01-submit-and-query.ts](examples/01-submit-and-query.ts) | 调用 admit、inspect，处理 Reply、Admission、Lookup 和 accepted CallState。实际发送次数为零。 |
| [02-observe-and-settle.ts](examples/02-observe-and-settle.ts) | 构造 runtime、启动受信 driver、连接 live handle，取得 snapshot 和 changed。查询 Settlement 的原 termination、version 与 source。 |
| [03-output-limit.ts](examples/03-output-limit.ts) | 提供真实的脚本 trim 事实，区分 completed/limit 和调用失败。 |
| [04-input-over-limit.ts](examples/04-input-over-limit.ts) | 检查 failed/input-over-limit 和上游 reported 字段，未知值保持 null。 |
| [05-read-and-acknowledge.ts](examples/05-read-and-acknowledge.ts) | 分页处理 sealed 与 partial，关闭读取，提交消费者完成证据并认回原 ACK。 |

单独运行第二课可用 `pnpm --filter @omne-harness/model exec node --experimental-strip-types examples/02-observe-and-settle.ts`。预期输出和装配边界见[示例指南](examples/README.md)。关键入参及返回判别保留在脚本里；[example-support.ts](tests/example-support.ts)解释重复装配的各端口职责。

受理记录责任，不证明已发送。drive 返回本地推进和资源释放结果，inspect 返回权威业务状态。drive 成功仍可能得到失败终局；资源释放失败也可以与已确认的 Settlement 同时成立。观察器关闭与宿主 publication 撤除分别处理，两者都不等于取消或 ACK。

## 收场支持边界

driver 对原始、已确认的 completed、completed/limit、input-over-limit 和无需新重试决定的 failed 终局收场。真实上游 interrupted 须关联同次 preserve 回执的原控制。没有 dispatch 时，已保存控制也可以不发送而收场。完整支持范围见[实现规格](SPEC.md#已实现的调用收场)。

待定 operation 和完整输入由当前进程保留。driver 不从可变 dispatch 历史猜原终局。无控制中断、sender.not-started、待重试策略决定及缺少原终止证据的恢复仍未支持，不提供默认 stop。第五课运行公开读取和 processed ACK。retained ACK、耐久存储、生产宿主及真实厂商仍未实现。

## 契约

[实现规格](SPEC.md)拥有单次独立执行与构造配置行为。实现须满足[共同规格](../model-contract/SPEC.md)，不能降低其身份、发送、保管和恢复保证。

## 设计

[设计索引](docs/index.md)按架构、流程、内部对象、公开入口、消费和 Cordis 装配展开。宿主装配设计暂存于 [docs/cordis.md](docs/cordis.md)，它不对应本成员的任何导出；model-host-local 目前只承载本地凭据保管。

## 配置与运行

构造器显式接收 Commands、发送围栏、重试策略、实例宿主与时钟。应用选择并拥有所需 adapter，不从全局 Context 取得业务参数。目标运行实现不依赖 Cordis。包清单不声明 Cordis、proper-lockfile 与 model-cordis-contract，包导出根入口和独立 `./testing`，没有 `./cordis` 与 `./execute`。`pnpm --filter @omne-harness/model run install-closure` 对本成员做打包、隔离安装、入口解析与场景运行，并以 `--out` 写出报告；运行方式与验证范围见[测试说明](tests/README.md#安装闭包)，运行结果不在本页记录。包不自动安装所有厂商或词表。

受控宿主以稳定 claim 与可信 continuity 调用 `provider.driver.drive`。driver 先发布初始实例，再接原 sender 的 window/facts，唯一消费并按批保存。Commands 确认后才发布完整快照。明确发送失败仍沿 drive 返回，未知写保留原输入。调用方经 connect/observe 观察，关闭观察不取消调用。没有恢复快照的后继实例明确 ended/unavailable。

必填正安全整数 observerCheckIntervalMs 控制等待观察者的资格及实例复查。outputBatchDelayMs=0 时逐事实先保存再读取；正数延迟允许聚合。计时触发保存时，已挂起的 next 仍属原窗口，完成后才保存整批。沉默读取可无限推迟已有前缀展示，因此批延迟不承诺最大可见延迟。

observerBufferBytes 约束逻辑登记与未读通知。每登记64字节，每未读版本32字节。登记额度不足或观察者落后超额时，结束该观察为 unavailable。初始共享快照正文不重复计入观察额度。每观察者只允许一个在途 next，并发 next 结束该观察，不形成无界队列。生产调度、retained ACK 与跨进程恢复尚未实现。

## 产品发送边界

根入口 `createModelSendBoundary` 接收 Commands、同步 `SendCoordinator`、`CredentialPort`、`SendResources` 和正的 `maxRetainedAttempts`。构造形状以 [types.ts](src/send/types.ts) 为准，行为归 [SPEC](SPEC.md#产品发送边界)。sender 先提交物化回执与接收窗口，再在共享同步围栏内核当前资格、认领 dispatch、解析凭据并立即 start。所有 sender、当前资格更新、取消及代次变化必须由同一状态拥有者协调。

factory 路径需要受信装配明确登记精确档案与供应商采用、接收方、model、官方身份、当前无租户绑定和人命名查询 ID。请求中的 factory 标签不授予官方身份。tenant 凭据失败不回退 factory。秘密只进入本次资源的同步 start 槽，不进入尝试、写入或诊断。

未知写保存原 operation、expected、输入和资源，重入先核实原操作。start 已返回而记录未确认时不迭代、不关闭原流；认回后唯一交出。signal 交给原传输；事实耗尽或消费者归还时，按 materialized、prepared、resource 逆序幂等释放。释放失败以安全异常可见，未知责任与失败释放继续占容量，没有 TTL 遗忘。

测试装配显式提供 sending 配置并消费同一产品 sender；缺配置明确不可用。driver 已集成原唯一 facts 消费者及最小实例观察。started 结果同时交出已确认的原 window 和唯一 facts 流。消费者将 result.window 连同原执行与分派交给 Commands.preserve；窗口标识不授予访问权。本地脚本不证明真实厂商、耐久存储、生产宿主或跨进程恢复。

## 验证

在仓库根运行以下命令。包的 engines 要求 Node.js >=24，pnpm 版本为 10.28.1。实际验证过的 Node.js 版本以各次运行报告为准。

```sh
pnpm turbo run typecheck --filter=@omne-harness/model
pnpm turbo run test --filter=@omne-harness/model
pnpm turbo run test:fast --filter=@omne-harness/model
pnpm turbo run test:slow --filter=@omne-harness/model
pnpm run check:docs
```

Turbo 的 `test`、`test:fast` 与 `test:slow` 先构建本包及其依赖，再执行所选测试。`typecheck` 不先构建。直接运行 `pnpm --filter @omne-harness/model test` 不自动构建，所需构建产物须已就绪。`test:fast` 与 `test:slow` 分别选择快层与慢层。

完整 `test` 先运行 Vitest，成功后执行五个教学脚本。快慢层都不自动执行 examples。已构建时可单独运行 `pnpm --filter @omne-harness/model examples`。acceptance 保持独立，由[测试运行器](../../../tools/test-runner/README_ZH.md#测试运行)调度，仓库根入口是 `pnpm run acceptance`。

独立执行测试经公开入口连接脚本传输及受控故障提供者，覆盖一次发送、回执匹配、取消、失联与关闭。六项 transport 符合性直接检查提供者。准备资源测试驱动真实内存 Commands 与记录所收校准值的家族计量器替身，覆盖锚点命中、请求材料释放后仍命中、另一租户与不存在同结果、每种不命中与扣留原因、按调用方访问依据读取、全有全无取得与幂等释放。其他测试覆盖凭据判定（含未经铸造的租户一律拒绝）、根入口导出集合、旧子路径不可解析与清单不含 Cordis 类依赖；保管、持久化与 Cordis 插件的测试在 model-host-local，内存测试覆盖本地 Commands、未知注入、结果读取及释放，不证明真实耐久、厂商发送或生产托管执行。共同协议及类型消费义务见[契约验证](../model-contract/verification/index.md)。

## 维护

修改构造或算法时同步[文档登记](documentation.json)、真实消费者及验证。资源导航见[包索引](index.md)，未实现资源保持实际状态。

## 与 model-contract 的边界

领域契约归[契约入口](../model-contract/docs/public-api.md)，本成员只维护实现函数和构造形状。共同业务行为由[共同 SPEC](../model-contract/SPEC.md)记录。本成员不改变其范围，也不降低其保证。

## 目录结构与文档职责

目录骨架依据 [RFC-0007](../../../docs/rfcs/RFC-0007-source-packages-and-templates.md) 与模板 `typescript-package@3.0.0`（见[完整生成树](../../../docs/package-organization.md#完整生成树)）。对本包不适用的目录，其 README 写明不适用及原因。目录存在不代表功能已实现。

```text
包根：README.md、README_ZH.md、index.md、SPEC.md、documentation.json、package.json
├── docs/：architecture、flows、object-model、public-api、context、cordis 六主题
├── src/
├── tests/fixtures/
├── schema/
├── verification/models/、verification/proofs/
├── adr/
├── examples/
├── resources/
└── acceptance/
```

每个固定目录都有 README 和 index。源码、构建与测试配置沿实际文件；构建产物和依赖目录不属于正文骨架。

| 入口 | 文档职责 |
| --- | --- |
| [设计](docs/index.md) | 架构、流程、对象、接口、消费与装配 |
| [源码](src/index.md) | 实际公开导出和内部代码 |
| [测试](tests/index.md)、[夹具](tests/fixtures/index.md) | 可执行断言与固定输入 |
| [Schema](schema/index.md) | 外部数据格式及发布身份 |
| [持续验证](verification/index.md)、[模型](verification/models/index.md)、[证明](verification/proofs/index.md) | 性质、前提、符合性和验证资源 |
| [设计决策](adr/index.md) | 持续采用的实现取舍 |
| [示例](examples/index.md) | 可运行消费方式 |
| [运行资源](resources/index.md) | 资产、来源和装载责任 |
| [独立验收](acceptance/index.md) | 独立场景、环境与判据 |

## 独立消费入口

凭据判定的已实现导出见[公开入口](docs/public-api.md#已实现的凭据入口)，调用方式见[消费指南](docs/context.md#独立消费入口)；本地保管库与插件的用法见 [model-host-local](../model-host-local/docs/context.md)。凭据判定已有行为测试；其他运行设计的接受不表示已经实现。
