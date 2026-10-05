# 治理中心服务端的公开集成与资源责任

根入口拥有 entry/ops 配置、独立工厂、显式依赖和 GovernanceCenterWork；不加载 Cordis。
`./cordis` 拥有四种限定名绑定，消费同一工厂。配置只含数据；运行对象不进入配置。
公开工厂不要求 Agent 或 tenancy-host。调用方提供原存储、时钟、业务、开闸、维护、日志及通知依赖。

## 启动与停止

构造不执行 I/O、不订阅通知。setup 第一次调用同步推进到首次 await，重复调用返回同一 Promise。
close 先保存稳定 Promise，再同步关闭本实例继续启动及准入资格，防止依赖或通知重入另开关闭过程。
close 等已开始 setup 结算，再释放取得的全部资源及真实在途工作，最后撤除通知订阅。
setup 失败独立拒绝，不被 close 成功覆盖。关闭及订阅清理同时失败时保留两个错误。
close 先于 setup 时不启动资源；随后 setup 以 GovernanceCenterWorkStopped 拒绝。
工厂观察内部 Promise 的拒绝；调用方仍须调用并等待 close。

每项已接纳业务先登记，再调用可同步重入 close 的依赖。网络排空上界不代替真实业务完成。
启动中的资格来自 isCurrent；entry 开闸另核 isReadyToOpen。准入每次仍核 opening.isOpen。
这些资格不表达租户授权，也不替代持久身份及同提交参与核验。
原时钟超时、100ms 轮询、TLS/Unix 协议、接收和排空上界保持。

entry 取得的端口、启动前缀与监听由同一工厂关闭；开闸通知抛错沿原路径记日志。
ops 在第一次异步等待前安装三项订阅。部分安装失败保留 setup 的原错误；close 撤除已取得的前缀。
维护检查集合和 closed 目标来自 EntryMaintenanceResources；检查非空且每项是函数，完成目标必须是函数。
同一次 setup 捕获同一完成目标，提供者后续换代不能把旧实例的完成通知转交新拥有者。
未取得 socket 的失败前缀不删除另一实例的 socket。

## 绑定与静态边界

独立绑定先登记关闭 effect，再 setup；管理绑定同步将同一工厂 setup/close 交给 startAssemblyWork。
管理绑定保留 assemblyLifecycle:1 和纯 describeAssembly 声明。OwnedWork.ready 与 fiber ACTIVE 分开观察。
必需服务键用公共常量直接列入 inject；资源提供者由装配保持到真实关闭完成。
EntryServices 只授予原路由所用操作与参加事务能力，不扩大同提交例外。

ServingNotice 与四个事件常量唯一归 core/governance-center-entry 根；Events 增补只在其 `./cordis`。
ops 只订阅 SERVING_EVENT/STOPPED_EVENT/DEFECT_EVENT，只派发 LISTENING_EVENT。
静态白名单只增加无导入的 work.ts 生命周期叶子和 AssemblyDeclaration 的类型导入。
纯事件叶子只消费 Instant 类型；不得经叶子、命名空间、私有入口或运行时导入绕入治理实现。

## 保持与依据

31 条路由、判定次序、租户拒绝、同提交、中心身份、wire/Schema 身份、SQL/迁移及维护算法保持。
上述未迁业务和验证义务继续归[精确旧节点](../../../.meta_harness/design/realization/packages/tenancy/governance-center-entry/README.md)及[保持表](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
本页只接续服务端工厂、绑定、资源和事件的公开集成承诺，不退役其余旧源。
采用依据为[身份整体设计](../../../.meta_harness/design/record/decisions/identity-integration-design/decision.md)及[T4 接缝](../../../.meta_harness/design/record/decisions/identity-t4-host-coordinates/decision.md)。
源码、声明、运行闭包和制品消费须分别验证；类型及静态图不能证明启动、隔离、事务或关闭。

## 请求判定与协议装配

`service-faces.ts`、`json-shapes.ts` 与 `routing/record-shapes.ts` 分别唯一拥有服务、读取结果与工程记录形状。`routing/routes.ts` 保留原31条业务调用及失败规则，`route-wire.ts` 按同一原 schema 拥有协议投影。内部形状与投影不成为新的公共操作。

`decision-policy.ts` 通过私有协议、关联号和认证事务端口作原判定。`decide.ts` 绑定实际 JSON 读取、原协议编码/校验、关联号与原共同事务；五参与面仍在同一 atomic 回调按原次序构造。公开体检与无需查询的拒绝不读取服务或启动事务。

成功路径仍按投影、矛盾检查、Schema 校验、编码、最后活动、真实提交、字节交付的原顺序完成。原捕获边界分别保持；校验和编码仍在提交前。已观察缺陷在回滚后保留，不被污染单元的终结异常覆盖。改密准备后最终事务使用原 caller/ticket，不再 exchange。注册仍保持三个独立提交。

本成员策略不直接拥有 wire 编码、关联号 crypto 或存储终结。既有公共身份函数的传递运行闭包继续有效；此分离不宣称共享公共根无 crypto，也不扩大租户授权或同提交例外。

R1-T5 的严格 JSON 形状搬迁只允许 json.ts 从 json-shapes.ts 以具名纯 type import 消费 JsonLimits、DuplicateMember、JsonReading。新叶子只能含 interface/type 声明，无导入、重导出和运行时语句。SC-2 对运维与只读叶子绕入治理/写逻辑的限制保持；本例外不开放其他名称、消费者或运行时绑定。

## 维护策略与实际文件拥有者

维护的 Metadata、BackupDescriptor、大小上限和文件名判据由 maintenance/backup-data.ts 唯一维护；原 MAGIC 文本仍相同。metadata-policy.ts 拥有原时间判据，metadata.ts 与 input-codec.ts 拥有原协议校验和字节编码。

input、catalog、publication、online、offline 只消费 maintenance-ports.ts 的具名效果。实际文件/目录、同fd稳定检查和资源登记分别归 input-io、directory-io、file-io；assembly 唯一选择文件、codec、摘要和中心读取。useBackup 在同一次 files.useInput 回调内完成原 header、纯输入对象构造与业务调用，close 仍由真实资源拥有者和 session 负责。公开离线工厂的名字、选项、结果和错误不变；不增加其他导出路径。

中心读取仍绑定原 readSnapshotCenterId，在同一原 view 内保留逐迁移、逐Check与原结构/身份SQL检查，不去重或另开快照。原单任务准入、stop请求/close实际完成、正常耗尽digest、中心筛选先于时间/耐久、可见发布不可撤销、未知耐久、残余与清理错误优先级保持。原三处测试与两构造改接实际装配，原类方法故障注入的作用阶段不变。
