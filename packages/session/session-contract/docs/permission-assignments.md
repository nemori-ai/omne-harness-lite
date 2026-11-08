# Session 权限配值

Session 保存会话范围的普通权限配值。Permissions 定义共同的规则和定义引用，Authorization 裁定操作资格，Governance 协调跨事务域的依据和原操作终态。Session 不解释授权表达，也不把一次人的许可保存成普通配值。

## 命令与当前状态

`change` 的 `permission-assignment` 分支指定 capabilityId、enforcementKey、精确定义引用、rule、expectedRevision 和 authorization 引用。rule 为 null 表示清除。授权引用只能定位原材料，不能证明调用者有修改权。

WorkSnapshot.permissions 保存当前权限修订和当前配值集合。稳定键在一个会话内唯一，租户和会话由快照身份限定。每次设值、替换、清除或 permission-mode 变更均推进权限修订；其他工作不推进。替换不重复追加同一个键。清除移除当前项，但原事件和操作回执保留。归档、解归档和 runtime 卸载不隐式清除配值。

新会话从修订 0、空集合开始。旧快照缺少该字段不证明没有配值，必须先完成拥有者升级；纯配值裁定对缺失状态返回 unavailable。

## 裁定与重放

`DecideReads.permissionChange` 是受保护提交链供应的事务事实。它绑定原 operationId、完整 commandDigest、权限修订、精确定义和 authority 依据。普通用户参数和 GuardCommand 文本不能产生该事实。`decide` 按下列规则裁定：

- 缺事实或原操作/摘要不符，返回 denied。
- 期望修订或事务事实的修订与当前状态不符，返回 changed。
- 设值必须匹配精确定义及稳定键，定义须允许 session 配值，pick/allowedSet 必须在值域内；非法输入返回 invalid。
- 清除当前项须匹配所存定义。定义已撤下不使旧配值永远无法清理，清除仍须有原操作写资格。对没有当前项的清除，须有匹配的合法定义。

成功裁定产生专用 `session.permission-assigned` 事件，携带前后权限修订、原声明和资格依据引用。`reduce` 检查修订连续性并派生当前集合，不重新查询最新定义来解释过去。重复批次只认回原状态。把权限配值或模式伪装成普通声明事件时，归约隔离该批次，不发布部分状态。

权限修订是当前性依据，不是可长期使用的许可。读取后发生修改时，稍后捕获必须由拥有者在同次提交核对当前修订。定义发生变化时，不得忽略旧配值而返回 absent；不能可靠匹配的来源应为 unavailable，其他来源中已知的禁止仍须保留。

## 实现与验证范围

纯 `decide/reduce` 定义上述配值行为。Session SQL 受保护组合负责提交时的原资格、当前权限关系及历史升级；应用通过 Governance 协调公开写入。纯契约测试使用具名事务材料，不能替代真实登录、持久写资格及默认装配的组合验证。

有限状态模型见 [permission-current](../verification/models/permission-current/README.md)。模型检查修订捕获、清除与重启保持；写资格成立是前提。公共行为测试为 [permission-assignment.spec.ts](../tests/permission-assignment.spec.ts)。
