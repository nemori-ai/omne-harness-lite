# credential-custodian-local

## 模型副本来源绑定候选（2026-09-27）

- **语义接受：无。** [v2-design.md](v2-design.md) 是 CCL2 的提供者增量候选；精确契约接受状态查 [registry catalog](../../../../registry/catalog.json)，下列既有设计接受不覆盖本增量。
- **可实施范围：候选。** 保留 CCL2 六操作；为目录3 S-19/S-20 提供受限技术子入口，写入时记录实际 sourceRef，同 StorageUnit 锁定当前绑定并比较才交模型副本。旧 generic 写清来源标记，generic 读仍按 tenant。独立 model-only factory 要求真实预置 keyFile，不提供完整 credentialCustodian、不装假 MCP 依赖。rev 2 明列写入结果、参与读异常/外层映射和逐 symbol 的构造/执行许可，不新增领域失败。
- **绑定与证据：0 条。** [bindings.yaml](bindings.yaml) 仍空；旧七场景/N-1～N-11 全保留，新 MCR-V1～V8 未开始。
- **实际验证：尚无。** 尚未建包；目录真实事务 helper、来源密文格式、真实 auth/accounts/keyFile 与新装配仍须实现验收。窄组件通过不等于完整 CCL/OAuth 交付。

当前消费者为 `packages/model/model-profile-directory` 的本机 P-1r 与 `apps/model-request-acceptance` 可信 bootstrap。中心送达与登录结束的产品来源缺口未关闭；范围、存储共同对象及装卸责任见[候选设计](v2-design.md)，新增证据义务见[验证增量](verification.md#模型副本来源绑定候选的验证义务)。

## 既有设计与接受范围

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，同日按独立评审 N7 修订（处置见 [verification](verification.md#独立评审)），尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.credential-custodian · v2`（[契约](../../../../spec/capabilities/credential-custodian/v2/contract.md)，状态 `accepted`，已接受、已冻结；设计依据 PF-016 rev 8、PF-002 rev 20、PF-013 rev 13）。它是那份窄口契约的**最小提供者**，取代 `apps/cli` 验收装配里原先的「凭据保管方」替身（[D-063](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1）；**真承接者是 `infra/secrets` 那一程**（契约 [G-1](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口)，cli 缺口 C-5），本节点只兑现窄口，不扩展契约
- 源码位置：`packages/infra/credential-custodian-local`——**尚未建包**。路径与第一层 `infra` 已由主线裁定（[D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-40 ①）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是封存与开封（`sealBody`／`openBody`）、交出判定（`resolveVerdict`）、清扫判定（`sweepVerdict`）、铸引用（`mintCredentialRef`），候选名，不依赖 Cordis、存储或租户；**Cordis 服务面** `credentialCustodian` 把它们接到存储与密钥上，并承担加密落地、一次一致的读、清扫在绑定行上排序、撤除收场——这几条函数层不承诺（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，必需 inject `storage` 与 `clock`，不 inject 桥**。副本条目与 OAuth 条目**以密文落在绑定所在的同一 `storage`**（两张表），**本机只放密钥**（一个密钥文件）——[D-060 §八 N-37](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ⑤；OAuth 条目对桥的 `mcp_oauth_binding.binding_id` 立引用约束，清扫与桥的完成在**那一行**上排序（与[桥节点](../../tools/mcp-bridge/design.md#对凭据保管方的要求清单) R-B5、C-1～C-3 互指）。Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现契约 S-5～S-20 的全部操作与规矩，逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)。**尚未建包、没有一行源码**。
  读与锁绑定行、判待生效过没过期都经桥包子路径 `./tx-reads`（`readOAuthBinding`、`lockOAuthBinding`、`isPendingExpired`，桥节点 X-1～X-3 已登记，[CCL-1](design.md#实施缺口与消费者影响) 已闭合）；迁移片段要排在桥的片段之后（CCL-2）；`oauthPendingTtl` 与桥同源（CCL-3）。
  **密钥文件缺席**：两张条目表都空才生成，任一张非空即启动失败（关键选择四，主线裁定）；打不开的 OAuth 条目本版留下、不作废绑定（契约 G-10）。
  **产品装配本版不装**（cli 关键选择 5）；装上也只有 OAuth 那一半有真实调用方：副本的写入来路（契约 G-6）与「登录状态结束」的来路（G-5）都没有，产品里没有人写副本、也没有人丢副本（CCL-4、CCL-5）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约的 formal task `credential-custodian-v2-sweep` 已运行、正配置无反例（[run](../../../../record/evidence/2026-09-25-formal-credential-custodian/README.md)），但它证的是模型、不是本节点的代码与存储，**不作绑定证据**；它盖不到的「在绑定行上排序」与「两边同一个过期谓词」（模型里两侧共用一个 `Expired`）正是本节点要兑现的前提，证据形式是真并发演练（[verification](verification.md#证据义务)）
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 条目落在哪、密钥怎么取、清扫怎样与桥的完成排序、为什么不 inject 桥、装卸配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、要真并发演练的交错、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## 2026-09-27 模型来源投影采用

[D-075](../../../../record/decisions/model-credential-source-projection/decision.md)技术采用上述精确来源关联与失败/权限投影。旧候选字节和验证范围保留；真实源码及负控待执行，完整 CCL/MCP/OAuth 仍无本事件交付声明。
