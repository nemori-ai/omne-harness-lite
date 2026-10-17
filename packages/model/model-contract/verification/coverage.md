# Model 产品能力与设计覆盖

产品 CAP-MD01 至 CAP-MD13 全部承诺在 0.1.0 完整交付。本表连接[已接受产品](../../../../.meta_harness/design/product/model-invocation/design.md)与已接受的非 pi-ai 技术设计，pi-ai 具体适配保持候选，不表示实际实现通过。所有行的运行验证均待实际提供者兑现。

| 能力 | 内部 module 与流程 | 对象与公开接口设计 | 行为/协议 | 必须验证的反例与剩余证据 |
| --- | --- | --- | --- | --- |
| CAP-MD01 档案维护 | 档案维护；[流程](../../model/docs/flows.md#flow-md01) | ProfileIdentity、ModelProfile、ModelProfileMaintenance | [条件变更](../SPEC.md#档案与请求准备协议) | 同名并发、撤回行重建、跨层维护、未知提交及断电；存储提供者未实现 |
| CAP-MD02 同名求值 | 档案求值；[流程](../../model/docs/flows.md#flow-md01) | ModelProfiles、ProfileResolution | [求值与列表](../SPEC.md#同名求值选择及列表) | 缺凭据不退层、撤回后合法外层、配置排除与未知；跨拥有者版本读取待实现 |
| CAP-MD03 会话选择 | 档案求值；选择的保存归调用方；[流程](../../model/docs/flows.md#flow-md01) | ModelChoices、ModalityRequirement；选择的保存归调用方 | [准备消费路径](../docs/context.md#先求值再组装和准备) | 小窗口允许切换、当前非法值保留、下一请求失败不撤销选择；Session 集成待验证 |
| CAP-MD04 租户凭据 | 凭据拥有者；发送；[流程](../../model/docs/flows.md#flow-md01) | 无秘密 ProfileSupplier、固定 Supplier 绑定引用 | [请求准备与发送](../SPEC.md#档案与请求准备协议) | 已有绑定不可读不退默认、解绑前后竞争；凭据切片已在 model 实现；托管发送的当前资格与固定绑定适配尚未完成，新通道仍缺精确定义 |
| CAP-MD05 模态与转换 | 消息转换；历史拥有者的投影；[流程](../../model/docs/flows.md#flow-md02) | ModelMessageConversion、ModelConverterCatalog、ConvertedContent | [转换与投影](../SPEC.md#转换与历史投影协议) | 同键冲突、命中不可用、无 transcript、历史不回填、Tool ref 准入零读取；共享块迁移和历史原子接纳待验证 |
| CAP-MD06 完整请求合法性 | 请求准备；发送；[流程](../../model/docs/flows.md#flow-md02) | ModelRequestPreparation、ModelLimit、RequestBudget、ModelInputMeter、ModelTextTokenizer、ModelCountingBasis | [准备协议](../SPEC.md#档案与请求准备协议)、[媒体加载](../SPEC.md#工具定义转换与内容引用加载) | 缺图片上限、漏工具声明、AST 编码错误、估算缺余量、物化超限、扩展后不重测；同编码器异模板、计量组合失效及特殊 token 注入；供应商 schema/计量实证待补 |
| CAP-MD07 真实发出与重试 | 调用推进；策略 seam；[流程](../../model/docs/flows.md#flow-md03) | DispatchRecord、RetryPosition、ModelRetryPolicy、ModelSendBoundary | [重试与恢复](../SPEC.md#342-重试失联与恢复) | 策略回执未知、首内容不确定、供应商切换及有限次数；真实传输与持久策略验证待做 |
| CAP-MD08 流式与原结局 | 输出交付；持久事实；[流程](../../model/docs/flows.md#flow-md03) | VisibleBlock、Snapshot、TransportFact、Settlement | [流式规则](../SPEC.md#流式和首内容)、[展示顺序](../SPEC.md#展示诊断与实施证据) | 块模式途中变化、未封口工具参数、保存前展示、崩溃后重发；append/replace 混用与用量尾帧；分段存储与供应商协议需验证 |
| CAP-MD09 控制与恢复 | 调用推进；恢复宿主；[流程](../../model/docs/flows.md#flow-md08) | ControlState、ExecutionRef、ModelInstanceHost、ModelDriver、ModelHostAuthority、RecoveryRecord | [取消与恢复](../docs/context.md#竞争与恢复场景) | 观察者退出、查询失败冒充失联、旧执行者未排除、原工作资格失效后迟到；宿主排除和实际控制待验证 |
| CAP-MD10 消费与清理 | 结果消费与回收；[流程](../../model/docs/flows.md#flow-md05) | ModelConsumption、Handoff、ReadId、CustodyState | [ACK](../SPEC.md#ack-的前提与效果)、[清理](../SPEC.md#清理范围与读写保护) | 提前 ACK、保管引用失效、未知写、新读竞争、清理失败恢复；真实耐久和共享内容释放待验证 |
| CAP-MD11 真实费用 | 原 dispatch 事实；账目投影；[流程](../../model/docs/flows.md#flow-md06) | DispatchRecord、LateDispatchFact、共享 CallAccount | [费用事实](../SPEC.md#真实费用和账目边界) | 多 observer 重复入账、两次真实费被合并、未知填零、迟到复活原工作；校准统计口径不明不得借用；账目查询由其拥有者实现 |
| CAP-MD12 数据保护 | 各操作守卫；发送与披露；[流程](../../model/docs/flows.md#flow-md06) | Access、来源证据、发送围栏、ModelMediaReader | [保护](../SPEC.md#数据保护与异常)、[准备协议](../SPEC.md#档案与请求准备协议) | 跨租户、接收方改变、伪 source、撤权后发出、秘密入错误；ModelDiagnostics 最小字段与保留机制已接受，权限/具体数值仍待采用 |
| CAP-MD13 性能与观测 | 历史增量投影；阶段观测；[流程](../../model/docs/flows.md#flow-md09) | 模态覆盖依据、ModelDiagnostics、阶段观测、游标与有限缓冲 | [投影](../SPEC.md#转换与历史投影协议)、[观测](../SPEC.md#展示诊断与实施证据) | 点查扫描全历史、重建不一致、混同 TTFT、缓冲无界；固定资源在途排空、缓存不能绕权；真实性能量测和诊断入口待实现 |

内部 module 的 interface、状态及依赖分类见[架构](../../model/docs/architecture.md#内部-module-与-interface)。上表覆盖全部 13 项产品能力；主路径以外，[两种独立调用](../../model/docs/flows.md#flow-md07)适用于 CAP-MD06..12，[宿主恢复](../../model/docs/flows.md#flow-md08)串联执行、保管及账目。一个能力在表中有位置不代表行为测试已通过。

## 设计验收与实现验收

设计评审核对责任、数据形状、顺序、失败、恢复和可消费性。接口可编译只证明声明能连接。Model 领域契约与 Cordis 定义设计已接受；具体提供者、共享块实现和实际供应商仍须在各自拥有者处完成实现验收，pi-ai 设计另待接受。

新凭据通道、具体供应商支持子集、诊断权限映射和保留数值尚未定案。当前为这些约束保留明确接口责任，不把缺口当阶段豁免。依赖上述内容的具体实现应先补齐精确输入；其他明确能力可按已接受范围推进。

持续场景见 [scenarios](scenarios.md)，类型验证见 [type-consumption](type-consumption.md)，Cordis 撤除场景见 [装配](../../model/docs/cordis.md#接入检查)。

## 完整设计的实现输入

| 横向责任 | 唯一设计入口 | 后续接受证据 |
| --- | --- | --- |
| 档案/准备/转换的依赖及构造 | [构造](../../model/docs/public-api.md#独立能力构造)、[资源端口](../docs/public-api.md#档案来源与准备资源) | 替代来源、部分取得失败及独立装配 |
| 持久协调与流保管 | [记录与提交](../../model/docs/architecture.md#持久提供者的记录与提交)、[调用对象](../../model/docs/architecture.md#调用执行对象与所有权) | 未知提交、保存后展示、读取/ACK/清理竞争和断电 |
| 宿主驱动与恢复 | [受信驱动](../docs/public-api.md#受信宿主驱动)、[单机插件](../../model/docs/cordis.md#单机提供者的插件划分) | 绑定、持久唤醒、真正旧执行排除及关闭失败 |
| pi、家族和引擎 | [贡献协议](../../docs/architecture.md#pi-家族贡献的取得协议)、[证据矩阵](../../docs/architecture.md#官方支持与计量证据矩阵) | 固定资源、真实 route、未知 usage、无隐式重试及完整计量 |
| 多模态资源 | [物化](../../docs/architecture.md#物化和引擎资源控制) | 仅选定 ref 被读取，恶意媒体限额及取消后的真实退出 |
| 诊断与前置 | [诊断协议](../SPEC.md#诊断查询与保留)、[拥有者](../../model/docs/architecture.md#诊断投影与跨领域前置) | 越权、分页快照、期限与保管独立、安装闭包 |

非 pi-ai 设计已接受，可以据此分配实现责任；pi-ai 相关细化仍为候选。设计接受不代替共同依赖采用和实际提供者证据。每个实现切片沿相应反例验收，不以本文的存在关闭能力交付。
