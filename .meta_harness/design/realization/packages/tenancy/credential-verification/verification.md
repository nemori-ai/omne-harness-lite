# credential-verification 验证与证据

契约侧没有单独为凭据形式登记的场景：[S-31](../../../../spec/capabilities/account-identity/v1/contract.md#s-31-三种登录失败反馈完全一致)、
[S-34](../../../../spec/capabilities/account-identity/v1/contract.md#s-34-同标识两路对比) 的演练需要本节点的一个真实实现，但那两条的 owner 是 [account-identity](../account-identity/verification.md)。
本页只登记本节点自己能证的部分。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-8](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料) 第 1 条 | 单元测试：`derive` 的输出不含输入明文的任何子串；同一明文两次派生盐不同 | 未开始 | 本节点 |
| `verify` 三值 | 单元测试：正确密码 ⇒ `match`；错误 ⇒ `mismatch`；材料 scheme 不认识 ⇒ `mismatch`；参数损坏 ⇒ `unavailable`（**不是** `mismatch`） | 未开始 | 本节点 |
| [S-26](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy) | 单元测试：政策不合形状 ⇒ `unavailable`；不满足 ⇒ `{ rejected: reason }` 且 reason 指认具体规则 | 未开始 | 本节点 |
| SC-CV-1 | lint：account-identity 包不访问 `CredentialMaterial` 内部字段 | 未开始；检查器不存在 | 本节点提供规则 |
| 换代演练 | 集成：卸载本插件、装载另一实现，观察 account-identity 与 organization-governance 的 fiber **不重跑**（重启半径论证的直接证据） | 未开始 | 装配节点 + 本节点；依赖「可选依赖不触发重跑」这条待核对主张 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| 无 | — | — | — |

## 覆盖缺口

- OIDC／passkey 没有实现也没有测试，接口适用性是假设。
- 时序侧信道**不在任何义务里**——契约明列不承诺，本节点也不声称。
