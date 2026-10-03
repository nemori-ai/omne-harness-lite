# governance-center-entry

## D055/D056 当前维护增量

EC3/HT3 已采用并实现；业务31路由与协议2保留，opsVersion1增加明确的本机维护操作。现有八fiber承载固定副本、隔离发布、真实资源收场；证据见[维护运行](../../../../record/evidence/2026-09-26-tests-governance-maintenance/README.md)。以下 D044/v1 记录按其日期和范围读取。


当前增量：D044 已接受 EC2/HT2 与 [v2 提供者映射](v2-design.md)。源码已实现31路由、显式共同提交、改密准备/最终重核、expectedTenant及完整业务排空。新增回归与限制见 [2026-09-25 实际证据](../../../../record/evidence/2026-09-25-tests-entry-production/README.md)。下列v1绑定与运行记载仍对应历史版本，不自动提升为v2证明；CLI/TUI的当前实现与有限验证归 apps/cli。


- kind：`provider`
- 对象与设计修订：状态 `implemented`（源码修订 HUB `c9b5850`），2026-09-23 首稿；兑现 `omne-harness-lite-design-2026-09-15 · composition.governance-center-entry · v1`（[契约](../../../../spec/compositions/governance-center-entry/v1/contract.md)，状态 `accepted`（[D-028](../../../../record/decisions/governance-center-design-acceptance/decision.md)），主责产品依据 [PF-017](../../../../product/PF-017-governance-center-as-deployable-application/README.md) rev 2），落在传输绑定 `composition.governance-center-entry-https-json` v1（`accepted`、已冻结，[D-029](../../../../record/decisions/governance-center-transport-binding-acceptance/decision.md)）上。形状依据[提案 `governance-center-entry`](../../../../record/proposals/governance-center-entry/README.md) 的候选 A，随 D-028 接受为实现路径
- 源码位置：`packages/tenancy/governance-center-entry`——**已实现（HUB `c9b5850`）**：`src/plugin.ts`（入口层 `governanceCenterEntryPlugin`）、`src/ops/`（运维面 `governanceCenterOpsPlugin`，及两张面共用的 HTTP/1.1 连接层、答复外形与接收上界）、`src/transport/`（TLS 客户端一面）、`src/json.ts`（严格 JSON 读取器）、`src/routing/`（路由表、判定次序、认人、答复字节、工程记录）、`src/center-id/`（迁移片段、读或铸、迁移前核对）、`src/events.ts`（四个通知名）；公开入口 `src/index.ts`。第二层 `tenancy` 是租户领域这个限界上下文的名字（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个包、两个 Cordis 插件，**都不 provide**，都装在装载清单最后、**同起同停**。
  **入口层** `governance-center-entry` 必需 inject `logins`、`registration`、`organizations`、`memberships`、`offers`、`storage`、`credentials`（只用 `parse`）、`clock`（只在启动时用）：一个 TLS 监听、一张封闭的路由表、判定次序与答复映射、启动时读或铸中心标识；**启动成功以钟可读为条件**——插件体里等 `clock.now()` 可读，上界是装配给的 config `clockReadyTimeoutMs`，超界即启动失败；
  **就绪与开门分两步**：插件体只绑端口不受理、标识就绪、钟可读后返回，等装配传入的 config `openSignal`（一个 Promise）兑现才开门、读钟作 `startedAt`、发 `serving`；
  账号能力按 [`capability.account-identity` v2](../../../../spec/capabilities/account-identity/v2/contract.md)（`accepted`，D-028）消费：**认人凭出示物走 S-44**，列表句柄就是 `LoginStateId` 本身，入口层永不以线上收到的 `LoginStateId` 认人；**在路由上不提交任何东西**，全包只碰 `governance_center` 一张表，由本包导出它的迁移片段。
  **运维面** `governance-center-ops` 只 inject `storage`、`clock`：本机套接字上只答完整体检，不引用任何治理服务。
  中心标识、版本、开门与关门、缺陷经三条 `emit` 通知从入口层到达运维面，不落存储、不经服务；运维面每次装载发一声 `listening`，开着门的入口层据此重发 `serving`，两者被各自重跑时仍能对上。
  中心标识那一行由迁移以占位（未铸）插入：入口层按契约 S-28 的三种读法收场——未铸即铸，已铸合形即用，**那一格不存在或值不合形即启动失败**，失败恰为读不到、写不进、不存在、不合形四支并点名是哪一支；表整个丢了由升级守卫的迁移前核对挡。配置错误一个政策：启动失败。Cordis 采用 `@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）

## 分层状态

四项分别陈述，不互相补齐。

- **语义接受范围：入口契约 v1 全部条款（S-1～S-48，含 G-1～G-12 作为显式缺口）与本节点的设计，依据 [D-028](../../../../record/decisions/governance-center-design-acceptance/decision.md)（产品负责人，2026-09-23）。**本节点的设计——独立不 provide 的 fiber、同包运维面、占位行读或铸、`openSignal` 两步开闸、`listening` 握手——随同一决定接受为实现路径；G-10／G-11 已由 [D-029](../../../../record/decisions/governance-center-transport-binding-acceptance/decision.md) 闭合（传输绑定接受并冻结；防冒充中心一侧在本节点、客户端规则在 `apps/cli`）。主责产品依据 PF-017 rev 2。接受不提升下面三层。
  参与方里账号能力改用 v2（D-028 接受）；其余四份契约 v1 已由 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受（账号能力 v1 也在其中，本节点已不消费它）；采用版本与名字由 D-025、[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md) 接受
- **可实施范围**：本节点声称兑现契约 S-1～S-36 中落在入口层与运维面的部分，逐条见 [design.md 的投影表](design.md#能力到-cordis-的投影)；
  并**认领契约的两条缺口**——**G-10 传输绑定的版本化工件**（`composition.governance-center-entry-https-json` v1，D-029 接受并冻结，见[传输绑定](design.md#传输绑定将来冻结的工件)）与 **G-11 防冒充的具体手段**（中心一侧：只有 TLS 监听，证书链与私钥是部署配置输入、不是部署密钥，见[防冒充](design.md#防冒充中心一侧的手段与材料)；客户端一侧的规则由 D-029 定、落在 `apps/cli`）。
  **不兑现**：客户端一侧（标识比较、「问不到」的呈现、据点副本、防冒充的确认）；契约 G-2～G-4、G-7、G-8（G-1 随 AI v2 闭合，证据在账号能力一侧）；「装配给」一列里归 `apps/tenancy-host` 的各项（装载顺序、迁移合成与原子性、迁移前核对 `governanceCenterPreflight` 的接入（N-16，那边已实现）、config 来源、日志汇、撤除总超时，以及 **`openSignal` 的兑现时机**——全部 fiber `ACTIVE` 且升级快照确认之后——与兑现后等 `serving` 的上界，见[归装配](design.md#归装配的事项)）。
  **读法待核对与依赖他节点的**：载荷内部成员重复按 `payload` 重复同一步收场，是本节点的延伸读法（N-3，契约 S-4 稳定稿仍未单列）；`clockSane` 的运行中回拨由时钟节点检出（N-5，时钟包已按此实现）。原 N-1（`startedAt` 在钟读不到时）、N-2（工程记录分不出存储与钟）已由契约裁决闭合，本节点照裁决写（启动等钟、超界启动失败；工程记录只记入口层自己观察到的失败值），见[缺口表](design.md#实施缺口与消费者影响)。
  **AI v2：已对齐**。认人改调 [AI v2 S-44](../../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（`logins.exchange`），列表句柄 = `LoginStateId`，域分隔派生与多重匹配分支已删；出示物的表示层用账号能力包导出的 `parseLoginStatePresentation`（S-45 交换表示的全部四条），不解析线上的 `LoginStateId`；「只凭出示物认人」写成结构检查（[本节点约束](design.md#本节点约束存储要求之外)第 8 条，含不 import `parseLoginStateId`、不写 `as LoginStateId`）；出示物的线上形状归入口契约 Schema，`LoginStatePresentation` 就是 S-45 交换表示的投影，账号能力签发的 43 字符 base64url 过它（[对齐义务](design.md#出示物的线上形状对齐义务)）；撤销的句柄在载荷那一步过 Schema（只到 IV S-31），过了原样交给 `revoke` 的 `unknown` 目标参数。`credentials` 的注入不变。
  撤销目标（N-14）**已闭合**：[AI v2 S-16](../../../../spec/capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) 的来源要求只针对发起方，撤销是一次调用，载荷里的句柄原样交给 `revoke` 的目标参数（`unknown`，表示层归账号能力包）。
  **已闭合**：与入口契约改钉 AI v2 的稳定稿逐条核对（N-11）；开门那一刻的失败由 `apps/tenancy-host` 有界等 `serving`、超时即启动失败承接（N-12，[那边的两步开闸](../../../apps/tenancy-host/design.md#两步开闸就绪与开闸分开)）；与改写后的契约 S-28 逐条核对（N-15）；迁移前核对的接入由 `apps/tenancy-host` 承接（N-16）；契约 S-28 前提与 S-36 那一行的核对判据已改为本节点 R-GC8 的那条（N-17）；传输与 JSON 解析器的采用（N-6，D-029）、结构检查（N-7）、接收上界（N-8）、契约接受（N-10）、账号能力包与时钟包按设计实现（N-13、N-5）。**仍开着**：等钟超界的错误不具名、装配靠说明文本识别（N-18）。**已知边界**（不是缺口）：只有占位行的新表被拼进已有事实的数据、或已铸的值被本包之外的写者改回 NULL，下次启动会铸出新标识——本包只碰一张表。
  以上**已实现（HUB `c9b5850`）**；本节点的名字都是实名（包公开入口 `src/index.ts`）
- **绑定与证据**：[`bindings.yaml`](bindings.yaml) 两类——绑到契约 formal task `governance-center-entry-v1-decision` 的六条（S-10、S-11、S-13、S-14、S-32、S-33，证的是**契约模型**，不是本节点源码），与绑到本包测试的 `test:` 条目（入口契约与 https-json 绑定的各条款，证据 run [`2026-09-23-tests-tenancy-leg-2`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md)）；前提逐条写在各绑定里，逐行的通过／部分／无证据见 [verification.md](verification.md#证据义务)。
  S-7、S-15、S-18、S-19 不绑（自指、模型表达不了、或没有变异证明会失败），理由在 bindings 末尾。S-11 那条的前提已改为 AI v2 S-44，并与契约稳定稿核过（N-11）。本节点自己的十九条测试义务 T-1～T-19 与结构检查已有包内测试与 `tools/ts-checks` 规则，逐条状态待 [verification.md](verification.md#证据义务) 回填
- **实际验证**：包内测试（`tests/` 下 `decide`、`bytes`、`framing`、`json`、`transport`、`center-id`、`center`、`ops`、`lifecycle`、`skeleton`、`basis`、`slow` 与类型测试；真实 TLS 连接、真实 Unix 套接字、真实 sqlite 文件库与四个真实参与方插件）在运行 `2026-09-23-tests-tenancy-leg-2` 里随十三个 TS 成员 build／typecheck／test 在 sqlite 下全过，证据登记在 [`record/evidence/2026-09-23-tests-tenancy-leg-2/`](../../../../record/evidence/2026-09-23-tests-tenancy-leg-2/README.md)（HUB）；入口层答复字节与传输绑定 examples 逐字节相同已另行独立核过。契约模型：运行 `2026-09-23-formal-governance-center-entry`，TLC 正配置无反例、九个否定配置各出反例——那是契约的证据，不是本节点源码的（[verification「实际执行」](verification.md#实际执行)）。逐条覆盖待 verification 回填

## 按当前问题展开

| 当前问题                                                                                                                                    | 阅读入口                      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 两个插件各 inject 什么、一个请求怎么走、27 条路由各调哪个方法、传输与防冒充的候选、中心标识存哪怎么铸、装卸怎么配对、对存储要什么、还缺什么 | [实现设计](design.md)         |
| 哪条承诺由哪份证据支持、前提是什么                                                                                                          | [绑定表](bindings.yaml)       |
| 要证什么、实际跑过什么、还缺什么                                                                                                            | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

D055/D056 已采用并实施的维护提供者精化：[maintenance](maintenance.md)。

D056已采用[维护run调用方资源补全](../../../../record/decisions/governance-maintenance-resources-adoption/README.md)，精确提供者修订见决定；实现已完成；实际验证与边界见[维护运行证据](../../../../record/evidence/2026-09-26-tests-governance-maintenance/README.md)。


## 2026-09-26 终审修补与最终制品

[最终固定输入、运行与独立QA](../../../../record/evidence/2026-09-26-tests-governance-review-fixes/README.md)接续D055/D056与D057：生产闭包移除测试运行器，初始化未收场责任与叠加故障诊断修复，领域契约不变。18成员最终合并1926通过/34跳过，host最终单独重跑；两包清单、严格独立类型消费、47项独立制品旅程及真实首启故障恢复、三组跨OS与systemd通过。最终host r3、CLI r2的SHA/BUILD_ID在该run；旧记录不提升到新制品。Fable三轮及主线处置均有公开记录，未发现本期阻断。

限定：首次工作根创建须串行；原位源变动精确hash/fstat分支未独立验到；TUI仍限D054 profile，不是任意终端支持；恢复只隔离，同机备份不覆盖整机/磁盘毁损。公司实际部署、Agent工作会话与Web/desktop不属于本次验证。

## 2026-10-03 固定Schema技术采用

[D-116](../../../../record/decisions/fixed-schema-precompile/README.md)与[本节点固定图装配](fixed-schema-precompile-design.md)补充现行设计。只改变固定图编译/装载时机；本机制实施、实际绑定与验证未完成，原契约和历史run的状态不据此改写。

## 2026-10-03 D-116 主体实施与有限验收

本节点固定图已实施构建期生成与首次实际消费时的同步原生装载。全部定义、公开结果/errors、构建失败清理、恢复、新鲜性及制品消费的实际范围见[主体原始运行与有限签收](../../../../record/evidence/2026-10-03-tests-fixed-schema-main/README.md)。本段取代上文 D-116 补充中关于固定图实施/验证尚待的状态；原契约、其他能力与历史运行的边界不变。
