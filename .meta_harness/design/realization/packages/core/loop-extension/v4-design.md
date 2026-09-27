# loop-extension v4 提供者候选

2026-09-27 rev 1；本提供者修订 **candidate，尚未采用、尚未实施**。源码包 `packages/core/loop-extension` 已存在并实现 LC3，本增量不把其原 581 项结果重标为 LC4。[旧 design.md](design.md) 保留已接受范围；以下新增导出路径、源码组织及组件组合均为**候选**。

## 契约与实现路径

消费 [`data.loop-extension/v4`](../../../../spec/data/loop-extension/v4/contract.md) S-1～S-41（LC4），已由 [D-073](../../../../record/decisions/model-current-input-contracts-adoption/decision.md) 技术接受；精确状态以 [catalog](../../../../registry/catalog.json) 为准。MP3/MS4 已接受。产品来源和 rev 沿 LC4：PF-012 rev 15、PF-013 rev 13 等，不另改位置、干预力或拓展件政策。

继续提供 TypeScript 纯值函数、作者协议输入/输出表示、单条结论判定与属性声明推出；复用既有实现中的合法组合表、严格 JSON、无损数及 Schema 技术适配，仅升级有真实差异的版本装配。没有 Cordis 服务、事件派发、LLM 基类或插件；作者看到的“位置”和消息值不成为 Cordis event。Cordis 的项目采用版本仍为 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)），本节点无 Cordis 依赖，因此没有需要新增 basis 绑定的机制主张。

## 公开面与版本绑定

| 候选公开入口                           | 精确采用与职责                                                                                               | 旧消费者处理                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `@omne-harness-lite/loop-extension`    | LC4 类型、42 项 Schema 定义及现有命名的纯值函数；类型中的快照取 MP3、消息/发出记录取 MS4                     | 只有明确采用 LC4 的 runtime3、runner3 等消费者切入；不得用新根入口替原合同作自动升级 |
| `@omne-harness-lite/loop-extension/v3` | 原 LC3 完整纯值面：类型、表、validate/judge 系列、声明/引用推出与正文端口；MP2、MS3 继续显式取对应公共版本面 | AE3/AE4、MR3/MR4 的值/类型消费显式指向此入口，不能转发到根4                          |
| `./schema`                             | LC4 规范原字节、原 `$id`                                                                                     | 与根4配套                                                                            |
| `./schema/v3`                          | LC3 冻结原字节、原 `$id`，独立资源文件                                                                       | 当前该子入口只是根3资源文件的别名；实施前须拆开，不能随根文件替换而变成 LC4          |
| `./schema/v2`                          | 既有 LC2 冻结原件                                                                                            | 保持 LC2 消费图；本批不新增 v2 整套纯函数面                                          |

两个纯面均独立 `import` 即用，保留既有导出名：类型 `ExtensionInput`/`Conclusion`/`ConclusionInputs` 等；`POWER_CONCLUSIONS`、`POSITION_CONCLUSIONS`、`POSITIONS`、`POWERS`；`schemaId`、`SCHEMA_DEF_NAMES`、`validate`；`judgeValue`、`judgeDefinition`、`judgeInput`、`judgeOutput`、`judgeConclusion` 与相应 `is*` 辅助函数；`loopExtensionAttributeDeclarations`、`loopExtensionReferences`、`loopExtensionBodyContract`。`EnvironmentHandle` 仍只表达不透明值，不新增解析入口。

实现可共享语义未变的无状态表与纯值算法；版本叶子分别绑定 Schema、共享数据判定/品牌恢复和类型。它们不是“先试4、失败再试3”的解析器，不在作者 JSON 中增添版本开关，也不剥绑定或补默认使输入跨版本通过。版本由入口和消费者采用关系决定。`./v3` 必须在源码声明及产出声明上都保持 MP2/MS3 类型，不把根4类型重导出后仅换一个 Schema。

## 契约责任到纯组件的投影

本表是拟兑现点，尚无 LC4 实现证据；完整行为仍由相应能力承担。

| LC4 条款                                  | 公开组件与拟实现点                                                                         | 采用/依赖                                | 证据或外部边界                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| S-1～S-10：位置、维度、声明、策略、名字   | 既有类型、表、`judgeDefinition`；拒绝 order/未知成员，name 镜像归正文端口                  | LC4；AM3 CapabilityName                  | LV4-1/4；不选择装配次序或执行策略                                           |
| S-11～S-18：输入与十三种 Subject          | `judgeInput`、按定义的 `judgeValue`、表示恢复；失败主体保留完整 profile/dispatches         | MP3、MS4、CB3、CA2                       | LV4-2/3；跨记录完整性、顺序与真实出处归输入生产者/runner                    |
| S-19～S-29：八种结论、合法表、可改写边界  | `judgeOutput`、`judgeConclusion(value, inputs)`；两表及已有原值对照                        | LC4、MS4、MP3、TD3                       | LV4-4；合法目标集合、再发资格、放行判定和转换资格不是本纯值判断             |
| S-30/S-31：每件必留与三种记录形状         | 只承载单条 Conclusion 的互斥形状、来源镜像、callId/about 配对与拒绝                        | LC4；已有 `ConclusionInputs` 公共形态    | 单条纯判定 LV4-4；“每件必留”、落盘顺序和实际采用的 unavailability 归 runner |
| S-32～S-35：走向、报错/不可用、等待边界   | 无新纯函数模拟批次状态；只保留已经定义的值形状                                             | runner 的操作/提交契约                   | LV4-6 外部义务；本节点不声称兑现控制流程                                    |
| S-36～S-39：42 定义、严格无损、十拒绝有序 | `validate` 只作 Schema；`judgeValue` 加单值谓词；`judgeInput`/`judgeConclusion` 消费该判断 | CB3 技术 JSON/Schema；MS4 单条记录纯判定 | LV4-1/2/3/4；Schema 通过不能代替跨字段纯判断或原始文本严格接收              |
| S-40：属性/引用推出                       | 两个独立推出函数与 `loopExtensionBodyContract`                                             | AM3 公开正文端口                         | LV4-4/5；只读声明，不读租户/时间/配置，不产 reserved 项                     |
| S-41：执行环境句柄                        | 共享不透明词法约束、输入必有形状                                                           | identity-values1 S-31                    | LV4-1/4；句柄铸造、租户绑定、有效期、解析归 runner                          |

## LC4 单条共享记录的校验与失败次序

LC4 的变化落在 `AfterModelCallFailureSubject.profile` 和 `dispatches`：采用 MP3 快照与 MS4 发出记录，原样保留适配绑定及严格无损配置。嵌套发出记录的 Schema 合法之后，还须调用 MS4 已有公共 `judgeModelInvocationRecord`（不是只调 brandRecord 或 Schema）。每条必须是 `model_call_dispatched`；内部绑定相等、模型 ID 对齐等单条约束由这个唯一提供者判断，不在 LC 再抄一份绑定比较。

本节点把共享单条判定失败映射为 LC4 S-37 第1行 `malformed`，在位置/干预力/维度等后续拒绝之前完成，不新增第十一个拒绝。读取范围是 `$defs` 定义的失败主体槽位：独立 failure subject、Subject、ExtensionInput 等实际承载路径及相应嵌套值；不能递归搜索用户 JSON 中所有名叫 `dispatches`/`profile` 的键。工具参数、适配配置和消息不透明成员中的同名键保持普通 JSON。

`validate` 及既有只判形状的 `isExtensionInput`/`isExtensionOutput`/`isConclusion` 仍不能充当正式受理。`judgeValue` 判断该定义能独立确定的条件，`judgeInput` 交出已完成本纯值层判断的输入，`judgeConclusion` 必需带本次实际 `ConclusionInputs` 才能对照不可改字段和本件名字。不得在表示恢复时重新用较弱品牌函数绕过刚做的单条判断。

继承原拒绝顺序和辅助 API 前提：可先确定的领域拒绝先返回；辅助输入缺失/不合法或配对不符是已有 `TypeError`，不是新表示拒绝、runner veto 或一次已落结论。`inject` 的非 extension 来源按既有第10行处理，不能因为换用 MS4 通用校验而提前把禁止来源分支的私有字段判为第1行；允许 extension 分支的实际形状仍须校验。失败位置的 `rewrite` 仍非法，不能因新快照有配置字段就放开改写。

本包**不检查整批调用历史**：失败主体顶层快照是否与每条记录都来自同一实际调用、dispatches 是否完整/有序/含本次、此前记录与真实 durable 日志一致，以及目录换版后重试件是否仍看到旧绑定，归 runtime 输入生产者与 runner 交接。纯层会拒绝每一条内部畸形记录，但不能从两份值相等证明真实出处；单条均合法的混批/乱序输入应由 runner 的整批核对拒绝，不在本包创造新的批次 API。

## 严格 JSON、Schema 图与精确依赖

文本接收方先用 CB3 `readJsonStrict` 再调用纯判定；任意深度重复键拒绝，不可用普通 JSON.parse 丢键/舍入后补称合规。共享 `JsonValue`/`JsonNumber`、无损复制/写入和现有 exact Schema runtime 继续复用；`configuration.values` 中大整数、小数、boolean 和数组类型不变，不经 Number 比较、不规范化原值以求相等。已解析对象不能证明其解析前没有信息丢失，这一前提须在真实入口验证。

| 精确依赖                                             | 根 LC4 使用                                                                                | 保留 LC3 使用                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| identity-values/v1；offer-expiry/v1                  | 公共词法/身份和 `./schema`、时间 `./schema/v1`                                             | 同一已接受版本                                             |
| content-blocks/v3                                    | 公共类型、严格 JSON、`./schema-runtime` 及 Schema；传递旧引用所需 CB2 取公开 `./schema/v2` | 原 CB3/CB2 资源闭包                                        |
| asset-model/v3；tool-definition/v3；call-accounts/v2 | 公共类型/正文端口和各自精确 Schema                                                         | 原精确版本不变                                             |
| model-profile/v3；messages/v4                        | 当前公共根与 Schema；MS4 的单条记录判定                                                    | MP2 的 `./v2`、`./schema/v2`；MS3 的 `./v3`、`./schema/v3` |
| 本节点 Schema                                        | LC4 自身 `$id`                                                                             | LC3 自身 `$id`，LC2 仍原样发布供既有 Schema 消费           |

只从包公开入口装配固定资源图，不从依赖包 src/schema 私有目录取文件、不网络加载 `$ref`、不将旧 `$id` 绑定新内容。对两版本的全部42个 `$defs` 编译与独立制品消费核闭包；同一编译图中需要并存旧引用时逐 `$id` 放入准确版本，缺资源直接暴露为制品/初始化缺陷，不能补空 Schema 或回退某个“最新”资源。调用方数据不控制编译资源集合，编译不按任意作者输入建立全局缓存。

## 消费者采用与旧证据

| 实际/计划消费者                                                       | 本批候选采用投影                                                                                                                     | 验证 owner                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| core/asset-evaluation 的 AE3 和 AE4；其 `defaultBodyContracts` 组合根 | 显式从 LC `/v3` 取 `loopExtensionBodyContract`，不因本包根4改变而换正文 Schema 身份；其他 `BodyContracts` 端口不由本节点改           | AE owner；LV4-5                                |
| core/model-response 的 MR3/MR4                                        | `FailureCause` 等明确从 `/v3` 取，Schema 已使用 `/schema/v3`，继续准确保持 LC3                                                       | MR owner；LV4-5                                |
| core/arrival-events 的 AEvt2                                          | Schema 保持 `/schema/v2`；仅共享 `FailureCause` 类型显式取 `/v3` 并逐项核对 LC2 的八值完全相同，不接受整个 LC3/4，也不新增 v2 函数面 | ArrivalEvents owner；LV4-5，同形枚举变化即失败 |
| runtime3、runner3                                                     | 依各自已登记的 LC4 采用关系消费根4，真实生成、接收、持久回读与默认重试件使用完整失败输入                                             | runtime/runner owner；LV4-6                    |
| 仍钉 LC2 的其他能力                                                   | 保持其精确采用；仅存在新版公共根不构成消费者升级                                                                                     | 对应 owner，未建源码的部分继续显式缺口         |

跨包 import 修改属于各消费者实施者，本任务不改它们；切根4前必须与 `/v3` 出口和对应消费修改作为同一构建增量交付。旧测试继续以 LC3 精确入口执行；旧绑定 `data.loop-extension/v3#S-37` 及原始运行保留原输入范围，新入口测试不能顶替它。若测试文件组织变化，证据 owner 更新实际可运行位置，但不得把旧运行改标签或借此宣称新版通过。

## 状态、资源与装卸

无领域状态、提交点、存储要求、时钟、凭据或业务配置；无异步工作、监听、注册贡献或网络。装载/撤除资源各 **0 项**，无空插件/effect。固定 Schema 编译值由所选模块版本持有，调用者持有输入与结果；函数不修改输入，模块替换不回滚既有记录，也不安排迁移或重放。

表示拒绝按十值有序返回，辅助调用前提错误沿既有 TypeError，固定制品资源缺失/非法则明确初始化失败；不以日志代替返回。无可配置业务政策，本节点不能通过默认参数抹掉缺适配绑定。消费者拥有运行/租户关联和诊断输出，按 [SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md) 控制内容；本纯模块不自行记录消息正文、工具参数、配置或推理文本。

## 关键取舍

| 候选选择                                           | 落选方的最强论证                                       | 本方弱点及复查条件                                                                                           | 置信度 |
| -------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ |
| 根4＋完整 `/v3`，共用无状态算法而分别装配版本依赖  | 同一入口自动接受两版最易调用；全部 fork 两套代码易隔离 | 本方需验证两个资源图、声明和消费者采用；自动试版会掩盖缺字段，双份算法易漂移。任一版本变化必须以独立断言核对 | 高     |
| MS4 公共单条判定复用，不复制绑定比较               | 本地实现能少一次函数/复制调用、可能更快                | 多一次边界调用需测实际开销，但只有 MS4 拥有单条语义，未经测量不优化掉判断                                    | 高     |
| 保持纯值层，批次完整性与真实出处留 runner          | 在 core 增整批校验可让更多调用者复用同一检查           | 本方必须在 runner 集成证据补齐整批责任，不能把纯层成功当已准入；现 LC4 没有批次操作或提交责任                | 高     |
| LC2 FailureCause 只复用 `/v3` 的同形类型并对齐八值 | 为 LC2 再开完整 `/v2` 面可保持版本名完全同形           | 本方需要类型/Schema 精确枚举对照；只支持既有狭窄复用，不能把其它 LC2 值交给 v3 judge                         | 中高   |

## 缺口与消费者影响

- **LC4-G1（S-1～S-41 本节点纯值部分）**：LC4 契约已接受，但本提供者修订未独立评审/采用；现源码仍 LC3。owner 主线/架构评审/实施者；阻断把新根当作可用提供者。
- **LC4-G2（S-14、S-36、S-37）**：MS4 单条边界调用、双版本资源/类型、42定义闭包与无损往返尚未实现验证；owner 本节点实施者。阻断 runner/runtime 正式接收 LC4 失败输入。
- **LC4-G3（S-40 及各消费者采用）**：根4切换所需的 `/v3` 消费改动和 LC2 八值对齐尚未执行；owner AE/MR/ArrivalEvents 与本节点实施者。既有消费者不自动升级，先闭合 LV4-5 才能切根。
- **LC4-G4（S-14、S-30～S-35、S-41）**：真实批次、日志、派发、句柄、重放和默认重试交接属 runtime/runner，LV4-6 未取得证据。本节点只能点名责任，不能把纯值测试填作其符合性。

LC4 原 G-15（压缩保护结论）、G-16（inject 消息标识交接）、G-18（作者自定义配置）仍归原 owner；本节点不给缺口填默认政策。
