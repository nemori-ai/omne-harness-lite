# 模拟评审输入（非开发过程记录）

# 施工计划：center-connection-probe 节点落地（候选）

- **计划修订**：r1（候选，未获准执行）
- **目标**：把模拟组件 `模拟组件/infra/center-connection-probe` 落成产品包（一个包、两个插件：
  `center-connection-probe` 与 `center-connection-replay`），取代验收装配里「中心连接」那个替身。
- **采用的设计**：`capability.center-connection/v2`（已接受）；节点设计 `design.md`（已接受）；
  传输绑定 `composition.governance-center-entry-https-json/v1` 的 S-4、S-5、S-17。
- **验收边界**：契约规范场景 S-13～S-15 与 examples §1～§3；节点 `verification.md` 的 N-1～N-10。
- **基线**：执行仓库 `main` 的提交 `模拟baseline-A`。

## 前提

1. `infra/clock` 已交付，验收装配里可注入。
2. Node 的 TLS 与 HTTP 客户端行为按成立处理：`minVersion: 'TLSv1.3'` 使更低版本握不了手；给了 `ca` 时证书链不对或主机名对不上，
   请求以错误结束；`agent: false` 每次新开连接；销毁请求会关掉套接字；答复体没读满时不交截短的体。
   这五条是 Node 文档写明的既有行为，**不另安排取证，节点 verification 的 N-11 本计划不做**。
3. 严格无损 JSON 读取取自 `core/content-blocks`。T3 开工前由 A 核对该导出是否已在；不在则停下报主线。
4. `since` 缺席那一支（节点 CNP-12）按主线裁定实施；契约 S-5 的改写由规格侧落字，落字若与裁定不同，T4 的 N-3 重验。
5. 实施者一名（A）；`tools/ts-checks` 的规则由其 owner 审。

## 任务

每个任务做完即合入主线，再开下一个。

| # | 任务 | 负责 | 开工条件 | 交付物与完成判据 |
|---|---|---|---|---|
| T1 | 建包骨架 `packages/infra/center-connection-probe`：清单、tsconfig、公开入口；入口契约 Schema 的逐字节副本与漂移测试（N-9） | A | 前提 1 | 可构建的包；N-9 通过 |
| T2 | 纯函数 `observe`、`classifyProbeReply`、`nextProbeAt` | A | T1 已合入 | 源码；N-1 的性质测试通过 |
| T3 | 一次探测 `probeOnce`（`node:https`，只有 TLS 1.3，按 `trust.caPem` 与主机名核证书，答复上限 `probeReplyMaxBytes`） | A | T2 已合入；**脚本化 TLS 对端与测试证书可用** | 源码；N-8（探测请求的形状）通过 |
| T4 | 插件 `center-connection-probe`：节拍、在途一次探、撤除、时钟不可用的收场、缺陷计数 | A | T3 已合入 | 源码；N-3、N-4、N-5、N-6 与 N-7 的单元测试部分通过 |
| T5 | 插件 `center-connection-replay`：按 config 里的脚本回放对端行为，共用 `observe` 与节拍。**排在 probe 之后，因为它只是测试件** | A | T4 已合入 | 源码；N-2（节拍，含「改成固定周期即红」的变异）通过 |
| T6 | 装配：验收装配装 `center-connection-replay`、删掉替身那一行；**同时把 `center-connection-probe` 装进产品据点清单**，让依赖它的 P-1r 不再停在 `PENDING`；结构检查 N-10（产品清单里不得出现 replay；本包不 inject 存储、不 `emit`、不监听）带「故意违反就失败」的自测 | A（装配清单只由 A 改） | T5 已合入 | 两份清单的改动；N-10 与 N-7 的装配测试部分通过 |
| T7 | 场景演练：S-13、S-14、S-15 与 examples §1～§3，**统一用 replay 插件按脚本回放**；S-13 的「在场」一支受阻于验收装配里的 P-1r 与一次在途模型调用，本计划只核「没有重跑」 | 脚本由 A 在 T4、T5 里顺手写好；**演练结果与实现不一致时，以实现为准修订脚本的期望** | T6 已合入 | 演练的原始输出 |
| T8 | 独立验收：qa 角色在干净检出上照 T7 的脚本跑一遍，出四态判决 | qa（不是 A） | T7 完成 | 判决与机器证据 |

## 资源

- 脚本化 TLS 对端与测试证书**不在本计划范围内**，本计划没有生产它的任务；开工时看谁手上有就用谁的。

## 交付判据

T8 的判决为 Pass 或 Pass with issues，且 N-1～N-10 各有对应的测试或结构检查结果。

## 风险与处置

- 探测间隔、超时与答复上限的初值（30 s、10 s、16 KiB）没有测量依据：沿用节点设计给的候选初值，由装配的配置给，交付后有测量再调。
- 不核「连到的是不是这个据点所属的中心」（节点 CNP-3）：本计划不处理，记为已知缺口。
- 信任方式本版是 CA 链加主机名（CNP-2）；将来换成钉公钥时 S-15 要重跑，另立计划。
