# 动态治理贡献契约

## 范围与依据

本成员拥有动态贡献、当前治理采用和受保护目录的公共协议。语义依据为[动态治理贡献](../../assets/docs/governance-contributions.md)与[领域边界](../../../docs/architecture/layers-and-dependencies.md)。本成员的类型与 Schema 已进入源码。本地提供者的实现与验证状态见 [governance-local](../governance-local/README.md)；完整生产组合仍待独立验收。

执行清单采用继续遵循 [AC-02](../../../docs/domains/assembly-and-handoff/adoption-coordination.md)。本协议不改变 adoptionCoordinator 的 prepare、validate、read，也不发行授权、修改设置或推进 HITL 等待。

## 结果与不变量

### GC-01 身份与范围

入口先检查有限结构与预算，再验证 Access 中的主体、租户及当前资格。scope.tenantRef 必须等于 Legal Identity 对 Access.tenant 的规范编码。tenant 可见范围必须匹配该租户；organization 可见范围必须匹配该租户的组织。public 的发布者授权由受信发行映射核验，不从插件名称推断。Scope 的租户是目的存储边界，不改变定义的公共可见性。

Schema 只保证结构与文本形式。身份授权、关联一致性、定义语义及真实关口由提供者检查。不得把 safeParse 成功当作当前资格。管理读每页重新验证资格，不存在与无权访问的对象使用相同公开分支。

### GC-02 原操作

原操作由命令种类、scope、核验后的主体与 operationId 共同确定。generation 是请求内容，不是另一个原操作命名空间。同操作同业务摘要认回原结果，异摘要返回 operation conflict。业务摘要使用规范 JSON，排除传输状态和 provider 对象。

contribute 重传不得创建新租约或复活已退出租约。registered 的 state 表示此次观察的租约状态；queryOperation 的 original 保留提交时的原结果，不能因随后退出而改写成功事实。

### GC-03 不可变声明

ownerId、definitionId、version 唯一决定一个声明摘要。即使旧租约全部释放，同版本异摘要仍 conflict。同摘要允许不同原操作持有兄弟租约。提供者复用 Settings 与 Permissions 的语义验证，检查重复身份、origin、权限投影和 enforcement 关联，不另写规则求值算法。

不可变定义的权威归功能或资产发布拥有者。提供者须从受信来源解析完整身份对应的规范声明，并比较引用及正文；无法核实来源返回unavailable，不能接受调用方摘要或允许布尔值。各租户库中的声明副本和唯一键只守护本地认回，不能单独证明跨租户同版本唯一性。资产声明从合法发布派生，独立功能声明从其定义权威派生；租约跨租户独立不改变这个来源责任。

`GovernanceDefinitionSource` 是提供者消费原发布的只读端口。输入只含 ownerId、definitionId、version，不含调用方期望的 digest、正文或租户配值。受信装配负责将命名空间绑定到原发布拥有者。来源返回完整规范声明或 unavailable；不能以允许布尔值替代正文。来源负责版本不变性、origin 与发行身份的关联及真实 enforcement 映射，发布摘要算法仍归来源拥有者。

端口传递有限 JSON 声明。远端适配器须先限制传输字节与嵌套，再解析结果。提供者在异步查询前固定调用方正文，核对返回的完整身份、定义语义和完整内容。错误身份、非法来源结果或来源异常返回 unavailable；合法来源与调用方正文不一致返回 definition conflict。来源核验不发行登记主体资格，也不替代将来动作的当前事实核验。

每个 bundle 最多 128 个设置项与权限项合计，每个 scope 的完整候选最多 128 个租约，目标选择最多 128 个。结构 Schema 的各数组上限不替代合计预算。提供者还须在解析前限制序列化输入字节，并在自己的 SPEC 声明该固定上限。预算耗尽返回 limited，不能截断后成功。

### GC-04 完整发布

adopt 核对当前 declarationRevision、adoptionRevision、所有当前候选、目标及真实关口。collection.digest 覆盖规范化的完整选择和声明摘要；提供者按权威当前集合重算，不相信调用方自报完整。一个 bundle 的 Settings 和 Permissions 一起发布。空集合只有在权威当前候选同为空时才可发布。

collection.digest的wire编码固定为SHA-256小写十六进制：对包含scope、declarationRevision、complete的对象作RFC8785规范JSON编码并取UTF-8字节。complete的每项为contribution、definition和selectedTargets；definition为完整DefinitionRef。目标先按其规范JSON文本排序，成员再按其规范JSON文本排序。重复项仍非法。提供者重算的definition来自当前权威声明，不能由调用方替换。local后端公开createGovernanceCollection作为构造辅助，不替代采用检查。

候选失败不替换旧份。精确撤除改变当前可用性与采用修订；最后支持租约退出时移除受影响运行选择。兄弟租约不被一起撤除，但旧依据仍须失效。每次修改与其回执在一个权威提交中成立。

### GC-05 当前依据

GovernanceBasis 是一次受保护读的事实。它绑定 scope、epoch、采用修订、声明修订和声明摘要。它不是将来动作的许可。Settings 提交和 Authorization 消费通过领域自有端口，在动作排序边界重新核验当前事实。业务领域不导入本成员以取得全局状态。

### GC-06 有界目录

readCatalog 的 management 展示有资格查看的声明和持久目标；runtime 只展示当前采用且可用的选择。游标绑定主体、scope、mode、targets、全部相关修订和稳定排序位置。改变绑定或修订返回 basis conflict。缺依赖只能返回 partial 并列出 unavailableOwners，或 unavailable；不得伪装完整空页。page.completeness 表示来源完整性，nextCursor 表示分页结束与否。

## 所有权、失败与生命周期

### GC-07 结果认回

unknown 只说明调用者没有取得原命令的权威结果，不能当作未提交重发另一操作。queryOperation 先重新核验披露资格。查无领域记录不足以返回 not-committed；该结果必须有权威存储未提交证明或同域不可逆封口。pending 表示已受理而尚未终结。纯目录读不产生 unknown。

### GC-08 精确撤除与重装配

withdraw 必须匹配完整 ContributionRef 及原注册主体授权。旧 generation、另一 registrationId 或另一租户的退出不能影响当前租约。进入 closing 后拒绝本租约的新采用，待撤除事实持久后才报告 released。关闭失败保留 pending 或 unknown 的认回责任。

Cordis 提供者把登记绑定到调用方 fiber，在首次异步等待前登记清理承担者。单个幂等关闭流程先封住受理，再撤除，最后排空资源。dispose resolve 不能替代业务关闭证明。新实例先隔离旧 epoch；旧实例不得恢复接受新工作。可编辑值、许可和原操作回执分别由原领域保管，不随 fiber 卸载删除。

### GC-09 独立装配

具体提供者可以依赖 Storage、Identity、Settings 与 Permissions；资产路径增加 Assets。它不要求 Session、Agent、Tool 或 HITL 存在。调用端通过 GovernanceCommands 或 GovernanceQueries 依赖所需能力；Cordis 入口只持有唯一服务定义。

## 组合与验证

输入形状与公开导出由本成员测试验证。生命周期、跨租户、完整发布、同提交围栏、原操作恢复和实际 SQL 成本由提供者符合性验证承担。动态贡献的有限模型归 [HJ0 verification](../../human-intervention/human-intervention/verification/README.md)，组织来源保留归 [Settings verification](../../assets/settings/verification/README.md)。这些模型不证明本成员的实际提供者已经实现。
