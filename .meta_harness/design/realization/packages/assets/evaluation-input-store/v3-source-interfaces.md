# evaluation-input-store：部署清单与固定根读取补充

2026-09-27，revision 1，**candidate，未接受，新增面尚未实现/验证**。本稿补充提供者技术接口，不改已采用 [design.md](design.md)，不修改领域契约、服务身份或五张源表的所有权。文件名中的 v3 指本次模型请求纵线的消费者版本，不表示新立 EIS 领域契约。

## 输入与已核实现

采用基线是 D-074 的 EIS design SHA-256 `01e0d2a1ff4fbdaab11321a1126bec8e0e3c01d91a18e8c1f6e3cd162a134bd4`、registry3 design `30b4be1f04cc13a8ed98294f422109e98dbbd4df24889d08a6edb20082a81438`；两份实际字节已核相同。精确契约为 AM3 `data.asset-model/v3` S-18/S-20、AE4 `capability.asset-evaluation/v4` S-6/S-7/C16/S-15/PRE-1/PRE-3/PRE-9、AD1 S-1～S-10、AR3 `capability.asset-registry/v3` S-16/S-22～S-24/S-31/S-48/S-50、manifest3 S-6/S-16/S-18/S-32/S-33，以及 runtime3 S-66；接受状态以 [catalog](../../../../registry/catalog.json) 与相应决定为准，本稿不重开这些语义。

已核源码公开面：

- `packages/assets/evaluation-input-store` 已有施工源码，`InputSourceDependencies.deployedOfficial` 当前为 `readonly CapabilityId[]`，`./publication` 的发布校验只能核出厂集合覆盖，缺少可信 meta 对照；本稿不以源码存在宣称已完成真实 IO 验收。
- 同包公开根只有 S-66 `createEvaluationInputReader`，没有 registry 固定根读面。当前 `inputFromSnapshot` 在 tx 内执行选根/正文判定/evaluate；已采用设计要求事务后纯阶段，实施者须继续修正，不把现状升格为保证。
- `@omne-harness-lite/asset-evaluation` 根公开 `evaluate`、`selectEvaluationRootSource`、`defaultBodyContracts`、`EvaluationRootSource`、`EvaluationResult`、`NonConnectorEvaluationInput`；`evaluate` 不接第二套 BodyContracts 参数，实际采用闭包已由其制品绑定。`InputDiagnostic.condition` 是公开 C1～C16 枚举；C16 拒绝来自实际 `computeEvaluation` 的选根结果，不从诊断字符串猜测。
- `@omne-harness-lite/agent-definition` 的公开提取函数、asset-model 公开 judge 和 CB 严格无损 JSON、`ExactDecimal` 精确比较均继续复用。`packages/tools/asset-registry` 尚未建包，原根来源认回接线仍是明确缺口。

## 两个接口的责任投影

| 编号／契约责任                              | 候选技术面                                                | 兑现点／边界                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| SI-1：AM3 S-20；AE4 PRE-2                   | `InputSourceDependencies.deployedOfficial` 采用完整部署项 | 可信部署方提供 capability/meta；发布者不能自行声明 meta 或以名字猜 meta；出厂锁双向相等                           |
| SI-2：AR3 S-23④、S-24②；AE4 PRE-9           | `./registry-inputs` 的 `createRegistryInputReader`        | 原根来源由 registry/装配先核实；EIS 从真实固定 asset/version 读取原正文，与当前同快照事实组合，不走 S-66 自动选根 |
| SI-3：AR3 S-16/S-23⑥/S-24⑥⑧/S-50.5；AE4 C16 | 新读面的闭合结果，保留实际 evaluate 的 C16 拒绝与来源事实 | 仅确认根失配映射依赖 unavailable；请求错误、其他求值失败和程序缺陷分别交接                                        |
| SI-4：OG2 S-26/S-63；AE4 PRE-1/PRE-3        | 既有真实 membership 参与面＋EIS 同库快照                  | 当前资格每次核，reload/refresh 的 standing 配方不混；参加异常交外层 unit 终结后映射                               |
| SI-5：runtime3 S-66、SYS-OBSERVABILITY      | 现有 S-66 保留；新技术闭包独立准入/close                  | 共用读取/纯构件，分清用途；不新增 Cordis 服务或让 runtime 获得历史根读权                                          |

## SI-1：可信完整部署项

候选公开配置类型 `DeployedOfficialEntry` 是普通结构值 `{ capability: CapabilityId, meta: boolean }`，`deployedOfficial` 改为这些项的只读序列。`CapabilityId` 直接引用 AM3 的公开定义，不添新能力身份、category 或 meta 能力类型。每项两个成员必需；缺 meta、非布尔、重复 capability、非法身份均为构造/静态配置错误，启动失败；没有从 `CapabilityId[]` 自动补 `meta:false` 的兼容路径。

该清单由可信装配按实际部署的官方件提供，构造时校验并严格无损复制到当前源实例；外部变异不改变实例所持配置。序列用于输送集合，判重和匹配按能力标识相等，不以输入顺序决定语义。换部署清单需显式重建实例/更新部署输入并重新校验发布状态；不能从发布请求、待写持有、命名空间或资产正文反推 meta。

发布在既有 `evaluation_input_head(store_key)` 哨兵/行与目标表同一 atomic 中，先组成**本次提交后完整 factory 集合**：本批替换 factory 时取本批，否则取同事务已存 factory；缺行不能补空。逐项验证：

1. factory 能力集合恰等于可信部署集合，无漏项、额外项、重复；每份持有指向实际 official 定义且能力对应。
2. `basis.kind = official`、`assignments = []` 仍沿 AM3 校验；`holding.immutable === deployedEntry.meta` 必须逐项成立，既拒 meta 未锁，也拒非 meta 被锁。
3. 本批未带 factory 时也重核已存 factory，不能借只更新别层绕过新部署清单。请求不能附一份替代的 meta 权威。
4. 发布内容与可信清单任一不符为既有 `PublicationResult.failure = invalidInput`，整批不写资产/版本/层/head；预期修订冲突仍为 conflict，真实 IO 不可用或已存字节损坏仍沿原分类 unavailable，程序缺陷不吞。不能把读库故障归成调用者输入错误。不存在“自动修锁后成功”。

`evaluation_input_head.factory_manifest` 的存储投影由裸能力列表变为完整部署项列表；与 head 修订及发布数据同次提交，不增加旁表。读时对实际部署完整项、已存完整项及 factory 实际持有重新核一致，缺少 meta 的旧数据不能被解释为全部 false。尚未发布到生产的施工数据可由验收建立新库；已有旧格式库必须由存储/装配 owner 显式决定重发布或迁移后才准入，本稿不从旧持有锁位反填 meta、不承诺静默迁移。不匹配的读取为 unavailable，不回退旧清单。

## SI-2：registry 固定根读取的公开窄面

候选公开子入口为 `@omne-harness-lite/evaluation-input-store/registry-inputs`，导出 `createRegistryInputReader(deps)` 及所属请求/结果类型，返回 `{ read, close }`。不加入 `currentEvaluationInputs` 服务，不给 runtime `read` 增可切换用途的参数；两闭包复用私有快照读取、所有权核对、无损复制和纯构件。

候选 `read(request)` 的必需项：

| 成员                | 类型与来源                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`、`tenant` | 既有 SessionRef/TenantId；真实会话及租户。EIS 仍核 tenancy、recipe 同租户及当前成员资格；传参不是授权                                                                                                       |
| `purpose`           | 闭合集合 `reload` 或 `refresh_availability`，没有默认。后者覆盖 start/continue 的第一次输入，两次不改变根配方；本面不接 MCP 动作集                                                                          |
| `rootSource`        | AE4 公共 `EvaluationRootSource` 的 `{asset, version}`，不复制其类型；资产号合法，version 沿 AM3 正整数与精确 JsonNumber。来源由下述调用方前置核实，不接 body、references、attributes 或预造 EvaluationInput |

`root.definition` 从该会话实际 recipe 的根能力读出，固定资产记录必须具有同一 capability，正文为已发布 `agent_definition` 且版本精确存在。EIS 不以参数自行取得读取任意资产的资格；技术面只交给有此会话装配来源的可信 registry 调用者及验收装配，不公开给任意租户/模型/工具。

### 原根字段究竟从哪里来

AR3 S-22②/④ 与 S-48 的真实 fill 求值和对应提交记录是依据。registry/装配在已核本次完整装配的记录上，从 `content.evaluation.root` 及 `content.evaluation.assets` 中该能力的唯一生效项取得 asset/version，核同会话记录壳和原 fill 所用来源一致；这里只恢复**固定来源指认**，其 body/references/attributes 必须由 EIS 再读真实不可变正文，不能从 E.values 反推。`filledBy=assembly`、given 与其 evaluationRef/表时刻用于认回该装配的依据，不能把输入里任填的 ref 当证明。

manifest3 S-6 壳没有根字段；S-33 `readEvaluation` 取最近 given/mint，不保证它就是本次所指原 fill；S-18 `readHistory` 需要已知 category/filledAt。EIS 的 `source_at_creation` 也只说明创建，不覆盖后来完整 fill。**本稿不发明一个“最近 E 就是原根”的恢复算法。** registry owner 必须在其实现/采用中说明怎样保留或从已有公开读面认回本次固定装配的来源及必要定位值，含重启与重新 fill；不能新增 content 第四槽、解析 EvaluationRef、访问 manifest 私有表或在 EIS 加装配来源表。

**停止点 SI-G1**：缺少上述可核实出处、源记录不属于会话、原根项缺失/不唯一、不能确定当前应消费哪次完整装配时，registry 不调用本读面，按其不可用分支收场。不得填创建时 source 或当前选中根。EIS 可以在 caller 明确满足该前提的情况下实现窄闭包，但整条重启/重新装配验收须等 registry owner 关闭 SI-G1。

### 同事务读取，事务外纯阶段

读取顺序沿既有设计：表示层校验→本实例准入→真实 holdingTenant→一个 AtomicStorage 单元读当前 OG standing、recipe/head、全部本机当前持有/配值/对应已发布版本，另从同库读 `rootSource` 指定的完整不可变版本正文。原根已不被持有时仍必须读取它以验证固定配方，但不制造一份旧持有；如定义集合无需包含它，固定正文只作为独立已读来源，不把额外未持有定义随意交入 AE。原根 capability/版本/正文来源无法核对即 unavailable。所有源读取完成后无损复制到本次自有快照，退出 atomic 实际提交/回滚边界后再进入纯阶段。

当前资格与调用许可仍必须成立。`purpose=reload` 的求值 standing 使用本次真实当前有效成员角色，沿 AR3 S-20/S-23 的此刻求值；`refresh_availability` 沿 S-24② 使用会话创建捕获的有效 standing/角色，当前资格另外作门。两者都不能用捕获 effective 豁免当前核权，不能给无权调用者交输入。没有真实来源的 shared/workspace/MCP 分支仍 unavailable；本稿只接续明确未挂载 workspace、无本次动作集的已采用本机路径，不补刷新工作区或钉住动作集协议。

纯阶段复用 AD1 `extractAgentDefinitionInputs` 读取刚才固定版本正文，构造 root 的 definition/references/attributes/source；current/pinned、持有、版本序列、会话配值原样保留。再对同一自有快照调用 AE4 公开 `selectEvaluationRootSource` 和完整 `evaluate`；selector 仅用于实际当前根来源及 C16 因果核对，**其结果从不替换固定 rootSource 或原正文**。根当前 missing 不等于根失配：AE4 C16 对无生效根不拒绝，正常 evaluate 的 unresolved 结果继续交 registry 的原处理。body provider、selector、evaluate 的固定版本闭包与 S-66 相同，不新增 body registry、Schema、selector 或 evaluate 副本。

## SI-3：闭合结果及 C16 交接

候选 `RegistryInputResult` 为以下互斥分支；这些是公开技术组件结果，**不是 AR3 或 runtime3 的新领域失败值**：

| 分支                                                                            | 产生条件                                                                                                                                                                                                                             | registry 的消费                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{ input: NonConnectorEvaluationInput }`                                        | 来源完整、正文真实、共享 evaluate 返回 ok/compositionCycle/categoryUnsupported；该分支只表示输入已组好，不承诺求值成功                                                                                                               | 对这份不变输入调用同一公开 evaluate；ok 后继续原流程，compositionCycle/categoryUnsupported 沿 S-23/S-24 原样转交。不得把后两种先吞成 unavailable |
| `{ failure: "rootSourceMismatch", input, selected, rejection, sourceRevision }` | `selected` 直接为公共 selector 的 ok 来源，和固定 rootSource 按 asset＋精确版本确实不等；同份 input 的实际 evaluate 返回 invalidInput，且公开 diagnostics 含 condition=C16。rejection 精确引用 EvaluationResult 的 invalidInput 分支 | 仅此具名已确认原因按 AR3 S-16/S-23⑥⑧/S-24⑥⑧ 映射 unavailable：不换六表、不追加、不交报告。保留原 input 与实际原因用于受限验收，不写正文诊断      |
| `{ failure: "invalidInput" }`                                                   | 请求本身缺项/非法 session、tenant、purpose 或 rootSource 表示；尚未 IO                                                                                                                                                               | 这不是 C16；按调用者参数错误/内部调用缺陷处理，不能统统改成依赖 unavailable，且不伪造 evaluate 曾执行                                            |
| `{ failure: "unavailable", stage }`                                             | 可识别的依赖/源缺失、当前资格不成立、原正文不可读、不支持来源、已停止等                                                                                                                                                              | 保留阶段后沿 AR3 对依赖不可用的既有收场，不假空源/空报告                                                                                         |

`selected` 使用 AE4 `EvaluationRootSource`，`rejection` 使用其公开 `EvaluationResult` 分支，`sourceRevision` 为本次实际 head 修订；不复制新的 C16 枚举或错误 Schema。`stage` 候选闭合集合为 `stopped | session_tenancy | current_membership | recipe | source | fixed_body | body_provider | evaluation_input | unsupported_source | storage`，不得任意塞入正文/异常字符串。

请求 invalidInput 与合法请求读到无效源分开：已知源校验不合格、AE4 非 C16 的输入不成立归 unavailable 的对应阶段；不能以此掩盖 EIS 组装丢字段等程序缺陷。无法解释为上述已声明源问题的实现异常、StorageDefect、无关 TypeError 继续抛出。只有实际 C16＋同快照公共 selector 的不等结果才产生 rootSourceMismatch；仅匹配 failure 名称或 message 字符串不成立。两个公共构件在同输入上相互矛盾属于实现缺陷，不能编造原因对象。

参与面异常必须逃到外层 atomic 的唯一终结边界，真实回滚/排空结束后再映射 StorageUnavailable；close 等待此路径及随后纯阶段全部完成。根失配是事务结束后的纯结果，不触发写入、自动重读或重试。正常成功路径维持 EIS 纯准入＋registry 消费时纯求值两次，代价明列；不得用伪造“已验证输入”标记跳过后者。

## 存储、作用域、生命周期与观测

本稿无新业务表、无新 Cordis 服务、无后台任务。继续使用同一 SQLite AtomicStorage/BEGIN IMMEDIATE 和 EIS 五张表；OG 当前资格经公开 participate 加入共同单元，资格撤销与 EIS 发布写者在同一库的真实事务边界排序。旧/新 EIS 发布者共同触碰 `evaluation_input_head(store_key)` 及目标表，不以实例内锁或时间戳排序。固定版本、当前定义/持有、recipe/head 在同一快照读出；和 manifest 原装配的认回之间**没有新增同提交保证**，其归属和版本前置由 registry owner 保证，不能跨两个独立读取冒称原子装配。

实例取得可信部署清单副本和借用 storage/memberships/sessionTenancy；构造成功才可交付闭包。配置失败不发布，部分构造失败释放本次资源，不删除持久行。每次调用拥有其 Promise、自有快照和纯阶段；本闭包 close 关闭新准入并 await 全部在途，已进入事务跑完各自实际结果，取消等待不等于事务结束。EIS 不关闭借用 storage/治理服务；应用等全部 reader/publication 结束后才关闭它们。重开必须重核完整部署项，不用旧闭包的配置解释新实例数据。

静态边界：`./registry-inputs` 只由 registry 实现及 `apps/model-request-acceptance` 的可信装配/场景消费，框架直接采用者须明确承担相同来源前置；产品 runtime、模型 adapter、工具不得从服务键或转导出获取它。施工检查要含违规 import/转导出/别名路径负控；同进程可信代码边界不宣称 OS 沙箱。EIS 不 import registry/manifest 的私有实现，避免反向依赖与表布局复制。

诊断记录用途、session/tenant、实际 publication revision、固定/所选 asset/version、公开失败类别、阶段与实际事务结束；不录 body、references、attributes、配值或秘密。实际事务申请→取得 SQL 锁的排队、取得锁→提交/回滚的持锁时间分别量测；不能把进入一个任意 JS 回调当已取得数据库锁。事务结束后单独测固定正文提取、selector、EIS evaluate、registry evaluate 的次数/耗时，附持有/资产/版本数与正文总字节数，不写臆测阈值。观测故障沿原独立降级端口，不改业务结果或吞掉异常。

## 取舍与停止点

| 关键选择                                             | 落选方最强论证                         | 本方弱点／复核信号                              | 置信度                                      |
| ---------------------------------------------------- | -------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| 完整 capability/meta 来自可信部署                    | 从持有 immutable 推 meta 可免改配置    | 配置与已存 head 需显式迁移/重发布；缺信息就拒绝 | 高：AM3 S-20 是 iff，原裸列表无法判断       |
| 独立受限 fixed-root 读闭包，共享底层构件             | S-66 加开关接线更少；复制 reader 更快  | 多一个技术导出及调用约束，但不增加服务          | 高：两种根选择和 standing 用途确有不同      |
| 公共 selector＋实际 evaluate 双证据确认 C16          | 只看 invalidInput 或差异字符串最省计算 | 多一次纯选择，正常仍有二次 evaluate，必须量测   | 高：防止把调用者错误/其他错误误记依赖根漂移 |
| 原装配来源由 registry owner 核实，EIS 只真读指定正文 | EIS 再存一份固定根表便于恢复           | SI-G1 未闭合前整个重启消费仍阻断                | 高：不复制 manifest/会话装配权威            |

- **SI-G1：原装配来源的定位与恢复**。AR3 S-23/S-24/S-31/S-48；owner registry/manifest 消费者及主线。本稿只给字段依据和读者前置，重启/重新 fill 的公共认回接线尚缺，不由 source_at_creation、最近 E 或临时内存填空。
- **SI-G2：部署格式接续**。AM3 S-20；owner EIS/装配/storage。裸旧 manifest 不含 meta，不可推断；采用前明确旧库拒绝、重发布或显式迁移的适用环境和证据。
- **SI-G3：完整 registry 来源**。AR3 S-23④/S-24②；owner workspace/MCP/相应提供者。当前只接续明确无 workspace/动作集的本机范围，不通过新用途参数伪造完整支持。
- **SI-G4：新面采用和实际验证**。owner 主线及实施者。本稿与 verification 新增 SI-V 系列待独立审查；0 新 bindings，已有 design 字节不变。任何一项成稿不代表相关源码已实现或整条读取已验收。
