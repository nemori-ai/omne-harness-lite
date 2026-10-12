# 资产组成员与协作

状态为待审技术设计。正式维护位置不授予技术接受、实施或支持；精确公开形状仍待定义。

## 阶段范围

0.0.0 -> 0.1.0 完整支持下列九项能力，依据为[产品阶段承诺](../../../.meta_harness/design/product/assets-and-rules/design.md#阶段与版本支持承诺)。完整支持包括公共业务操作、来源接入和实际求值，不能只交付类型或契约文档。具体资产类别提供专有内容语义和实现，共同治理提供可独立消费的公共行为。

| 能力 | 行为拥有者 | 规格落点 |
| --- | --- | --- |
| CAP-AR01 | assets 定义共同契约，settings 与 permissions 维护各自属性行为，类别提供专有校验 | [定义](../assets/SPEC.md#definition-and-version)、[设置声明](../settings/SPEC.md#declaration)、[权限求值](../permissions/SPEC.md#bounds-and-picks) |
| CAP-AR02 | assets 维护身份、归属、作者及创作来源 | [身份](../assets/SPEC.md#identity)、[定义](../assets/SPEC.md#definition-and-version) |
| CAP-AR03 | assets 维护公共草稿、发布及选版，类别提供内容校验 | [定义与版本](../assets/SPEC.md#definition-and-version) |
| CAP-AR04 | assets 维护持有及禁用、移除，settings 维护依附配值与清除 | [持有](../assets/SPEC.md#holding)、[配值](../settings/SPEC.md#assignment) |
| CAP-AR05 | assets 选择合法实现，permissions 提供使用资格及不可放宽的权限约束 | [候选与替换](../assets/SPEC.md#candidate-resolution)、[权限](../permissions/SPEC.md#usable-by) |
| CAP-AR07 | 获准来源提供者读取工作区材料，assets 选择同层候选，settings 合成允许设置 | [来源选择](../assets/SPEC.md#candidate-resolution)、[工作区合并](../settings/SPEC.md#workspace) |
| CAP-AR08 | assets 保留合法来源，settings 控制逐件启用，permissions 输出保守约束，准入与执行方落实 | [工作区设置](../settings/SPEC.md#workspace)、[保守权限](../permissions/SPEC.md#workspace) |
| CAP-AR09 | settings 管理配值并求取有效设置 | [声明](../settings/SPEC.md#declaration)、[配值与求值](../settings/SPEC.md#assignment) |
| CAP-AR10 | permissions 管理权限配值及实际求值，身份与执行方消费依据 | [求值](../permissions/SPEC.md#bounds-and-picks)、[写入](../permissions/SPEC.md#writes) |

CAP-AR06、11、12、13、14、15、16 没有该阶段的独立能力交付承诺。下文保留其长期责任及约束，复制、分享、转移、提升等路径不因此成为该阶段的交付要求。所选九项所需的来源依据、完整采用、可辨失败、秘密保护和适用耐久保证仍须成立；未选能力不构成降低这些保证的理由。

## 责任分解

| 目标成员 | 拥有的事实与行为 | 消费方 |
| --- | --- | --- |
| assets/assets | 具体资产、能力标识、定义版本及不可替换声明、来源、持有与候选选择；长期还拥有复制血缘、分享及提升 | 装配、资产类别、设置、权限、治理入口 |
| assets/settings | 合法属性配值、设置来源过滤、覆盖及锁定、有效设置依据 | 装配、运行消费者、管理入口 |
| assets/permissions | 结构化权限项、允许范围、锁定上界、默认挑选、不可覆盖的操作权限限制及求值依据 | 当前使用资格筛选、身份准入、实际资源边界 |

组织、成员、登录和角色归identity；工作区身份、实例及参与关系归workspace；装配清单与安全采用交接归assembly；AgentDefinition、类别形状及业务分别归各类别。assets只通过公开契约消费这些事实，不收回各类别的完整实现，也不发明统一执行runtime。

设置和权限是资产的不同属性。配值依附持有，形状随有效定义。能力组目录不是共享数据库、运行服务或共同提交边界。三成员在工程上相近，但各自求值规则不能合成一套通用覆盖算法。

## 安全、观测与依赖方向

所有权、持有、来源及资格各自可核对。来源说明、审计和遥测不得暴露凭据原文、其他租户私有配值或源个人组织资产内容。记录当前采用依据与真实结果，但不把邀约、求值或reload报告成实际工具执行。

独立消费不要求启动Cordis。集成入口消费同一公开契约，将明确依赖接入Cordis装配，不把其活体Context写入数据契约。类别提供者实现公开的治理所需契约，assets不导入全部类别私有实现。SDK与server-entry通过系统公共契约接入，不穿透assets存储步骤。

## 持续验证责任

0.0.0 -> 0.1.0 按九项能力分别验证公共操作及实际求值。assets 验证同标识并存与持有选择、定义不可替换声明及持有锁、生效层方向、被过滤候选不截断回退、同资产下层持有、草稿发布选版和工作区真实来源。settings 验证四类过滤、覆盖、锁定、清除与移除竞争，定义不可替换不自动冻结属性，工作区定义声明不被误当治理配值。permissions 验证上界交集、作者默认、组织、租户和会话主动配置的操作不允许值在未加锁时也不可放宽、工作区过滤和替换删项不逃约束。

复制血缘层隔离、分享终局和提升分享政策属于长期流转验证义务，在对应能力实施时展开，不作为该阶段未选能力的完成要求。

assembly与上述成员共同验证四步求值、候选失败保留旧状态、来源变化竞争和秘密不随替换件转移。Session与能力类别验证已知身份保留、迟到结果不改历史及真实执行继续收场。静态依赖和文档检查不能替代这些行为证据。

## 流程适用范围


状态为候选，待负责人确认。本文把[产品关键旅程](../../../.meta_harness/design/product/assets-and-rules/design.md#key-journeys)连接到[领域责任](#责任分解)及三个成员的行为规格，不另定义一套规则。AR-J01 至 AR-J10 是文档定位号，不是产品对象或公开接口。

assets 拥有共同资产事实与管理结果，settings 拥有设置配值和求值，permissions 拥有权限配值和求值。身份与授权提供可信主体、关系及动作准入；workspace 提供明确工作区及来源资格；assembly 拥有能力选入与合法清单采用；类别拥有专有声明、校验、使用行为及执行收场。共同协调按具体操作归管理入口或 assembly，不把所有类别装进一个统一运行时。

图中的实线调用表示请求或控制，返回线表示结果或依据。明确标作事实的消息仅供后续消费，不充当共同提交。flowchart 表示活动和依赖，不是严格 UML 或算法证明。这里没有选择 API、存储事务、锁、缓存或提供者。各流程完成前仍须补齐 [ASSET-M01](../assets/docs/internals.md#asset-m01-完成与来源协议) 对应的操作身份、版本、提交和查询协议。

0.0.0 -> 0.1.0 完整支持 CAP-AR01、02、03、04、05、07、08、09、10，流程中的来源依据、耐久确认与真实失败是这些能力的必要保证。AR-J06 的组合能力、AR-J07 至 AR-J09 的流转及 AR-J10 的独立刷新和完整解释等未选能力仍为长期要求。图的存在不授予阶段采用、实现或接受。


## 持续验证与机制缺项

<a id="journey-verification"></a>

旅程对应的持久验证义务就近维护在 [assets](../assets/SPEC.md#journey-verification)、[settings](../settings/SPEC.md#journey-verification)及 [permissions](../permissions/SPEC.md#journey-verification)。文档覆盖记录只连接位置，实际行为证据须由成员和 assembly、身份、类别等真实协调者取得。

所有流程的操作身份、版本、共同完成、结果查询与恢复接口沿 [ASSET-M01](../assets/docs/internals.md#asset-m01-完成与来源协议)。公开类型、扩展契约、类别兼容、来源版本与刷新、权限分档比较及缓存条件沿相应 SPEC 的未覆盖段落。AR-F09 的直接来源核实和接收协议不得被笼统的协调箭头当作已实现，AR-F01 的组织创作委托沿 ASSET-N01。没有新增产品待裁决，也没有在本页选择这些机制。
