# Model 宿主装配设计

本成员没有 `./cordis` 入口，包导出根与独立 testing 入口，本页描述生产宿主设计。model 根入口已实现受理、原流保存、最小实例观察、有限的原终局收场和可独立调用的产品 sender。独立 testing 入口以同一 sender 配合内存后端和脚本传输，均不表示这些生产宿主插件已实现。本页暂存 model-host-local 的具体装配设计，该宿主目前只实现本地凭据保管，凭据插件的行为见其[Cordis 集成](../../model-host-local/docs/cordis.md)。领域执行工厂归本成员，托管运行的 Service、键、事件及登记表由[model-cordis-contract](../../model-cordis-contract/docs/cordis.md)唯一拥有；共同登记协议归[其 SPEC](../../model-cordis-contract/SPEC.md)。本页不重复服务类或登记算法。

## 纯实现与 Cordis 装配的分工

model 的工厂接收普通契约对象，不接收 Context、Service 或 Fiber。model-host-local 的插件通过静态 inject 取得所需能力，构造阶段适配器和纯实现，再按 model-cordis-contract 的唯一定义发布服务。普通消费者只依赖操作契约；框架消费者依赖服务定义，不依赖具体宿主。凭据引用与解析采用同样分工，归属见[组架构](../../docs/architecture.md#凭据的现有装配边界)。

依赖注入和动态插拔在宿主层完成，不要求业务实现导入 Cordis。整个能力必需的依赖按 IC-8 声明；仅发送或重试阶段必需的依赖由局部阶段适配器取得。适配器把缺席和换代交回领域协议，不把 Context 泄漏到工厂，也不每次从全局容器取得同名最新对象替换在途采用。

计划替换先停止新取得，旧调用按固定采用排空或明确交接，随后撤除登记并释放已无使用者的资源。突发依赖丢失时按对应契约返回不可用或未知，恢复先核对原操作。目录撤除只影响取得路径，持久查询、取消、结果保管和费用责任由稳定能力继续承担。模型自主执行使用模型宿主的生命周期，不继承调用方 fiber 的寿命。

有序收尾由本页的关闭协调兑现。disposer 不撤回已发送的模型请求，也不等于业务取消、ACK 或费用结清。宿主自身故障仍须走执行连续性和恢复协议，分包不产生跨故障无损保证。需验证正常装卸、依赖缺席及恢复、提供者换代、在途采用不变、迟到结果和释放失败。

## 依赖与阶段装配

Model 门面以 commands 和稳定目录适配器维持受理/查询/控制/ACK。目录实际缺席只影响 connect，不卸载 calls 和 consumption。执行段在本域宿主取得 send、clock 及恢复能力；重试阶段另取当前策略。纯根工厂的必需 retry 参数由具名局部阶段适配器兑现，不能传 undefined。适配器在阶段依赖缺席时返回根协议的明确不可用，已有调用仍可查询、取消和保管。策略退出不能删除已持久决定或重新花费内部调用。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

## 配置与凭据

实现配置的边界归[本包 SPEC](../SPEC.md#工厂与配置)。

凭据接缝沿 [#279](https://github.com/nemori-ai/omne-harness-lite/issues/279) 的独立采用及其服务定义，CredentialPort 及 modelCredential 服务的实际入口见[凭据服务](#凭据服务)。发送围栏在可信内部按当前资格调用凭据解析，factory/tenant选择不由ctx推断。

## 档案、准备和转换的装配

ModelProfiles、ModelProfileMaintenance 与 ModelMessageConversion 可以独立装配。请求准备失败不影响已受理调用的查询、保管、ACK 或迟到账目。runtime 门面依赖稳定 Commands 和目录适配器；目录实际服务失去时 connect 返回 unavailable，不能伪报 no-live-route。其余 calls/consumption 不因此卸载。ModelInstanceHost 的自主调度由模型提供者 Context 拥有，不能继承调用方 caller fiber 的物理寿命。

## 接入检查

定义入口只引用 Cordis 与根契约，不引具体存储、供应商或 Tool。提供者的静态 inject 逐项标明整服务必需与局部阶段依赖，不能通过 ctx.get 或临时字符串隐藏依赖。档案维护权限变更仍按条件提交协议处理，disposer 只撤装配贡献。

装配验收须验证列表在传输缺席时仍可用，转换器缺席与命中不可用分别返回，准备器退出不删除原调用，目录退出不抹除调用事实，以及旧贡献释放不影响新贡献。真实业务停止、数据保管、ACK 和费用均用领域操作完成，不由 unload 推断。

发送提供者取得 ModelCommands 的物化提交能力。materialize 交出回执后，recordMaterialization 须先形成可恢复事实，再进入同步最终发送围栏；提交未知时不发送。Cordis 依赖恢复不跳过原 operation 核实，具体顺序见[物化提交协议](../../model-contract/SPEC.md#物化回执的提交与发送)。

## 计量与传输资源的装配

计量提供者构造时接收固定 ModelCountingBasis 和所需的 ModelTextTokenizer；后者先完成词表、配置及执行资源的初始化和完整性检查。普通请求不传分词库对象或本地路径，count 不动态下载资源。无需本地分词的提供者不注入 tokenizer。这里不新增 ModelTextTokenizerService、全局词表目录或 Runtime 必需依赖。

一次准备取得的适配组合覆盖请求编码、物化、start 和响应读取。计量由请求组装方在请求前取得的 meter 完成，不在发送路径上。计划撤除先停止新取得，在途工作沿原采用完成或明确结束，再关闭共享 tokenizer/codec。单请求 close 仅释放本次取得；不能关闭仍被其他请求使用的共享资源。突发依赖失去按具体能力返回不可用或未知，不能改用同名后继解释原请求。

资源拥有者须可跟踪未结束 reader、幂等 close 和释放失败。取消意图不证明物理读取已经结束，Cordis disposer 不证明外部请求撤回。验收须覆盖旧贡献释放不删新贡献、版本替换不改变在途编码、共享使用者未结束时不提前销毁资源。领域事实查询、保管和迟到账目仍由原稳定入口负责。

## pi 提供者装配

本节是 pi-ai 相关实现细化，保持候选。所引用的通用 Model 契约按其已接受范围执行。

发行装配显式选择厂商家族贡献，初始化其所需的 tokenizer 引擎和固定资源，再交共享 pi 传输 factory 构成 ModelTransport 与相容计量来源。家族包不直接注册新的 ModelRuntime 或取得调用权威；Model 提供者沿当前发送接缝消费组合结果。

读取官方定义清单不创建编码器或连接池。只读档案能力仍可独立装配，单家族消费者不被迫取得其他家族资源。共享传输不反向 import 全家族，家族贡献不通过全局 Context 查找依赖。计量与传输的固定采用及退役保活沿本页原规则，目标包划分见[组架构](../../docs/architecture.md#包依赖与装配)。

## 单机提供者的插件划分

以下是 model-host-local 的已接受导出设计与装配设计。该成员已有，目前只实现本地凭据保管及其 `LocalCredentialPlugin`；表中其余插件尚未实现。插件仅承担表中责任，不按内部纯函数增设 Service。键常量的唯一声明归 model-cordis-contract；框架入口引用它们，不能再写相同键的字符串。

| 插件 | 静态 inject 的键常量 | 提供与寿命 |
| --- | --- | --- |
| ModelInstancesLocalPlugin | `[modelPublicationAuthorityKey]` | 构造唯一 ModelInstancesService；失去目录只影响路由取得 |
| ModelConvertersLocalPlugin | `[modelConverterAuthorityKey]` | 构造唯一 ModelConvertersService；独立于运行时/结果查询 |
| ModelRuntimeLocalPlugin | `[modelCommandsKey, modelClockKey, modelHostAuthorityKey]` | 构造本地host、runtime、显式bind；提供ModelInstanceHostService和ModelRuntimeService的子类 |
| ModelSendStagePlugin | `[modelSendBoundaryKey]` | 单个发送阶段取得能力；退出后旧dispatch按原协议处理 |
| ModelRetryStagePlugin | `[modelRetryPolicyKey]` | 单个重试位置取得策略；失去时按policy-unavailable收场，不卸载普通查询 |
| ModelDirectoryStagePlugin | `[modelInstancesKey]` | connect与受信发布阶段取得原目录；其缺席不抹除持久调用 |

档案权威、档案读取、准备、转换和诊断提供者各继承其唯一 Service 类。底层运行对象由装配入口按拥有者定义 provide，插件静态 inject。表中尚未采用的跨域键不以临时字符串或 ctx.get 代替；实际adapter加入装配时必须沿其真实定义登记。配置只含可序列化值，算法对象、driver和信号不得写入插件树。

runtime 工厂的 send/retry/instances 参数始终是完整对象。局部阶段适配器由 ModelRuntimeLocalPlugin 在构造时创建，捕获提供者的 Context，并在阶段子 fiber 内按上述静态依赖取得能力。普通方法执行时不借调用方 this.ctx 启动自主任务。阶段依赖不可用返回对应领域失败，不把 undefined 填入工厂。消费者Context只用于调用方贡献，不成为模型协程的寿命父对象。

## 启动与关闭协调

启动按以下次序执行。配置先经 Standard Schema 校验；全部数值有界且满足所属工厂要求。装配者构造受信身份适配器、本地时钟和存储能力，再构造未绑定宿主及runtime。await bind成功后才发布运行Service，最后以当前宿主资格recover。恢复扫描可以渐进运行，但未完成旧执行排除的调用不可发出。构造期间任何失败依逆取得顺序释放尚未公开的资源。

计划关闭由单一 ShutdownCoordinator 控制。先 quiesce 停止新业务受理，选择排空时保持已受理工作的调度与所需算法取得。随后 close 停新派发，等待原 driver 交还，最后撤贡献并关闭共享资源；未派发的耐久待办明确交给后继，不能算作已完成。Commands、实际发送能力和必要reader在收尾期间保持可用。若无法排空，报告真实未决责任；运维采用强制进程终止时转入故障恢复协议，不能继续报告平滑交接成功。

关闭协调放在一个有序收尾流程中，不能把先后依赖分别登记为多个 effect 后假定按注册顺序完成。Cordis 各 effect 可能并发释放，且卸载异常不会自动成为业务失败回执。协调者通过领域状态记录 pending/blocked 以及资源释放诊断；不在已进入 UNLOADING 的fiber中创建新effect。登记自身的幂等撤除仍由原caller-fiber负责。

## 本地调度与执行者排除

本地host维护 binding状态、按tenant/call的唤醒集合、运行集合及待重扫游标。队列有界，超限不创建无界Promise；重复唤醒只置位。工作身份由ModelHostAuthority取得，drive输入不从租户Context推断。配置包括并发上限、唤醒容量、扫描批次和扫描间隔，均显式提供且经正整数/非负时间校验；不把未测量的生产数值写成默认保证。

同进程计划换代须等待旧binding的drive退出。进程重启由宿主取得旧进程已终止或其所有真实发送入口已被撤销的证据，随后核旧存储连接和未知写。单机独占启动条件阻止两个协调进程同时持有发送权；PID复用、心跳缺失、时间租约及数据库generation各自都不足以证明排除。无法取得证据时保留查询和保管路径，拒绝接管发送。

若未来提供者跨进程，身份请求通过相应协议运输，driver、Service、Context及闭包不跨边界。当前进程内绑定、同步围栏及存储共同提交的成立条件须重新由协议证明，不能直接把单机实现贴上分布式支持声明。

## 独立诊断提供者

诊断插件仅依赖实际存储及身份拥有者的定义入口，继承唯一 ModelDiagnosticsService；不注入 ModelRuntimeService 或 ModelSendBoundaryService。具体跨域键沿各拥有者发布入口，不能在本域定义副本。保留策略作为通过 StandardSchema 校验的构造配置，必须有已接受采用；主体核验和存储访问是注入依赖；call、游标和页长才是操作参数。

诊断依赖退出只令查询 unavailable，不卸载执行或结果承接。服务调用按 caller 的当前主体核权；自主清理捕获 provider 的上下文，并等待真实存储操作结束。关闭不清空诊断、不释放尚未满足保管或费用条件的记录。遥测出口只消费安全投影，不能从 caller Context 持有业务寿命。

## 凭据服务

凭据引用与解析规则已由 D-04 接受，并写入 [SPEC](../SPEC.md)。服务定义归 model-cordis-contract 的 `./cordis`，本地插件与注入发送归 [model-host-local](../../model-host-local/docs/cordis.md)。本包只拥有判定，不导入 Cordis，不提供服务。独立调用可以不启动 Cordis，直接使用判定函数；两种入口看到的五种结果相同。凭据服务不替代完整托管运行服务。
