# 决定

本家族拥有已发生的接受选择、理由、范围与取代关系。每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 已发生接受、需要形成长期记录时，从本地 [topic 模板包](.templates/topic/README.md) 复制为 `<topic>/`；包内为入口和 `decision.md`。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 尚未接受的决定文案留在来源提案中，不作为本家族的实际主题；决定至少引用一份来源提案或研究，并能定位有权者实际接受的修订与范围。

## 准入门槛与停止条件

- 必须能定位接受者/权限、日期或记录、精确修订、接受范围、保留前提与取代关系。
- 缺少实际接受就停在 proposal；部分接受只记录该部分，不能把待实现、待验证或 reviewer 建议并入决定。

命名、裁剪与跨家族引用遵循 [信息包约定](../../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

本节按实际子目录链接决定信息包，保留 D-NNN 编号与取代关系；
**没有决定文件就是没接受**，本节不因为一份提案写得完整而为它添行。

| 决定                                                                                                                            | 接受了什么                                                                                                                                                                                                                                                                                                                                  | 接受者与日期                   | 明确**不表示**                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| [D-019：定向 fork pi-ai 用于 OpenRouter 传输](model-provider-pi-ai-fork/README.md)                                              | 传输与模型协议的**实现选择**：以 pi-ai 的 OpenRouter provider、模型目录、协议请求与流/工具解析为基线做定向 fork                                                                                                                                                                                                                             | 产品负责人，2026-09-16         | fork 已做出、达到产品质量或可接入；模型执行与预算契约被接受（**两者在本设计链里还不存在**）；费用与身份已验证                |
| [D-022：CLI-TUI 交付形态](cli-tui-delivery-form/README.md)                                                                      | 五条**产品形态与交付深度**：交付到什么深度、面向生产分发且多同事进同一组织、会话与 Run 与工具执行在用户本机、中心治理节点是独立应用、交互层包家族名 `frontend`                                                                                                                                                                              | 产品负责人，2026-09-22         | 接受[任何技术选型](../proposals/cli-tui/alternatives.md)；接受任何契约；建立任何节点或包；接受 SYS-DEPLOY 的重读             |
| [D-023：接受租户领域的设计链](tenant-domain-design-acceptance/README.md)                                                        | 四类对象：**五份契约 v1 全部条款**（含各自已知缺口作为显式缺口）、能力拆分「维持五份 + 两处修正」与共用数据契约的合并、**六个 provider 节点的设计**作为实现路径、**PF-001 投影 v1** 作为实施入口；catalog 五条翻 `accepted`、18 项资源冻结                                                                                                  | 产品负责人，2026-09-22         | 任何实现存在或符合；任何验证完成；各契约缺口与投影 18 项 Q-n 已闭合；Cordis 采用版本、存储已定；`covers.json` 已复核         |
| [D-024：租户领域的限界上下文名 `tenancy`](tenancy-domain-name/README.md)                                                        | 一个名字：`packages/tenancy/<node>` 这一层叫 `tenancy`                                                                                                                                                                                                                                                                                      | 产品负责人，2026-09-22         | 布局判据改变；任何契约或节点语义改变；Cordis 采用版本已定                                                                    |
| [D-025：Cordis 采用版本 4.0.4](cordis-adoption-version/README.md)                                                               | 一个版本号：产品包依赖 `@deepseek-ai/cordis` 4.0.4；basis 与三条待核对主张按它重取证                                                                                                                                                                                                                                                        | 产品负责人，2026-09-22         | 任何 Cordis 语义已被核实（看 probe）；DSH 其他复用组件的版本已定；后续补丁自动采用                                           |
| [D-026：基础设施持久化的四条选择](infrastructure-persistence-choices/README.md)                                                 | 无 in-memory 实现；SQL 经 Kysely 由配置切 sqlite(`node:sqlite`)/pg；队列先 redis；本地日志 JSONL；SQL 提供者进租户第一程                                                                                                                                                                                                                    | 产品负责人，2026-09-22         | 存储协议接口已定；`infra`／`tenancy-host` 名已拍板；跨进程存储协调已定                                                       |
| [D-027：`infra`／`apps/tenancy-host` 名拍板，sqlite `synchronous=NORMAL`](infrastructure-names-and-sqlite-durability/README.md) | 两个名字不再是候选；开发期 sqlite 持久性档位 `NORMAL`，OS 崩溃可丢最后一段已提交事务作已知边界                                                                                                                                                                                                                                              | 产品负责人，2026-09-23         | 治理中心交付面已有 PF；断电级持久已承诺；pg 持久性已定                                                                       |
| [D-028：接受治理中心交付面的设计链](governance-center-design-acceptance/README.md)                                              | 四类对象：**入口契约 v1 全部条款**（含 G-1～G-12 作为显式缺口，G-10／G-11 开着先接受）、**账号能力 v2 全部条款**、能力边界选择「入口层独立 fiber」、八个节点本程的设计与修订；四件待定项的选择（断电边界写回 PF-017 rev 2、窄带读法接受、前跳校正不给运维出口）                                                                             | 产品负责人，2026-09-23         | 实现与验证、传输绑定与防冒充手段、升级整体性的契约家、账号能力 v1 消费者自动升 v2                                            |
| [D-029：接受治理中心的传输绑定、防冒充落点与第一版安全基调](governance-center-transport-binding-acceptance/README.md)           | 五项：**传输绑定 `https-json` v1 全部条款**接受并冻结（入口契约 G-10 闭合）、防冒充两侧落点与客户端信任中心的五条规则（G-11 闭合）、JSON 解析器自写、cli 节点 D11 改向、第一版「自己人开发与实验」的三条安全边界（登录状态无寿命、限流靠部署边界、持有证明留下一版）                                                                        | 产品负责人授权主线，2026-09-23 | 实现与验证、登录状态到期与刷新、确认失败的呈现、任何超出自己人实验的部署                                                     |
| [D-031：工具定义数据契约的起点](tool-definition-baseline/README.md)                                                             | 一个**起点方向**：按 PF-006 §5.3 自研 JSON Schema（提案 D）；minimal-runtime、DSH、omne-next 三源只作参考、字段命名与结构可照抄                                                                                                                                                                                                             | 产品负责人，2026-09-23         | 任何契约存在或被接受；字段、方言、返回形状已定；任何实现；提案四项待区分调查已做                                             |
| [D-032：工具执行运行时的实现起点](tool-execution-runtime-baseline/README.md)                                                    | 一个**起点方向**：自研（提案 C）；DSH jobs 与 local-execution 只借鉴避坑、不 fork；两源已知失败情形列为测试义务                                                                                                                                                                                                                             | 产品负责人，2026-09-23         | 任何契约或提供者设计；`core/storage` 协议已接受；X-1～X-7 已做；同日据点停机收场的产品裁决（归 PF-012／PF-006／PF-009）      |
| [D-033：hooks 兼容层的起点](hooks-compat-baseline/README.md)                                                                    | **起点与 fork 边界**：fork DSH `hook-protocol` 无运行时的四个文件 + `HookOutput`，runner／导入／映射／交付自写（提案 A）；改动超半改 C 的判据保留；G1–G11 推迟到拓展点协议起草时裁                                                                                                                                                          | 产品负责人，2026-09-23         | 拓展点协议或兼容层契约；fork 已做；区分实验已跑；G1–G11 任何一项已裁                                                         |
| [D-034：Skill 规格形状的起点](skill-spec-adoption/README.md)                                                                    | 一个**起点方向**：Agent Skills 开放格式 + 规则层自持（提案 B）；内容类扩展走包内定义记录、不进 frontmatter `metadata`（B-2b）；叠加参考 omne-next 与 Codex 的兼容扩展                                                                                                                                                                       | 产品负责人，2026-09-23         | 任何契约；任何一条具体外部扩展被采纳；基线快照、name 字符集、键分类表已定；研究缺口已闭合                                    |
| [D-035：消息、到达语法与流装配器的起点](message-and-stream-baseline/README.md)                                                  | **三层起点**：数据契约自研、语法借 `StreamChunk` 骨架并条款化、装配器自写、pi-ai 止步传输适配、工具同语法发帧；三层落 core、先于两块运行时契约（提案 D，经独立架构评审判成立）                                                                                                                                                              | 产品负责人，2026-09-23         | 任何契约或实现；pi 原始参数探针已做；评审上交的九条保留前提已闭合；PF-009 rev 5／PF-013 rev 5–6 已确认                       |
| [D-036：斜杠命令识别与解析的起点](slash-command-parsing-baseline/README.md)                                                     | 一个**起点方向**：按产品正文自研统一解析器，借 Codex、omne-next、Claude Code 的部件（提案 D）                                                                                                                                                                                                                                               | 产品负责人，2026-09-23         | 任何契约或判定用例集；Q1–Q9 的技术选择；同日 Q3／Q7／Q8 与三项产品未决的作答（归 PF-002／PF-014／PF-016／PF-004 下一次 rev） |
| [D-037：MCP 客户端的采用](mcp-client-adoption/README.md)                                                                        | **实现路径 + 本版桥接范围 + stdio 落点**：官方 `@modelcontextprotocol/sdk` 上自写薄桥（提案 C），同行封装只借鉴避坑；桥 tools／取消／日志／静态鉴权／两种传输、elicitation（契约就位前不声明）、进度→发帧、OAuth；不桥 resources 条目／prompts／sampling／roots／任务式动作／旧式 SSE；stdio 本版一律据点机拉起，「可换落点」记为将来拓展点 | 产品负责人，2026-09-23         | 任何契约或实现；SDK 精确钉版与能力已核实；OAuth 可开工（三件产品面事项未闭合）；连接与子进程的宿主已定                       |
| [D-058：块 D 与两块运行时的数据形状](message-and-shape-rulings/README.md) | **十九处分岔与三条追加要求**的形状裁决（压缩可见性、完整响应体、账与 select_model 口子；Q1–Q19）；契约里「产品负责人裁定」依据的长期落点 | 产品负责人，2026-09-23 | 任何契约的接受；主线为起草补的推导（记任务区账本，未签字）；G1–G11 任何一项 |
| [D-059：三块能力拆分接受、领域名与装配落点、2026-09-24 裁决汇编](assets-runtimes-split-and-rulings/README.md) | **拆分候选接受**（assets B / tools C / model A·A·A）、领域名 `assets` `tools` `model` `agent-loop`、两块运行时归 `apps/cli`、`tenancy-host` 不改名但记承载张力；同日 U-1～U-6、U-24-1～4、PF-002 D-2/D-3/D-4、PF-007 D-3 逐条原话；契约未接受 |
| [D-060：主线在自驱授权下的自定裁决汇编](mainline-self-rulings-2026-09/README.md) | 2026-09-23 夜～24 主线在产品负责人自驱授权下作出的一百余条裁定**逐字**汇编（账本 §二、§二′ 主线自定行、第二轮修订 R2-1～R2-16、G-24/25），作为契约里「主线裁定，待产品负责人确认」依据的长期落点；**产品负责人尚未逐条追认**，被推翻的项在正文第四节追加登记 | 设计主线（授权：产品负责人，2026-09-23） | 逐条追认；任一条被推翻即由推翻它的决定取代；契约接受（G4） |
| [D-061：接受资产／工具运行时／模型请求运行时一程的 34 份候选契约（草案，待签）](assets-runtimes-contract-acceptance/README.md) | 两轮独立评审收敛后的接受材料：27 份坐标与条款范围、准入核对、保留前提；**未签字，catalog 仍 candidate、不冻结** | 2026-09-25 起草 |
| [D-062：接受资产／工具运行时／模型请求运行时一程的 32 个新立节点与 3 处修订（草案，待签，G5）](assets-runtimes-node-acceptance/README.md) | 五批 architecture-reviewer 独立评审（N1～N5）收口后的节点接受材料：27 处节点的设计为各契约的实现路径、下一程缺口 C-1～C-16 作显式缺口；**以 D-061 先签或同签为前提；未签字，节点仍 candidate** | 2026-09-25 起草 |
| [D-063：2026-09-25 产品负责人裁决汇编（接口契约批、SYS-OPEN、七张卡片）](assets-runtimes-rulings-2026-09-25/README.md) | 替身改接口契约 + 最小提供者；核心能力是公开函数闭包（SYS-OPEN）；D-061／D-062 先抽查再签；G-19 本版不收窄；pi-ai fork 钉 0.86.1@3390bd9 入 monorepo；重试是可配置策略、复用成熟库；⑥⑦⑧⑫⑬ 接受主线建议 | 产品负责人，2026-09-25 |

| [D-064：2026-09-26 收尾裁决与实施授权](assets-runtimes-rulings-2026-09-26/README.md) | hooks 可落宿主机；被取代尝试的迟到账照落；OAuth 重授权接受为已知缺口；session 定名；OpenRouter 少量真实请求授权 | 产品负责人，2026-09-26 | 凭据保管方定义尚未确认；G4／G5／G6 未签；比较门未验证 |

**编号**：`D-` 是[决定的稳定编号](../../registry/README.md)。
D-019 是**迁入时保留的原号**——同一次接受在旧谱系里就是这个号，
接受事实只发生过一次，不为它另分配第二个号。
D-022 至 D-029 是**新分配**的：旧谱系已分配到 D-021，新号从其后继续，避免与尚未迁入的存量决定相撞。
D-031 起归「资产、工具运行时与模型请求运行时一程」：两条并行工作线 2026-09-23 约定各占一段号——治理中心一程从 D-022 起（第二程用到 D-029），资产一程从 D-031 起；
**D-030 是有意留空的段间余量，不回填**。

**接受契约的决定与坐标以各 topic 及 registry 为准。**D-019 与 D-022 各自写明它**不表示**接受任何契约，那是它们当日的范围声明，不因后来的接受改写；
[catalog 里五份 v1 契约的 `acceptance` 指向 D-023，入口契约 v1 与账号能力 v2 指向 D-028，传输绑定 v1 指向 D-029](../../registry/README.md)。
记录旧谱系已发生的接受事实及后续局部取代时，同样写明它**不表示**新 v1 的 catalog、
依赖或实现已经接受；目标资源的精确采用由 [registry](../../registry/README.md) 登记。

存量 topic 尚未从 `design_legacy/decisions/` 整批迁入，
**迁入时逐条恢复编号、取代关系并核对链接**，不整批复制；
那批记录**已随旧设计链退役**，不能被引为现行规则。

本节只导航实际迁入的决定信息包，不形成第二份接受状态清单。

判断方法按需读 `harness-design-handbook` skill 的「设计选择」。
返回 [系统设计链](../../README.md)。

[D-038：公开 health 客户端限定采用](governance-health-client-adoption/README.md)（2026-09-24，主线按本轮实施授权登记）：仅 Node24 HTTPS 的无秘密 health 提供者，消费现有冻结协议；不接受新契约、本地状态或完整CLI。新号顺延D-037，不回填D-030。

[D-039：单机治理中心 SQLite FULL 档位](governance-sqlite-full/README.md)（2026-09-24）：共享提供者可选 normal/full，中心显式 full；部分取代 D-027 的固定参数范围，不接受新领域契约或灾备方案。

[D-040：有限登录与邀约拒绝基础规格](governance-identity-offer-contracts/README.md)：AI v3、OE v2及有限模型，显式事务参与方向；不自动升级旧消费者或宣称生产闭环已完成。

[D-041 有界账号提供者局部实施](bounded-account-provider/README.md)：独立节点架构评审后采用，不开放整装。

[D-042 组织治理参与与拒绝](governance-participation-provider/README.md)：OG2及OE2/OG2局部提供者采用，未开放生产组合。

[D043 注册组合衔接](registration-bounded-provider/README.md)：AR2及局部提供者采用。

[D044 治理入口与新版运输](governance-entry-production-protocol/README.md)：EC2/HT2及局部提供者采用，实际闭环待实现。

[D045 治理协议客户端](governance-protocol-client-adoption/README.md)：EC2/HT2无状态业务消费提供者，CLI状态与交互仍待立契约。

[D046客户端本地记录](client-local-state-adoption/README.md)：CLS1与私有SQLite完整CAS路径，组合/CLI仍待契约。

[D047治理客户端用例](governance-client-operations-adoption/README.md)：CG1固定使用/公开结果/副本与结算，CLI/TUI实际应用仍待交付。

[D048固定动作交互输入](governance-prepared-input-adoption/README.md)：CG2预览与输入生命周期，终端入口仍独立待交付。

[D049治理CLI文件入口](governance-cli-file-entry-adoption/README.md)：CQ1规范接受、文件路径实施，TTY/TUI仍未交付。

[D050治理CLI可搬运归档](governance-cli-portable-adoption/README.md)：现有应用生产依赖闭包与本地独占归档，未安装/上传。

[D051治理TUI入口](governance-tui-entry-adoption/README.md)：CQ2与限定XTerm379/Undo256提供路径接受，实施及跨平台实际验收待完成。

[D052 · 治理中心可搬运归档](governance-host-portable-adoption/README.md)：共同开发工具和host纯构建标识，备份/恢复另行设计。

[D053 · 单机启动修复](governance-startup-repair-adoption/README.md)：私有锁库竞争与bounded迁移的原子幂等，语义契约不变。

[D054 iTerm提供路径](governance-iterm-provider-adoption/README.md)：控制拆分器R2与限定profile采用，实施/GUI验证待完成。

[D055不停服维护](governance-online-maintenance-adoption/README.md)：EC3/HT3与维护提供者接受，批准实施，实际产品维护尚未完成。

[D056维护调用方资源](governance-maintenance-resources-adoption/README.md)：run级外部句柄托管，补D055收场绑定，规范语义不变。

[D057符合性运行器边界](governance-conformance-runner-adoption/README.md)：测试消费者提供Vitest，精化生产依赖闭包，领域契约不变。

[D-065：PR #9 设计正式接受](assets-runtimes-formal-acceptance-2026-09-26/README.md)（2026-09-26）追认有效主线裁定、确认本批产品修订，并签署 D-061（G4）、D-062（G5）和投影 v2（G6）。

[D-066：PR #9 与 draft PR #10 的身份协调](pr9-pr10-coordinate-reconciliation/README.md)：只后移 #9 的编号与精确引用，保护 draft 冻结资源及现行采用；不合并到 main。

[合并前本支 D-067：治理中心Docker部署](governance-docker-deployment-adoption/README.md)：采用Compose固定声明、单一Engine重启与宿主备份timer；设计可实施，产品未实现/未验。

[合并前本支 D-068：内容块实现接缝](content-blocks-seams-adoption/README.md)：限定采用 CB 无损数值校验桥与生产者铸号分工；独立 CB 可实施，pi 及其他消费者门继续保留。

[D-067：格式化件技术采用](core-formatter-adoption/README.md)，用户明确追加两 util 包，主调度在委托内接受技术映射，未接受实现或总体交付。

[D-068：core 实施反推的规格一致性修订](core-implementation-spec-reconciliation/README.md)：沿已接受 N32 补共享形状、两示例与八个 core 的显式采用；修订范围已采纳，精确新版候选待审，未接受／冻结／实现。

[D-075 模型凭据来源投影](model-credential-source-projection/README.md)：目录同单元绑定比较、模型副本 sourceRef/AAD 及受限技术组件采用；完整 CCL/OAuth/MCP 不在采用交付范围。

[D-076 模型请求纵线最终规格和装配投影](model-runtime-delivery-adoption/README.md)：RT3/runner3接受，runtime/transport/runner/验收app采用，真实交付待完成。

[D-077 模型输入源接口补充](model-source-interfaces-adoption/README.md)：完整可信部署项与受限固定根读面采用；原装配来源认回及真实新增面验收待完成。


[D-069：Skill YAML 键解析](skill-yaml-key-resolution/README.md)保留上游现行编号。

[D-070：PR11 整合与历史编号消歧](core11-integration-coordination/README.md)承接本支 Docker R4 与 I-B，退役旧 CB N-A。上面两项“合并前本支”仅导航历史事实；现行 D-067／D-068／D-069 唯一指上游格式化、core 规格协调与 Skill YAML 决定。精确旧提交／路径与新承接范围见 D-070，不改原记录或验收标签。

[D-071：Docker 正常终止请求与真实退出](governance-docker-stop-adoption/README.md)采用R5三处停止绑定，固定Engine条件与unknown结果；最终helper及两架构制品仍待验收。

[D-072：健康探针单进程绑定](governance-docker-health-binding/README.md)接受已有公开main的同进程调用及原期限/资源清理约束；不改变EC3/HT3，不代表新制品已验。

[D-078：模型纵线历史编号消歧](model-main-integration-coordination/README.md)接续施工提交的原 D-070～D-072；上文链接至 model-adaptation-binding-acceptance、model-value-provider-adoption、agent-definition-read-adoption 的同号文字仅导航历史，本次之后无提交限定的 D-070～D-072 指远程现行记录。模型 D-073～D-077 不变；原技术接受及资源字节不改变。

[D-079 原完整fill读面](model-original-fill-adoption/README.md)：MF4/AR4接受，MF4 provider采用；真实新增方法及AR4来源链待验。

[D-080 注册表与历史正文提供者](model-registry-history-provider-adoption/README.md)：AR4 与 EIS history revision 1 技术采用；真实旧表/旧报告成功恢复待实现验收。
