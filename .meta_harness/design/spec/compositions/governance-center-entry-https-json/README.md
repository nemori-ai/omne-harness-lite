# 治理中心入口 · HTTPS + JSON 传输绑定

## v3 维护绑定候选（未接受）

[v3契约](v3/contract.md)消费EC3 candidate、IV1/OE2；客户端线上`protocolVersion="2"`映射到`https-json/3`客户端面，字节语义保持HT2。
同一运维socket独立承载`opsVersion="1"`的full-health、backup、backup-status；本机verify/restore-isolated不上线。
[字节例](v3/examples.md)包含8份继承报文和16份新增报文；[验证入口](verification.md#v3-维护绑定候选)区分字节检查与尚未开始的真实连接适配验证。
本候选不授权实现，不自动升级既有消费者或冻结资源。

## 既有版本入口

[`composition.governance-center-entry`](../governance-center-entry/README.md) v1（入口契约）落在 **HTTP/1.1 over TLS + JSON** 这一种传输上的全部事实：
连接只有 TLS、只按 `Content-Length` 成帧、接收上界与接收时限及它们的下限、写完怎样关闭，请求体怎样读成信封、重复成员怎样报告、答复是哪几串字节、公开体检请求怎样发、客户端怎样认出 `version-mismatch`、运维面怎样承载在本机套接字上，以及有意不照 HTTP 规范办的几处。
入口契约 S-8 说「跨协议版本永不改的两样」，它们在传输上的具体字节就在这里；入口契约 S-6「同一个入口答复整个线上答复逐字相同」的那份字节也在这里。

**为什么它是一份单独的契约**：入口契约把传输机制留在契约之外，只约束落地必须保持的性质，并把「传输绑定没有版本化的工件」登成缺口 G-10；
这份工件要能被冻结、被按版本引用，而实现映射节点是可变的、已冻结的入口契约 v1 目录又不能再放东西——理由的长期家是提案「传输候选的采用」。
**它不拥有入口契约的任何语义，只拥有本传输自身的事实**：判定次序、答复是什么、线上形状全在入口契约与它的 Schema 里。它**接受并冻结之后**才闭合入口契约的 G-10 与 G-11 的中心一侧。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, composition.governance-center-entry-https-json, 1)`；绑定标识 `https-json/1`。
- **状态**：`accepted`，D-029（2026-09-23）；`v1/` **已冻结**，任何字节变化都发新版本。接受前的三轮修订记在[验证入口的「变化的影响」](verification.md#变化的影响)。
- **catalog 映射**：`family=compositions`、`topic=governance-center-entry-https-json`、`contract_path=spec/compositions/governance-center-entry-https-json/v1/contract.md`；
  `resources` 是 `v1/contract.md` 与 `v1/examples.md`；`acceptance` 为 null。依赖三项，全部 `rebase_relation: null`：
  `composition.governance-center-entry` v1（`accepted`）、`data.offer-expiry` v1（`accepted`，时间点的写法）与 `data.identity-values` v1（`accepted`，路由结果里三种身份值的成员与分支）；消费 clauses 以[契约 S-2](v1/contract.md#s-2-依赖与精确承诺) 为准。
- **formal-tasks 映射**：无——[形式工件不触发](v1/contract.md#s-25-形式工件不触发)。
- **提供者／装配映射**：兑现者是入口层的实现映射节点 [`realization/packages/tenancy/governance-center-entry`](../../../realization/packages/tenancy/governance-center-entry/README.md)（它的 T-2 固定字节快照 = 本契约 examples 的可执行形式）；
  证书链、私钥与运维面目录由承载装配 [`realization/apps/tenancy-host`](../../../realization/apps/tenancy-host/README.md) 给；据点一侧的客户端代理 [`realization/apps/cli`](../../../realization/apps/cli/README.md) 是将来的消费者。
- **采用依据**：入口节点[「传输机制候选」](../../../realization/packages/tenancy/governance-center-entry/design.md#传输机制候选)的「选」列，主线 2026-09-23 采用，D-029 同日接受。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 入口契约。本契约只拥有那些语义在一种传输上的字节与读法 |
| 为什么进 compositions | 线上形状归把操作送过进程边界的那份 composition（[规格入口](../../README.md#准入门槛与停止条件)）；传输绑定是那条边的一部分，但它要单独冻结、单独演化（换传输 = 新绑定，两份可以并存） |
| 稳定身份 | `composition.governance-center-entry-https-json`，版本 1 |
| 适用范围 | 客户端一面：从一条 TLS 连接建立，到中心写出答复（或决定不写）并关闭为止；运维面：本机套接字上的同一件事。**客户端一侧怎样信任证书**不在范围内（契约 G-2） |
| 依赖与版本 | 入口契约 v1、`data.offer-expiry` v1 与 `data.identity-values` v1 都已接受、已冻结；本契约只消费它们，不改它们 |
| 保护者是否明确 | 是。每条字节性质由入口层兑现，证据是字节快照与逐例测试（[验证入口](verification.md#证据义务)）；装配给的只有运维面的本机可达与证书材料（[S-24](v1/contract.md#s-24-装配给-vs-协议给)） |
| 未定的 | [已知缺口](v1/contract.md#十一已知缺口) G-2（防冒充的客户端一侧）、G-3（合 Schema 的信封可能超出接收下限）、G-4（「第 0 步先于 ①」与 ① 的触发条件是否跨协议版本冻结，归入口契约），各有 owner；G-1（运维面套接字的文件名）与 G-5（接收时限的下限，已定为 30 秒）已闭合 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [版本化契约](v1/contract.md) |
| 完整的线上字节、请求体各类读法的答复 | [规范实例](v1/examples.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |

## 版本包

`v1/` 是候选版本，接受之后整体冻结：之后任何字节变化都发新版本。**不建 Schema、不建形式工件**——形状全在入口契约的 Schema 里，本契约只引用它的 `$id` 与定义名。
换传输是一份新的传输绑定，不改本版；本版 S-18 那两样只要还在本传输上就永不改。

2026-09-25，D044接受[v2](v2/contract.md)。实现与消费者另行核对，不自动升级旧绑定。

当前采用：v3已由D055接受并冻结；客户端版本2保持，ops版本1新采用，真实适配待实现。
