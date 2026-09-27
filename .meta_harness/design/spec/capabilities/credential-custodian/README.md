# 凭据保管方

**[会话据点](../../../ubiquitous_language/terms/grounding-and-isolation.md#ul-session-base--会话据点--session-base)上凭据本体的保管**：每个租户那一把[模型凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)在这个据点上的副本（按租户存取，归属写下它的[登录状态](../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state)、随它结束而清除），
与经 OAuth 取得的 [MCP 凭据](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)本体（收成「待生效」，只在绑定 `granted` 且记下的就是它时按持有交出，清扫只丢三种）。
**落地只以加密形式存在**；本体只在两个取值问法的成功返回里出现。

**这是一份窄口**：只收模型档案读提供者与 MCP 桥已列出的要求。**它不拥有**凭据绑定（`capability.model-profile-directory`）、OAuth 绑定的迁移（`capability.mcp-bridge`）、秘密从中心送到据点（入口组合 v2）；
静态 MCP 凭据、续期写回、中心一侧的保管本版不收（[契约 S-2](v2/contract.md#s-2-本契约不拥有什么)）。
**依赖方向是单向的：本契约 → 身份值、持有与引用、OAuth 绑定、桥的绑定语义、模型档案目录的凭据绑定。**

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.credential-custodian, 2)`
- **状态**：`accepted`、资源已冻结（2026-09-26，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md)）；接受范围含显式缺口。实现与验证状态见 verification.md。
- **catalog 映射**：已登记为 accepted。`family=capabilities`、`topic=credential-custodian`、
  `contract_path=spec/capabilities/credential-custodian/v2/contract.md`，`resources` 另含 `v2/examples.md` 与 `v2/formal/` 下的模型、配置与映射页；
  依赖五项，消费 clauses 取自[契约 S-4 的被消费面表](v2/contract.md#s-4-依赖方向与被消费的面)：
  `data.identity-values` v1、`data.asset-model` v2、`data.mcp-endpoint` v2、`capability.mcp-bridge` v2、`capability.model-profile-directory` v2
- **formal-tasks 映射**：`credential-custodian-v2-sweep`（[`v2/formal/Sweep.cfg`](v2/formal/Sweep.cfg)）；去保护配置与探针不登记，映射见[形式工件页](v2/formal/README.md)
- **提供者/装配映射**：[packages/infra/credential-custodian-local](../../../realization/packages/infra/credential-custodian-local/README.md)；当前节点设计已由 D-062 接受，源码／实际验证按各节点四层状态分别读取。
  **最小提供者的形态**（[D-060 §八 N-37](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤ 定，取代本程施工简报原写的「本机加密文件」）：**副本条目与 OAuth 条目都以密文落在绑定所在的同一存储**（`core/storage`，与桥 R-B5、C-1～C-3 同一约束域），**本机只放密钥**——「本机加密文件」只指密钥，不指条目。这样 [契约 S-19](v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行「OAuth 条目与桥的绑定共有一个排序点」由同一存储兑现；密钥怎样保管、换钥怎样重加密仍是 [G-9](v2/contract.md#十一已知缺口)。
  真承接者是 `infra/secrets` 那一程（[G-1](v2/contract.md#十一已知缺口)）；接口契约 ＋ 最小提供者取代验收装配里的替身（[D-063 R-1](../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md)）

## 准入核对

- **独立责任**：凭据本体的保管（加密落地、按归属清除、按条件交出）有它自己的变化原因（密钥与存放方式、登录状态的生灭），消费者有两个（模型档案读提供者、MCP 桥）；放进任何一个消费者里，另一个要么复制一份保管，要么读它的内部——秘密就不只在一个地方。
- **稳定身份与版本**：首版 v1，候选。
- **依赖**：一份已接受（`data.identity-values`），四份候选——候选依赖改动时本契约须重核。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本版本精确承诺什么 | [版本化契约](v2/contract.md) |
| 副本与 OAuth 条目走通是什么样、每个失败值的反例 | [规范实例](v2/examples.md) |
| 清扫与完成交错的形式模型与配置 | [形式工件](v2/formal/README.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [已知缺口](v2/contract.md#十一已知缺口) |

## 版本包

`v2/` 是候选版本目录。发布（接受并冻结）之后规范正文、实例与模型不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。

## 2026-09-26 版本接受

本次接受 `capability.credential-custodian` v2 的全部条款，[D-061](../../../record/decisions/assets-runtimes-contract-acceptance/decision.md) 为实际接受依据；catalog 与冻结资源已对齐。后续规范变化出新版本，不改写已冻结版本。
