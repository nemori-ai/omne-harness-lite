# Authorization 当前协议

本页提取来源设计中仍约束 AU 的当前协议；它是 candidate 施工输入。目标包、host、plugin、
事实源 link 与真实判定门尚未实现。

## 无环事实源

事实源必须具名且无环：SR 提供 SessionFacts，不在该模式递归调用 AU；TL 提供冻结 Action/
binding，不调用 AU；资源 owner 提供 ResourceFacts；HD 提供 decision/consumption facts。
AU 只检查可申请资格，HD 检查决定，二者在具名 join 中组合，不能互相冒充状态 owner。

## 设置归属与两种定义

AU 保存设置覆盖，实际工作选择仍由 SR/MC 拥有。账号级 `user`、`user_definition`
覆盖以可信 Account `UserRef` 为主体；`definition_default` 属原 Agent 定义的 owner
tenant，`session` 覆盖属于精确 Session/tenant。当前组织菜单、物理存放路径及另一
账号的同名设置均不能改变这些归属；设置读取先核当前账号，再核目标作用域的
owner/资格。`setOverride` 与 `clearOverride` 是不同操作，缺席不是保存了 null/false；
`readEffective` 分开报告已保存层、选中层、约束后可用性及生效边界。

SR/Work owner 的 `subjectDefinition` 是原 Agent DefinitionVersion，AU 的定义级 grant
与用户按定义覆盖以它为目标；冻结 `Action.definition` 是 TL 的工具贡献版本，可能
属于 Plugin。AU 判定及审计须同时保留并分别核验二者，不能因两个 Agent 使用同一
Plugin 而转借 grant。辅助 Work 缺少原 owner 可认回的 `subjectDefinition` 时 unavailable；
模型覆盖的保存与 SR/MC 选择意图须由相应组合共同提交，不能把覆盖保存冒充当前 Run
已换模型。旧来源只允许 `busy_input=queue` 的局部施工限制不约束当前
[SE-08](../../spec/capabilities/session/v1/contract.md) 已定义的 `interrupt_then_run`。

## Grantor 与解析来源的待闭合边界

旧来源在持久 Grant 和 HD DecisionFacts 中使用 `grantorBasis`，后续 grant-authority
候选又提出 `actorAuthority`；两者的统一权威、持久表示和重检关系尚未收敛。本候选
不并存两套可生效的依据，也不把旧字段直接提升为新契约。grant/amend/revoke 与
HD 作答所需的 grantor 判定必须由同一受信资源 owner 对每个精确 permission、
resource、environment 给出当前可执行/可委托上限、硬限制与版本；TG 管理角色和
请求自填权限均不能推导该上限。统一授权状态模型、来源端口和真实资源符合性证据
未闭合时，这些运行入口保持 unavailable。

TL 负责冻结已完整校验参数的 Action 和实际实现 Binding；AU 的受信解析器按精确
resolver/version 与 Binding 的 parserVersion 对应，构造权限、资源和影响范围。
来源未知、版本不符、对象不能解析或资源 owner 失联时，可调用贡献 unavailable；
公开预览 allow、`confirmation=none` 和已冻结 Action 都不是执行许可。新子动作若
超出原 Action，须由 TL 生成新 attempt 并重新经过同门判定。

## 双边登记与撤除

每条 link 在 gate 外 prepare，在同一个 coordinator `enter` 内向双方登记相同的 host、source、
registration、generation、scope 与 stamp，提交后才通知。SR↔AU 等 link 必须双边可见；
LOADING 只允许 held，不能出现半开可调用边。retire、inspect 与 waitReleased 都绑定精确登记，
撤除先封闭新判定，再排空旧代候选。

## HD 重载消歧

HD 重载会使旧 DecisionFacts 私有候选和 runtime handle 失效，但不会自动取消 HD 拥有的、
已耐久且未消费/未关闭的一次批准。当前 HD 只能在对原冻结 Action 完成当前重检后重新签发
候选；approval 不是 grant，已消费、已关闭或身份不匹配的决定不得复活。若结果为 ask 而
没有真实 HD route，必须明确标为不可执行，不能伪造已批准。
