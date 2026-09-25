# 凭据保管方

**[会话据点](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)上凭据本体的保管**：每个租户那一把[模型凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)在这个据点上的副本（按租户存取，归属写下它的[登录状态](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)、随它结束而清除），
与经 OAuth 取得的 [MCP 凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)本体（收成「待生效」，只在绑定 `granted` 且记下的就是它时按持有交出，清扫只丢三种）。
**落地只以加密形式存在**；本体只在两个取值问法的成功返回里出现。

**这是一份窄口**：只收模型档案读提供者与 MCP 桥已列出的要求。**它不拥有**凭据绑定（`capability.model-profile-directory`）、OAuth 绑定的迁移（`capability.mcp-bridge`）、秘密从中心送到据点（入口组合 v2）；
静态 MCP 凭据、续期写回、中心一侧的保管本版不收（[契约 S-2](v1/contract.md#s-2-本契约不拥有什么)）。
**依赖方向是单向的：本契约 → 身份值、持有与引用、OAuth 绑定、桥的绑定语义、模型档案目录的凭据绑定。**

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.credential-custodian, 1)`
- **状态**：`candidate`（2026-09-25 起草，未经独立评审）——未接受、未冻结
- **catalog 映射**：已登记为 candidate。`family=capabilities`、`topic=credential-custodian`、
  `contract_path=spec/capabilities/credential-custodian/v1/contract.md`，`resources` 另含 `v1/examples.md` 与 `v1/formal/` 下的模型、配置与映射页；
  依赖五项，消费 clauses 取自[契约 S-4 的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)：
  `data.identity-values` v1、`data.asset-model` v1、`data.mcp-endpoint` v1、`capability.mcp-bridge` v1、`capability.model-profile-directory` v1
- **formal-tasks 映射**：`credential-custodian-v1-sweep`（[`v1/formal/Sweep.cfg`](v1/formal/Sweep.cfg)）；去保护配置与探针不登记，映射见[形式工件页](v1/formal/README.md)
- **提供者／装配映射**：尚无节点（主线另立）。服务键候选名 `credentialCustodian`（[D-040 §八 M69](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
  **最小提供者的形态**（本程施工简报定）：**本机加密文件**。**与 OAuth 条目的要求有张力**：[契约 S-19](v1/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行要求 OAuth 条目与桥的绑定共有一个排序点（桥节点 R-B5：同一存储、同一约束域）；本机文件做不到这一条时，最小提供者只承接副本条目，OAuth 条目要落在绑定所在的那份存储里（密文）——已报主线。
  真承接者是 `infra/secrets` 那一程（[G-1](v1/contract.md#十一已知缺口)）

## 准入核对

- **独立责任**：凭据本体的保管（加密落地、按归属清除、按条件交出）有它自己的变化原因（密钥与存放方式、登录状态的生灭），消费者有两个（模型档案读提供者、MCP 桥）；放进任何一个消费者里，另一个要么复制一份保管，要么读它的内部——秘密就不只在一个地方。
- **稳定身份与版本**：首版 v1，候选。
- **依赖**：一份已接受（`data.identity-values`），四份候选——候选依赖改动时本契约须重核。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [版本化契约](v1/contract.md) |
| 副本与 OAuth 条目走通是什么样、每个失败值的反例 | [规范实例](v1/examples.md) |
| 清扫与完成交错的形式模型与配置 | [形式工件](v1/formal/README.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [已知缺口](v1/contract.md#十一已知缺口) |

## 版本包

`v1/` 是候选版本目录。发布（接受并冻结）之后规范正文、实例与模型不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。
