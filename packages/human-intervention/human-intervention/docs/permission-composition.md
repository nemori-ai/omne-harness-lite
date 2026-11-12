# 人工授权、权限依据与上下文组合

动态项声明、四类 scope、存储归属及卸载/重装配的共同协议归[治理贡献合同](../../../assets/docs/governance-contributions.md)。C3/C6/C8 消费该 HJ0 候选。HITL 只保管人的决定，不拥有贡献目录或许可持久化。

本页是已于2026-11-06由用户验收的HJ0跨域采用协议，描述本波必须接通的组合。Permissions的完整规则仍由[权限规格](../../../assets/permissions/SPEC.md)拥有；Authorization解释授权表达与许可；[Runtime Context](../../../../docs/architecture/runtime/runtime-context.md)按资格供给当前值和变化，不判权限、不组装请求。界面上的global/only-session/one-time-call只是便于人的选项，不是一个足够表达业务的权限枚举。

## 正交轴

| 轴 | 内容 | 事实拥有者 |
| --- | --- | --- |
| 资源与真实关口 | 能力/资产身份、目标、动作、真实权限项与关口 | 类别与执行环境；Assets保存定义/持有 |
| 规则配值 | 默认/组织/租户/会话、锁定允许集合、未锁挑选、主动禁止 | Permissions语义，Settings配值 |
| 动作匹配 | owner、operation、target、purpose、生效参数摘要、实现与依据 | Authorization及原动作拥有者 |
| 表达宽度 | granular具体动作；blanket具名动作集合 | Authorization；Schedule提供本域匹配投影 |
| 作用范围与寿命 | one-time原调用、only-session原会话、tenant持久后续规则；显式期限 | Authorization，Session提供会话终局，Settings保存持久规则 |
| 使用次数 | 一次消费、具名批次、可重复范围规则 | Authorization；不把session与“一次”混同 |
| 询问模式 | never/auto_permission/bypass-permissions的既有模式输入 | Session；模式翻译及合法采用归集成/准入 |
| 人的处理 | 选项/原话/明确拒答，原请求关联及有效处理 | HITL及原等待协调者 |
| 当前性 | 来源修订、资格、授权撤回、会话终局、资产持有与规则变化 | 各原拥有者；提交/执行协调者重核 |

`global`仅表示本租户允许的持久选择，写入Settings并经Permissions求值供后续请求读取，不签发跨租户无限许可，不替已经出卡的请求自动作答。Session授权跟随逻辑会话，不跟随runtime实例；会话终局后迟到批准不能复活。one-time绑定原调用的技术重试身份，重传不是再授一次。

## 规则求值与全化

设适用锁定允许集合为L1…Ln，可信外部上界为B，主动不允许操作的事实为D。有效允许范围`A = B ∩ L1 ∩ … ∩ Ln`。D中任一适用禁止阻止对应操作，即使配值未锁，也不能被下层挑选、会话模式或人工批准覆盖。作者默认的不允许仅为最外层挑选，不自动成为D。

从最具体来源向外选择首个落在A内的挑选。若无挑选落界内，有序分档权限才可按其拥有者声明的距离取最近档，等距取较严档；缺比较关系返回不可用，不自造距离。工作区不提供权限配值；其保守权限沿原类别规则。资产替换不能移除能力身份上已有的锁定上界或主动禁止。

纯求值返回`effective {value,allowedSet,sourceRefs,revisionVector}|denied {reason,evidence}|unavailable {missingBasis}|invalid-input`。该结果是一次采用材料，不能作为未来提交的永久许可。Authorization在原动作点结合当前资格、结构化结果、会话模式及人工决定，返回`allow|deny|ask|unavailable`；原话不明准驳保留guidance，不进入allow。

Session的bypass-permissions只按已有模式规则跳过询问，不跳过结构化禁止、持有资格或环境关口。必要来源缺席时缺项可观察，依赖操作不放行。

## Provider与消费协议

以下是待采用的消费语义与返回字段，不宣称已有同名源码API。实现闭包先映射已有端口，确有差额才新增公开定义。

| Provider/端口职责 | 输入 | 返回与失败 | 拥有者及消费者 |
| --- | --- | --- | --- |
| PermissionBasisProvider | 可信principal、tenant、资源/关口/目的、实际采用定义 | 规则声明、层级配值、外部上界、主动禁止、revisionVector；缺项/拒绝/不可用 | Permissions协调Assets/Settings事实；Authorization与候选筛选消费 |
| SessionAuthorityProvider | 可信principal、tenant、sessionRef | 当前会话模式、逻辑生命周期与修订；不得从“可读会话”推导写设置资格 | Session；准入和会话授权终局守卫消费 |
| AuthorizationDecision/Grant | 原动作指纹、上述当前依据、DecisionRef可选 | allow/deny/ask/unavailable；grant引用、匹配范围、使用规则和证据 | Authorization；原动作关口消费 |
| AuthorizationCommit | grantRef、原operation、原动作指纹、目的端binding | consumed/adopted、revoked/mismatch、conflict、unknown及原操作查询 | Authorization与目标操作协调者保护撤回竞态 |
| Runtime Context块生产者 | 语义拥有者声明和作用域登记 | 消费者形状的当前值/来源，或缺项；每次读取重核资格 | Assets/Permissions、Session等生产；Context仅中介 |
| Request/Admission assembler | 消费者needs、bound reader、当前动作 | 固定本次采用值及来源，必要动作点重核 | Agent请求/准入协调者或实际调用集成方；不是Runtime Context |

供给块用于可重读的规则和模式。语义授权状态块按作用域持有者的步提交成为事实，不凭Context中的一次更新提案宣称持久许可成立。HITL答案、Authorization许可和Settings生效回执分别确认，未知阶段有原身份可查。

原子协调不得只读版本再写：Identity现有reservation解决成员资格；许可撤回、会话终局和目标采用需各拥有者提供受保护消费/封口或同事务参与者。完整保护清单及失效写者见[提交协议](protocol.md#提交保护清单)，不得只保护列举的部分来源。单机采用共享登记事务域的联合提交，跨后端未来须兑现同语义或明确unavailable，不强迫公开wire协议共享DB。

## 实现现状与本波差额

Permissions入口为空；资产权限声明/provider和会话模式供给链尚未完整接通。Authorization应用row已有部分真实访问/准入策略，但不是完整结构化权限与持久人工许可提供者。Runtime Context真实provider存在，采用定义表为空等接线缺口不能靠图中箭头补成已实现。

本波C3补规则与可信provider组合，C6补人工授权范围、撤回/消费及Settings落地，C8将真实来源接到Schedule管理。这里只实现既有权限规则与本闭环所需真实关口，不扩成新通用权限平台。来源：permissions SPEC、authorization SPEC、Session block及adapter模式翻译、runtime-context正文、应用context-definitions与session-ad12。
