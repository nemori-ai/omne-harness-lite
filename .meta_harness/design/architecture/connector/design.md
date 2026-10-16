# Connector 仍有效的接入约束

当前PF-002／PF-014已将连接件整体条件性搁置，不构成当前交付承诺。先决定是否仍作为资产，再决定是否恢复设计。本页保留原 Schema 的历史值约束和条件性跨模块设计，不释放提供者施工。Connector 提供者、可信交接、入站来源事实仍未实现。产品的新事件目录、订阅与处理身份规则尚未在完整技术形状中收口。下文“现有”仅指封存版本中的形状，不表示新架构存在连接件 Schema 或实现。恢复范围后，技术拥有者必须重新核对这些输入及其消费者。

## 值与身份

现有 `ConnectorDefinition` 是闭合的 `{ source? }`。唯一可选项给作者默认来源；正文跟随资产记录复制／分享。凭据引用与投递目标只在持有配值中，不得进入正文。能力身份仍为类别＋name，不从来源或目标推导。

`SourceIdentity` 闭合成员为 `channel`、`externalAccount`。两者是外部不透明字面值，非空、无首尾空白，逐码点比较；不解析、不修补、不做Unicode规范化。`channel` 恰为空串报 `channel_empty`，空白串、空 `externalAccount` 等报 `malformed`。来源不证明账号与凭据匹配，不允许反查租户、持有或资格。

现有 `DeliveryTarget` 恰一支 `{ kind: "session", session: SessionRef }`，引用 Messages 的唯一 `SessionRef` 定义。出现而不为 `session` 的 kind（含非字符串、大小写不同）报 `target_unknown`；缺 kind 报 `malformed`。目标不存在、归档或不可访问属于受理拒绝，不属于 `target_unknown`。引用不授予资格，跨租户默认拒绝。
目标只引用已有会话；连接件事件开新会话是另一条产品路径，不预留 `new_session` 目标分支。按外部线程分会话仍为非目标。目标无作者默认，各格缺值时不放行。

现有 `InboundEnvelope` 闭合形状为 `{ externalId, receivedAt, text?, attachments?, source }`，externalId、receivedAt、source必需。text 与 attachments 至少出现一项；都缺报 `envelope_empty`，空串或空数组报 `malformed`。文本只含空白仍合法，原样保留，不解析或规范化。附件为非空有序 AttachmentRef 列表，原引用与顺序保持；交接时字节已在其存储中，引用不授予读取资格，读取由存储拥有者按租户现判。

`(source, externalId)` 唯一表达“同一件外部事”：分量逐码点相等才相同。连接件重投不能现铸新 externalId，不从该值推导 MessageId、时间、次序或渠道。去重范围、拒绝痕迹和外部编辑后同ID异内容的处理归受理；最后一项仍待PF-014裁决。
`receivedAt` 使用现有 Instant 表示，只指连接件收下的时刻，不是外部产生或本系统受理时刻，不是身份或排序依据。缺失时不能补成受理时刻或假造一个值。receivedAt相同或倒挂均合法，任何业务判定不读取该值；不据此新增时效或可信时钟资格。会话内次序由日志决定。

## 受理与信任

信封必须不含租户、持有、投递目标或处理身份，也不含命令／是否处理／插队／中断／取消等标志。可信交接另显式携带持有、租户身份、投递目标与处理身份，并认证实际接入端。不得从source、externalId、正文或附件键补归属；没有“当前租户”或默认身份。缺少必需上下文时判不出、不放行。外部文本不能改写该上下文。

受理后的信封落成恰好一条 UserMessage：文本原样为一块文本块，不加 origin；附件不丢、不重排，媒体type为image取图块、audio取语音块，其余取文件块，沿Content Blocks规则。externalId、receivedAt、source留在入站来源事实中，不塞进闭合的Message。去重／拦下／拒绝者不落消息；痕迹由受理拥有。
以 `/` 开头也只是外部内容，不能触发斜杠命令或系统流程。连接件接入面只有送一条消息到队尾的职责，不能读日志、管理会话、覆盖／撤回／重排、插队、改变运行或执行工具／模型。

送进来并受理的消息必须被处理，没有“收下但不处理”。外部筛选在连接件交接之前；它不替系统忽略已受理输入。停用或移除连接件只影响后续接入，不撤销已落日志的输入和已产生的外部效果。

## 持有、声明与缺席

鉴权绑定 `credential` 是CredentialRef，不是秘密本体，不用于呈现。一份持有一份值，不跨租户共享；同人在两个租户各配各的。同一租户身份接同服务两个账号需要两份不同name的连接件。没有配值即缺席，不造“未绑”值；缺失沿外格求值，全部缺失则不能连接。非引用凭据值沿资产写面的 `valueOutOfDomain` 拒绝。组织层不允许配鉴权绑定；这是当前产品规则，旧未决说法已不适用。

现有可确定声明：

| item | 类别／域 | 默认 |
|---|---|---|
| source | setting／placement_identity，SourceIdentity | 仅取正文source，缺席时不带 |
| target | setting／placement_identity，DeliveryTarget | 不带 |
| credential | setting／placement_identity，CredentialRef | 不带 |
| triggeredSessionRunMode | setting／governance，never／auto_permission／bypass-permissions | 不带，作者默认无效 |

三种运行模式的权威是统一语言的会话运行模式，不依赖Tool Admission的定义。四项都不能从workspace配置；placement_identity／governance违例由求值沿原拒绝规则过滤。没有触发模式时连接件事件不能开新会话，受理明确缺项；不是选择默认模式。
声明应为正文确定函数，item不重复；不自行产出保留项disabled或usableBy。**上表不是完整声明集合。**旧 `install`／`processingIdentity` 两权限的表示尚未随产品修订收口，不能补取值域、默认或把“推不出”当“没有”。

## 表示校验

每个接收边界重验，不信上游已校验；非法值进入业务判断之前拒绝，不记作受理的业务结论。不能丢掉多余／坏成员、裁空白、大小写归一化或部分保留附件来修补。
现有值的拒绝集合闭合，多处违例固定按 `target_unknown > channel_empty > envelope_empty > malformed` 取最高项，与遍历顺序无关。malformed判据为其余Schema形状失败，内嵌SessionRef／AttachmentRef／Instant违例沿该项收场。嵌入资产形状时按资产闭合集合携带原名；不另造同义错误。Schema合法仅证明形状，不证明可信、会话可访问或附件可读。

原 Schema 的历史依据为[封存资源快照](https://github.com/nemori-ai/omne-harness-lite/blob/481f9f45f76f7a36a2c3cd05cc42b640d77a421a/packages.0.0.1.legacy/core/asset-model/schema/resources/connector.schema.json)。该快照解释下文保留的形状和拒绝值，不是当前公共接口，也不授予原 URI 的新采用。新共同资产的[类别正文端口](../../../../packages/assets/assets/SPEC.md#accepted-public-types)没有连接件类别。连接件技术拥有者须在范围恢复后确定公开形状、Schema 身份及验证入口。单值形状合法仍不证明交接认证、实际账号一致、声明求值、去重或投递进展。

## 阻断实施的未决

| 未决 | 真实拥有者与释放条件 |
|---|---|
| 事件目录、类型成员、厚信封、消息包形状、目录外／未订阅拒绝、事件订阅设置 | PF-002／PF-014与Connector专项共同收口完整形状和声明，不能把旧五成员信封写死 |
| 事件开新会话的交接、agent definition／租户选择及模式缺项拒绝 | PF-014／PF-015受理和生命周期端口，不能作为目标的新分支猜定 |
| 安装权限与usableBy的关系、固定处理身份 | PF-002已规定权限只剩安装、处理身份是固定规则；固定处理身份按目标会话创建时捕获的租户身份，外部账号仅作来源；安装权限与usableBy的技术对接、处理身份的认证／当前性仍需专项采用，不能把它重新作为权限取值域／默认待裁，旧两权限不能实现 |
| 认证交接、必需归属、入站来源事实、externalAccount与实际凭据账号一致及失败 | PF-014受理拥有者明确端口、事实和当前授权责任；不能让来源断言冒充认证 |
| 外部编辑同ID异内容后的去重 | PF-014产品拥有者裁决，不静默吞掉或当新消息 |

连接件不承诺外部可靠投递、崩溃后补发、内容真实、文本／附件体积上限或任何推进性质。受理后的不漏不重由受理／Loop拥有。未来体积上限须是具名政策参数。

## 验证义务

保留形状可用原 Schema 核对历史规范输入，不表示新成员验证通过。恢复范围后，由连接件技术拥有者建立正式 Schema 和对应实例。单值约束与两分量相等本身不要求新增 TLA 或 Alloy 模型。验证应分开报告 Schema、实际拒绝值、受理和真实组合。
必须配对空channel与空白channel、双缺内容与空串／空数组、未知kind与合法但不可达会话、正文加credential／target、多处违例次序。来源／externalId原样和重投不变、租户隔离及资格、斜杠文本原样落日志、附件类型与顺序、无读／管理面、持有凭据只能经写面修改均有消费者义务。
交接、处理身份、编辑去重、事件目录等未决未闭合时，相应场景保持未完成，不以Schema通过代替。
