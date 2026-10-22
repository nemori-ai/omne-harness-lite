# 工具执行能力组

本组维护工具定义、执行、等待、结果及组合责任。公开契约已技术接受。支持范围分五档，见[支持范围](#支持范围)：公开类型已导出，纯契约函数与独立执行已实现，runtime 只实现了一部分路径，宿主与提供者大多尚未交付。

## 责任与范围

工程范围由[领域责任](../../docs/domains/tool-execution/README.md)与[产品正文](../../.meta_harness/design/product/tool-execution/design.md)约束。本组拥有包分解、公开依赖、组协作及组合验证导航。

## 包与依赖

本组按安装闭包分成四个包。依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。`tool` 与 `tool-cordis-contract` 互不依赖。各包的测试断言这一方向。

| 包 | 承担的行为 | 阅读入口 |
| --- | --- | --- |
| tool/tool-contract | 纯契约：公开类型、品牌身份解码、定义与状态判定、声明构造、确定性投影、默认参数 codec 与结果政策。不依赖 Cordis 与任何 Tool 实现 | [SPEC](tool-contract/SPEC.md)与[设计索引](tool-contract/docs/index.md) |
| tool/tool-cordis-contract | Tool 的 Cordis 服务定义、服务键、事件与实例目录。不含 Tool 实现 | [包入口](tool-cordis-contract/README_ZH.md)与 [Cordis 定义](tool-cordis-contract/docs/cordis.md) |
| tool/tool | 不含 Cordis 的领域实现：独立执行、runtime 工厂、受理决定器与记录仓端口。独立执行、Tools 结果取回适配器与 runtime 的部分路径已实现 | [包入口](tool/README_ZH.md)与[内部架构](tool/docs/architecture.md) |
| tool/tool-host-local | 单机宿主：宿主时钟、同机启动协调器、绑定登记表、换代协调者与 Cordis 插件。同机启动协调器已实现，其余尚未交付 | [包入口](tool-host-local/README_ZH.md)与 [Cordis 装配](tool-host-local/docs/cordis.md) |

| 消费方 | 生产依赖 | 测试依赖 |
| --- | --- | --- |
| 发起协调者、消费方、决策方、执行环境、程序执行方等其他领域 | `tool-contract`；编写 Cordis 插件时另加 `tool-cordis-contract` | `tool-contract`；需要真实 runtime 时可加 `@omne-harness/tool/testing` |
| 其他领域的工具作者 | 只有 `tool-contract` | 同上 |
| 独立程序（不依赖外部工作对象直接执行工具） | `tool-contract` 加 `tool` | 自选 |
| 应用装配 | `tool-host-local`，间接带入其余三包 | 自选 |

`tool-contract` 从零生产依赖的 `operation-result` 取得 `Outcome`。其生产安装闭包不含 Cordis，测试检查完整传递依赖。

产品的[旅程与能力](../../.meta_harness/design/product/tool-execution/design.md#关键用户旅程)、[关键协作流程](tool-contract/docs/flows.md#工具执行的关键协作流程)和[验证对照](tool-contract/SPEC.md#旅程能力与验证入口)用于定位组合义务，不是另一份业务规则源。

共同持有、设置和权限归 assets；发起与业务采用归实际协调者；环境归 execution；程序消费方的资源与动作桥接方的发现连接分别归其成员。Tool 通过公开能力完成包装动作，不接管被调用领域的业务状态。跨组提交和消息采用协议归真实协调者。

增加包须说明实际消费者、安装闭包差异、替换和验证收益。类型存在、目录变大和插件可能性不足以决定拆包。组不提供合并 SPEC，各包维护自己的行为，组维护导航和依赖边界。工程关系见[组设计](docs/architecture.md)。

## 支持范围

支持范围分五档。每档只写已核对的事实：测试核对了什么，没有核对什么。检出范围是包含本文件的检出。本表与同一检出中各包的源码和测试一起维护，不一致即缺陷。某个包的目录不在当前检出里时，提到它的地方按[未交付标注](#未交付标注)的规则标注。改变支持范围的提交同步本表与各包的支持范围一节。验证入口见各包的验证节。已有的证据都来自单个进程、非耐久记录仓和替身。没有耐久存储、跨进程或真实执行环境的证据，也没有组外消费者的验证。各包的 README 按同样五档写出自己的部分。

<a id="未交付标注"></a>

当前检出包含四个成员：`tool-contract`、`tool-cordis-contract`、`tool` 与 `tool-host-local`，无需缺席标注。某个成员目录不在检出里时，组页与两个契约包提到它的分句或单元格都注明该成员未在检出中，包括表格、正文与链接文字。标注加在提到该包的分句或单元格处，不影响同一行的其他包。同一单元格或同一句里多次提到同一缺席包时，只标第一处。每处标注链接到本节；代码块使用纯文字说明。泛称「实现包」而实际指缺席成员时也应注明。成员进入同一检出后删除相应标注。缺席标注只说明检出范围，不说明能力是否实现；能力状态仍按五档表维护。[包与依赖](#包与依赖)的消费表与 tool-contract 的[消费入口](tool-contract/docs/context.md#消费入口与契约变更协议)遵守同一规则。

| 档 | 已交付的内容 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | `tool-contract`：全部公开契约类型、品牌身份解码函数、默认结果政策与资产正文端口 `toolBodyContract`。`tool-cordis-contract`：17 个抽象 Service 类与 1 个具体类 `ToolInstancesService`，共 18 个，加服务键、`Context` 增补与 `tool-cordis-contract/call-changed` 事件增补。`tool`：构造形状、记录仓与内容 reader 端口，以及 Tools 工厂和消费适配类型。`tool-host-local`：本地启动协调器的输入类型 | `tool-contract` 与 `tool` 的根入口，`tool-cordis-contract/cordis`，`tool-host-local` 的根入口 | 各包的 `tests/public-entry.spec.ts` 核对导出名与导入方向。`*.spec-d.ts` 以正负编译用例核对类型。`tool-cordis-contract` 另在真实 Cordis 4.0.4 下核对定义 |
| 纯契约函数已实现 | `tool-contract`：定义、请求、交付解除与状态的判定函数，可用性判定与呈现，作者注册，等待契约，默认参数 codec，结果渲染与投影。函数不做 I/O，不读时钟，不持有状态 | `tool-contract` 的根入口。`./binding` 只给受信的执行绑定提供者 | `tool-contract` 的单元测试与类型测试。没有包外消费者验证 |
| 独立执行已实现 | `tool`：`createIndependentToolScope` 与 `executeTool`。作用域用本地接收者、显式上限和内存等待历史，回执只有 `local` | `tool` 的根入口 | 作用域与包装器的 [P11](tool-contract/SPEC.md#p11-作者输出与等待原语) 规则，用可控的接收者与提供者替身核对。没有真实执行环境，不含 Cordis |
| runtime 已实现的路径 | `tool`：`createToolRuntime` 与 `createToolLedger`。已知不可用或参数非法的调用，经 admit、lookup、queryOperation、readResult、releaseDelivery 与 account 完成逻辑终局。真实工具的调用，经受理、环境准备、FIFO 排队、启动守卫与启动围栏到达 start，并记录启动。driver 自动保管原 process/final 及来源 ACK，再从原 final 确认独立结果保管、原子收场并跨域修复 slot 释放。结果读取保持固定版本、完整块分页和当前资格；显式字节 provider 支持附件字节分页，raw 元数据及原件字节使用独立资格。`createTools` 提供真实 help/read_result、首次结果呈现和消费侧有界 readReply，模型沿可见提示发起新的取回调用。环境清理支持 canonical planRelease 及经原环境 inspectRelease 核验的 recordRelease，未自动调用环境 release。前台启动经 `ToolClock.begin` 开启计时段（[P07](tool-contract/SPEC.md#p07-计时控制与检查点)），可由装配方提供时钟，测试也可使用下述工厂的手动时钟。启动前被拒绝的调用以 `unavailable` 收场，`effect` 为 `not-started`。`tool-host-local`：本地启动协调器，实现 `ToolStartAuthority`，只为单机宿主服务。其余 runtime 门面与 provider 的操作回复具名 `unsupported`，`reason` 写明操作名和计划实现该操作的批次名。批次名与操作的对应见 [tool 的支持范围](tool/README_ZH.md#支持范围)的表（「增量名」一列） | `tool` 与 `tool-host-local` 的根入口 | `tool` 的托管路径测试用非耐久记录仓，加环境、执行绑定、启动授权与时钟替身。`tool-host-local` 的组合测试在非耐久记录仓上使用真实的 runtime、账本、推进协程与本地启动协调器；执行绑定、环境与时钟等其余端口按测试夹具提供。耐久性、进程崩溃与第二个进程都没有覆盖 |
| 尚未交付的宿主与提供者 | 真实环境 release 自动驱动、完整异常源恢复。控制、暂停与接续、程序调度。计时段开启之后的计时（经过时间、期限、暂停）。等待、过程观察、恢复、排空与交接。真实字节存储、结果卸载策略、Tools.search/inspect/execute 与生产 Agent 消费集成。跨进程的启动排序域（不受支持）。宿主时钟、绑定登记表与换代协调者（[G7](tool-contract/SPEC.md#342-契约缺口决定)）、Catalog。[RFC-0012](../../docs/rfcs/RFC-0012-tool-dynamics.md) 的类型迁移、两个新服务键、事件 `binding-changed`、G7 套件与动态性套件。Tool 自有的提供者插件在 `tool-host-local` 的 `./cordis`，跨领域提供者由其拥有者交付。其余端口提供者见各包。实例目录 `ToolInstancesService`：`register` 回复 `unavailable`，`connect` 回复 `unsupported`。耐久记录仓（[#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)）与真实执行环境（[#278](https://github.com/nemori-ai/omne-harness-lite/issues/278)） | 无 | 这些未交付路径没有证据。已保存原 final 的收场与 slot 释放在单进程非耐久组合中验证；slot 释放不证明环境资源已释放 |

### 模型按需取回结果

应用装配从 `@omne-harness/tool` 根入口创建 `createTools`，登记其作者，并向模型提供 `present` 的 P14 投影。模型只使用真实帮助和回应中的引用发起新的 `Tools.read_result` 调用。宿主使用 `readReply` 收齐元调用回应后再投影给模型。当前只有 `help` 和 `read_result`，不开放程序调用，不转发源程序 data。

结果内容结束、附件字节结束、原文卸载状态和原工具终态分别呈现。引用不授予权限；每次读取仍由真实 runtime 检查当前资格。接口、参数、预算及错误含义归 [Tool 公开接口](tool/docs/public-api.md)与 [Tools 行为规格](tool/SPEC.md#28-tools-固定结果适配器)。现有验证使用单进程非耐久内存组合，未验证真实模型或生产存储。

### `./testing` 入口

三个包有 `./testing` 入口。其中两个交付一致性套件，外部提供者用它们核对自己的端口实现。

- `tool-contract/testing`：环境、启动围栏、执行者绑定、输出保管、时钟、决策桥与资源应答七个端口的套件，和各自守约的非耐久替身。
- `tool-cordis-contract/testing`：`ToolInstancesService.register` 的登记语义套件，和守约的非耐久登记服务。
- `tool/testing`：非耐久记录仓 `createMemoryToolLedgerStore`、内存字节与保管组合 `createMemoryToolContent` 及 `createTestToolDependencies<P>`。工厂新建七个契约替身、记录仓和账本，返回完整依赖与原控制手柄。调用方显式提供身份、守卫、配置、宿主、Catalog、子调用端口及绑定解析接线。块固定为 `ContentBlock`，环境固定为 `MemoryEnvironment`。只供测试，使用方式见 [tool](tool/README_ZH.md#testing-入口)。

各套件使用非耐久替身、合法生成提供者和违约变体验证。启动围栏套件另在单进程内对真实本地启动协调器运行；该对照使用非耐久记录仓，不覆盖耐久性、进程崩溃或跨进程装配。承载独立规则的断言都有违约变体，类型收窄的断言由编译器守护。逐断言的对应表见 [tool-contract](tool-contract/tests/README.md#断言与违约变体的对应)与 [tool-cordis-contract](tool-cordis-contract/tests/README.md#断言与违约变体的对应)的 tests/README。真实实现的对照、对照结果与未对照的端口，见 [tool-contract 的 public-api](tool-contract/docs/public-api.md#端口一致性套件testing)。替身声明 `durability: 'none'`，不能装配进生产，也不证明耐久提供者符合契约。

## 关键协作

`tool-contract` 定义逻辑调用、真实执行、内部等待、控制、结果及执行账的契约。`tool` 已实现独立执行与 runtime 的部分路径，`tool-host-local` 已实现本地启动协调器，其余尚未交付，范围见[支持范围](#支持范围)。发起协调者与身份治理、环境、决策方和原消费方分别承担资格、资源及业务采用；程序消费方和动作桥接方通过公开行为组合，不以方法读取或连接成功代替动作准入。

流程从[组协作入口](docs/key-flows.md)导航到契约包的流程。

## 组合验证

社区使用者从 [Tool 教学](tool/examples/README.md)运行公开 dist，观察真实作者、runtime、driver、模型可见分页与交付解除。该教程以公开非耐久 testing 提供者装配，使用内存 authority。本地协调器的真实组合仍由 tool-host-local 自身测试承担。正式三条场景另由 tool 的 [acceptance](tool/acceptance/README.md)独立维护，教程不替代验收。

Tool 验证原调用、dummy、等待、控制、收场与效果；发起和消费协调者共同验证当前资格、排队撤权、可靠承接、撤回后迟到和提交未知。提供者验证真实环境、传输、隔离及外部效果，缺环境保留无法验证。范围见[持续验证义务](tool-contract/SPEC.md#持续验证义务)。尚无真实存储、故障、断电或性能执行证据。

## 维护

修改行为同步契约 SPEC、原具名专题、实际消费者及相称验证；修改包分解同步组导航、登记与依赖方向测试；改变支持范围的提交同步本组支持范围表与各包的支持范围一节。具名维护人尚缺，由项目负责人指定；职责拥有者不等于已派发个人。产品、组工程和包机制分别维护唯一正文。
