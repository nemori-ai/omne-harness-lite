# asset-evaluation v4 实现增量候选

本稿只投影 `capability.asset-evaluation/v4`；语义与实现路径均未接受。已接受 v3 的实现与证据由 [原设计](design.md)及 [README](README.md) 保留，不能用本稿替换其冻结依据。

## 实现路径与来源

节点仍为 `packages/core/asset-evaluation`，是被资产治理、注册表和装配共同消费的纯计算包。现有 v3 源码已存在；v4 增量尚未实施。复用既有四步求值、设置计算、权限构件、清单读取及无损值工具，只增加组合根声明和来源校验。无新 Cordis 插件、服务、数据库或正文读取端口。

输入坐标已在 [catalog](../../../../registry/catalog.json) 登记：`capability.asset-evaluation/v4`、`data.agent-definition/v1`、`data.model-profile/v3` 为 candidate，`data.asset-model/v3` 为 accepted。共同 baseline 为 `omne-harness-lite-design-2026-09-15`。范围来自 PF-002 rev 20、PF-004 rev 12、PF-013 rev 13，以及已提交求值读取链候选。本稿不接受完整 Agent Definition、sub-agent、Connector 或 Agent Loop。

系统 Cordis 采用 D-025 的 4.0.4；本包不导入或调用 Cordis，不依赖其生命周期、事件或注入语义，因此没有新增 basis 绑定或待核对上游 API。装配采用什么存储不影响本纯值接口。本包没有启动配置、密钥或时限初值；输入错误统一沿契约返回具名失败，不转成启动失败或运行期重试。

## 契约责任到兑现点

除明确新增的结果值判定构件外，以下公开操作名是现有 v3 的名字，**其 v4 签名、导出路径和内部步骤均为候选**；表中不是已实现声明。两个操作的九项边界仍以 [v4 契约](../../../../spec/capabilities/asset-evaluation/v4/contract.md)为唯一来源。

| 契约责任 | 插件、服务或公开操作 | 实现与精确采用 | 符合性依据或缺口 |
|---|---|---|---|
| AE4 S-6、S-7 C15/C16、S-45：根声明与来源 | 候选 `evaluate(input)` 的入口核对与第 1 步中间结果 | 扩展 `CompositionRoot` 为显式 `definition/references/attributes/source`；`source.asset/version` 沿 AM3 身份与无损版本值；声明规则复用 AD1 | AE4-1；C16 只比对选中的资产和版本，不证明正文真实性 |
| AE4 S-6/S-7 的第 1 步前提、S-17～S-19/S-39：先定根的真实来源 | 新增候选 `selectEvaluationRootSource(input)` 公开纯组件 | 从现有 `computeEvaluation` 抽出同一选择计算；输入不需要 root.references/attributes/source；只将所选根 asset/version 投影给正文输入生产者 | AE4-8；不得在 input store 复制禁用/usableBy/锁/版本算法；完整 evaluate 仍最后核 C15/C16 |
| AE4 S-7 C1～C16、S-13、S-15：整体失败与次序 | 候选 `evaluate` 的同一返回联合 | 继承 `invalidInput → compositionCycle → categoryUnsupported`；C16 所需的纯选择结果不先暴露成成功；诊断条件增加 C15/C16，不增失败分支 | AE4-2；需叠加坏声明、来源失配、环和不支持类别验证次序 |
| AE4 S-20、S-21、S-45：根不入组合而声明进入投影 | 候选现有投影步骤的根分支 | 组合只沿 `root.references`；生效根的显式声明独立纳入属性计算，不添加自引用或把根塞入 `composition` | AE4-3；根不可见仍 unresolved，声明/source 不能补资产 |
| AE4 S-22、S-24、S-45：根设置沿同一层序与锁计算 | 候选现有设置计算构件 | 根声明复用同一设置计算函数；只取同一生效资产上的配值，保留 `value/from/lockedAt?` 语义；不另造根专用锁算法 | AE4-3；换资产后旧设置与锁不跟随；空声明不补项 |
| AE4 S-11、S-15 ⑦、S-30：纯值与完整输入重放 | 候选根导出的类型、`evaluate`、`evaluationInputFingerprint` | 复用 content-blocks/v3 无损值复制和写入；完整指纹包含 `root.attributes`、`root.source` 及其他原输入；无外部读取 | AE4-4；同一来源号不能掩盖声明不同，不能只以 tenant/root/source 作键 |
| AE4 S-16、S-27、S-28：承载清单读入 | 候选 v4 `readWorkspaceCarrier`，实现复用原纯函数 | 仍接已解析清单；不读文件、不补时间、不取得凭据；返回与 dropped 规则不变 | AE4-5；保留旧规范场景并在新制品回归 |
| AE4 S-23、S-42：权限构件与原组合行为 | 候选 `classifyPermissionAssignment`、`boundOf`、`pickWithinBound` 及 `defaultBodyContracts` | 权限构件仍与第 4 步共用；默认正文组合保留现有 NonConnector 范围及精确旧版依赖，不因根窄规则开放任意 sub-agent 正文 | AE4-5；现有 v3 证据只能覆盖原输入，不直接绑定 AE4 |
| AE4 S-29/PRE-9、S-46/G-22：真实来源、历史读取与当前求值 | 本包无 IO 操作；交给外部 owner | 真实正文读取者取得所选不可变正文；注册表提交求值供清单历史读面；runtime 经其 S-66 当前输入端口重新调用纯 evaluate 并检查必需时限 | AE4-6；各 owner 的真实组合尚待，历史结果不能替代当前输入，fixture 不关闭该行 |
| AE4 S-8/S-47：持久结果的完整值结构；manifest3 S-32 的消费需要 | 新增候选 `judgeEffectiveAssembly(value: unknown): boolean` | 默认 v4 公开纯值构件，完整检查结果对象及 S-47 明列的结果内关系；manifest 复用同一实现并负责映射其 unavailable | AE4-7；S-47 已表达拒绝边界，公开构件与真实消费未实施；不重新求值或确认来源/同次快照 |

表内 AE4 指 `capability.asset-evaluation/v4`，AM3 指 `data.asset-model/v3`，AD1 指 `data.agent-definition/v1`；缩写只用于本表，不另立规格身份。

## 公开函数、类型与 Schema 闭包

候选默认包入口采用 v4：导出两个操作及其完整输入、结果与诊断类型，保留权限纯函数、整输入指纹与现有正文组合入口；另外公开根来源选择与结果值判定两个纯构件及各自类型，它们不增加规范操作。`root.attributes` 使用 AM3 的同一 `AttributeDeclaration`；`source.version` 复用 AM3 的精确正整数表示，不能转为有损 `number` 再比较。`EffectiveAssembly` 不另加根值旁路：根设置仍在契约已有的 `values` 中，根身份仍在 `root` 中，来源资产/版本可在 `assets` 核对。

本能力没有自有 Schema，也不新建 `./schema` 或空 Schema。值校验使用 AD1、AM3、tool-definition/v3 的 Duration、model-profile/v3 的 RouteName 与它们登记的传递 Schema 资源。Schema `$id/$ref` 使用精确版本，离线解析；不得把输入中的 Schema 当成可任意下载或执行的规则。三个根项的规范域和默认约束只有 AD1 一份权威实现，本包复用其公开纯值判定构件，具体导出签名需与 agent-definition 节点对齐（AE4-1）。

候选 `./v3` 显式公开未切换消费者需要的原 v3 操作、类型、指纹与正文组合闭包。它保留原 `{ definition, references }` 输入及根不投影属性的行为，不能转发给要求 attributes/source 的 v4 入口，也不能自动给旧输入补这两个字段。共享内部设置或权限计算须保留两版行为边界；发布包的导出、声明、运行文件和精确数据资源一起验证。消费者是否切换由其采用坐标决定，推荐版本不自动改写消费者。

**无损边界**：纯值输入来自满足 content-blocks/v3 S-24 的接收边界；本包防御性复制、核对后计算，不修改调用方对象。已解析对象不能倒推出原始重复键，因此文本读取者负责在解析时拒绝重复成员。非 JSON 值必须拒绝，超大整数、精确十进制和不透明正文的合法值不得因复制或缓存指纹被舍入；合法 Duration 原文不改写、不钳制到 JS 定时器范围。计时器可调度性由 runtime 承担。

### 正文读取前的根来源选择

候选公开组件 `selectEvaluationRootSource(input)` 让真实输入生产者先选出根的实际资产/版本，再按 AD1 读取其不可变正文。它投影既有第 1 步，不新增规范操作、版本政策或 IO。不能通过先伪造空 `root.attributes`、假 `root.source`、假引用或临时 pinned 持有来调用完整 evaluate；也不能由 input store 重写一份禁用、usableBy、外层锁及 current/pinned 算法。

以下类型名和字段布局为候选，复用现有共享值类型，不建立新的领域对象：

| 候选公开类型/结果 | 形状与职责 |
|---|---|
| `EvaluationRootSelectionInput` | `{ tenant, standing, workspace?, holdings, definitions, session?, rootDefinition }`。前六项直接采用 EvaluationInput 的同名类型与含义；`rootDefinition` 是类别为 agent_definition 的 CapabilityId。definitions 保持实际 AM3 完整定义值及当前 NonConnector 提供域，不能传缺 content/body 的半份 AssetDefinition。根 body 在本组件中保持不透明；选中后由生产者按 AD1 解释 |
| `EvaluationRootSource` | `{ asset, version }`，直接复用 root.source 两成员的精确值域；返回经过防御性复制的值，不返回可变的内部选中持有/定义引用 |
| `EvaluationRootSelectionResult` | 候选互斥联合 `{ ok: EvaluationRootSource }`、`{ missing: true }`、`{ invalidInput: { diagnostics: InputDiagnostic[] } }`、`{ unavailable: true }`。已有诊断沿原 condition 与表示拒绝事实，不引入 reason/condition 枚举 |

`ok` 仅说明给定真实值快照按第 1 步选出该根来源，尚未读取/校验根正文窄规则、展开组合或求根设置。`missing` 是确定没有生效根（未持有、禁用或不能使用），不是缺少 definitions、版本不可解析或读取失败。`invalidInput` 表示本组件负责的纯输入条件不成立：例如持有缺其定义属于 C5、在效持有的版本不存在属于 C9，不能降成 missing。`unavailable` 仅表示现有真实正文判定提供者缺席等本地技术条件导致不能判（如现有 BodyProviderUnavailableError 边界）；它不是 evaluate 的第五种领域返回，也不由异常兜底把程序缺陷转换成不可用。生产者读存储/正文失败由生产者自己的端口报告，不由本组件发起或模拟。

窄输入仍包含整份本次持有与定义，不只留下根的那几条。入口复用 C1 的显式值形状，C2/C3～C9/C11/C12 中第一步所需的一致性，以及 C10 中实际参与 usableBy 的配值核对；不跳过其他能力上的坏持有来制造根选择成功。现有工作区默认禁用条件仍从已给定、按对应正文契约可读的 mcp/loop_extension 值判，不解释根正文。根引用 C14、声明 C15/来源 C16、动作集 C13 和后续属性配值 C10 不在窄输入内，留给完整 evaluate；组件成功不得作为完整 EvaluationInput 已合法的凭据。按 S-6/C12 的精确采用说明使用捕获 standing 计算角色时，值形状合规不证明 PRE-3 的当前效力或访问权限；真实输入生产者仍负责所需本机权威/有效副本核对，未知不冒充有效。

**实现抽取点**：现有 `packages/core/asset-evaluation/src/compute.ts` 的 `computeEvaluation` 在组装前依次产生 disabled/live、usableBy 判定、surviving、locks/inEffect、selected。候选抽出一个内部纯阶段，向完整 evaluate 返回同一份局部选择结果和后续需要的过滤/权限中间值，向公开 selector 只投影根来源；两条路径共用判定、失败条件和 `versionOf`，不复制或再写一个仅支持根的选择器。完整 evaluate 仍执行其全部前置核对，保持 `invalidInput → compositionCycle → categoryUnsupported`，不能因为先完成局部选择就提前发布成功或提前解释根声明。

**版本精度缺陷与修复义务**：现有 `versionOf` 的 pinned 路径使用 `Number(jsonNumberSource(...))` 比较，会把部分不同的精确整数折合；该源读数是缺陷定位，不是已完成修复或合法全输入复现实验。候选改为精确十进制整数相等/比较，同一实现供 selector、完整 evaluate 与其正文投影复用。current 在 AM3 连续递增版本线通过校验后取最大版本；不靠对未校验数组排序来修补坏版本线。不得对整数设置 Number.MAX_SAFE_INTEGER 上限，不得为比较物化指数表示中的天量零。

主线本次明确选用现有公开 `@omne-harness-lite/call-accounts` 的 `ExactDecimal.from(value).compare(other)` 与 `isInteger`，经其包根入口复用，不新增 content-blocks 公开面、不跨包读取私有 `exact-schema.ts`。已核现有实现以 BigInt 系数/指数判等及比较数量级，compare 不展开指数个零；本用途只需 from/compare/isInteger，不调用金额汇总或 add。该数值工具依赖沿 call-accounts → asset-model/content-blocks，不反向依赖 AE，当前包图不成环。具体接入和精度回归仍属 AE4-8。

生产者 `packages/assets/evaluation-input-store` 对同一份已捕获输入调用 selector，按返回 asset/version 取得实际不可变正文，通过 AD1 后才组入 references/attributes/source，再交完整 evaluate 核 C15/C16。读取之间变化由生产者的共同读取/有效性核对负责；纯包不以锁、缓存或重试把两个快照拼成一个。针对 runtime/v3 S-66，确定缺根、非法纯输入或不能判由输入提供者沿其既有 unavailable 边界收场，不填旧正文、默认根或伪造 source；其他纯函数消费者如何处理 missing 由各自契约决定。

### 持久结果的公开纯值判定

候选 `judgeEffectiveAssembly(value: unknown): boolean` 是 [AE4 S-47 成功结果值读取](../../../../spec/capabilities/asset-evaluation/v4/contract.md#s-47-成功结果的值读取)的投影，不增加第三个领域操作。它检查完整结果，不能只检查 manifest 当下用到的几个字段。通过返回 `true`，畸形或结果自身矛盾返回 `false`；不返回修补后的对象、不吞掉成员、不重排集合、不修改输入，不新增失败枚举或 C 编号，也不冒充 evaluate 的 invalidInput。程序自身缺陷不伪装成 false。函数为同步纯计算，无 IO、存储、Context、时钟或环境依赖。

| S-47 责任 | 同一公开构件的实现投影（候选） | 不能据此声称 |
|---|---|---|
| 成员表、开放 JSON 槽及无损边界 | 入口先做完整无损值检查，再按固定 DTO 位置执行闭合成员与必需/可选类型检查；CapabilityId、资产号、版本和 PermissionValue 复用精确 data 判定。不把任意 value 对象递归当 DTO | TypeScript 类型或一次序列化不能代替运行时判定；解析前丢失的信息无法恢复 |
| 第 1 条：五个集合的各自唯一键 | 用共享精确身份与无损值相等构建局部索引，按规范各自的键判重；不先去重再校验；数组枚举顺序不决定判定 | 不把对象引用地址、浮点舍入结果或偶然排序当身份；unresolved 不能只按目标去重 |
| 第 2～5 条：组成、未解析、持有层及过滤关系 | 在上述同一份局部索引上检查 composition/assets/values/unresolved 交叉成员关系，及 replaced/lockedAt/resident 和 FilteredOut 的规范关系；不重建原组合图。允许合法非空 unresolved | 结构自洽不能证明组成图、锁或替换集合真的由某次输入计算出来 |
| 第 6 条：根三项与固定 usableBy | 根值复用 AD1 的已知值域；固定权限复用 AM3；本包实施规范规定的出现性、来源层与元数据排除检查，缺根声明对应的合法缺项不补值 | 不推断原声明曾包含所有三项，不由值可读推断 runtime 可发出 |
| 第 7 条及末段：已出现元数据和已知执行位置 | 仅在规范明确的元数据/固定项触发条件下，复用权限域及层关系判定；任意设置对象有 allowed 成员时仍按普通 JSON 处理 | 不能判定任意非根项是否应有专用元数据、声明域或漏项，也不能证明真实计算值；这些归输入与写入者 |

该表落实 S-47 已有形状和可以仅凭结果判定的关系；不把它叫作求值正确性证明。结果没有 EvaluationInput、tenant、正文或 `root.source`：把不同来源的片段拼成结构矛盾时应拒绝；拼后仍自洽时，单参判定器可能通过，必须由 `packages/assets/evaluation-input-store` 的真实输入来源和 registry 写入者的真实 evaluate 调用保障，不能按启发式猜测其来源。

`assembly-manifest-store` 在 manifest/v3 S-32 的完整无损接收边界调用本构件，随后自行核对 `compositionOrder` 是同一 composition 的精确排列；返回 false 映射到其既有 `unavailable{reason: invalid_evaluation_content}`。manifest 不复制 EffectiveAssembly 校验，也不让本包拥有清单失败语义。原始重复键必须在文本解析时拒绝，判定器不能恢复已被有损解析器抹掉的信息。

**AE4-7 的表达已对齐，实施证据仍缺**：S-47 明列闭合 DTO 及开放 JSON 槽，提供者不自行决定未知成员政策，也不从 TypeScript 类型反向生成新的权威 Schema。该条仍是 candidate；公开实现、制品消费与 manifest 拒绝映射尚未验证。正文声明依赖的正确性是明确不可由单参结果证明的边界，不通过复制声明默认或读取存储填补。

## 依赖、作用域与绑定

| 消费坐标或工具依赖 | 提供方式与绑定点 | 缺席与旧引用 |
|---|---|---|
| `data.identity-values/v1`、`data.asset-model/v3` | 静态纯包；使用现有身份、持有、版本与声明构造/判定；条款集合按 AE4 catalog | 制品缺失为构建/链接缺陷；不是空求值成功。既有 v3 闭包不随根默认入口切换改变 |
| `data.agent-definition/v1` S-1～S-9 | 新纯正文节点的公开值规则（候选）；只验证显式交入的引用/声明，输入来源另由调用方负责 | 未接受、未提供可消费公开面前，AE4-1 阻止 v4 实施采用；本包不自行复制域规则 |
| `data.model-profile/v3` S-2、`data.tool-definition/v3` S-14 | 根项域经 AD1 的精确公开资源闭包消费；不读模型目录、不做模型选择 | 不以最新版 Schema 或任一示例模型替代精确依赖 |
| `data.content-blocks/v3` S-24（AD1 的规范依赖，本包无损工具依赖） | 无损值与文本工具；整输入指纹继续 SHA-256，内存构件无 IO；不声称 AE4 catalog 新增直接语义依赖 | 无环境回退；输入表示不可恢复时显式拒绝，不能精度损失后继续 |
| 既有 `call-accounts` 公开 `ExactDecimal`（工具依赖，其语义采用为 data.call-accounts/v2） | 主线指定复用 `from`、`compare`、`isInteger`；用于版本值精确比较，本包不消费账本能力或新增 catalog 语义依赖 | 保持公开入口依赖，随制品图核对无环；没有精度失败时不能切回 Number |
| `data.mcp-endpoint/v2`、`data.tool-definition/v3`、`data.loop-extension/v3`、`data.skill-package/v2`、`data.slash-command/v2`、`data.connector/v2` | 沿 AE4 catalog 的原规则依赖；Skill 仍取显式 v2 正文端口，不追默认 v3 | Connector 仅规范依赖，真实正文提供者仍延期；现有 `NonConnectorEvaluationInput` 与 `BodyProviderUnavailableError` 技术边界保持，不伪装为新的领域失败 |
| 消费本包：资产治理、注册表、MCP 桥、拓展件与装配 | 各自显式采用默认 v4 或 `./v3` 候选入口；一个调用只用该版闭包 | 不保存在 Cordis Context，不随插件换代改变一次纯调用的输入；旧版尚有消费者时保留其入口 |

本包不反向依赖 registry、assembly-manifest 或 runtime。AD1 不反向依赖 AE4；引用形状与既有 v3 的同形核对仍归 AD1 验证义务。`defaultBodyContracts` 不增加一个据窄根规则解释所有 `agent_definition` 的通用槽位，否则会绕过 AE4 S-44 的 `categoryUnsupported`。

## 关键选择与反向核对

| 选择（候选） | 落选方最强论证 | 本方弱点与改变选择的证据 | 置信度 |
|---|---|---|---|
| 保留纯函数包，不登记 Cordis 服务 | 服务可统一替换并直接读取当前配置，消费者接线更少 | 调用方必须显式组装完整快照；需靠真实交接测试发现陈旧输入。契约 S-11/S-30 不允许借服务暗读状态 | 高 |
| 根投影为既有计算的独立输入分支，共用设置计算 | 把根放入 composition 可少一个分支，通用遍历代码更短 | 分支必须维护“根有项但不是成员”，需要独立反例；把根塞入组合会直接违反 S-45 并误装根 | 高 |
| 域规则复用 AD1 公开纯值构件，不在 AE4 复制 | 三项直接写在求值器能减少新包接线，当前范围很小 | 依赖新正文包的精确公开闭包，采用需同步；重复规则会使写入/读取/求值域分叉 | 高 |
| 默认 v4 配合显式 v3 闭包 | 所有消费者一次切换最少保留代码，也可用一个宽输入入口自动识别 | 两个公开入口增加制品和回归负担；已接受的未切换消费者仍要求 v3，自动识别会把版本选择藏进输入缺席 | 中高 |
| 在 AE 包导出完整结果值判定，manifest 调用共享构件 | manifest 只检查所需字段更少依赖；或者各持久读面就地检查更易开发 | 增加公开构件及结果反例维护；单参结构判定无法保证来源真实，调用方必须保留写入链的责任 | 高 |
| 抽出共享第 1 步并公开根来源投影 | input store 就地选择可少一个 API；给完整 evaluate 拼临时 root 值可少一次内部抽取 | 新窄组件增加公开类型与一致性回归；但复制算法会随锁/权限规则分叉，临时 root 值则伪造来源且形成先有声明才能选正文的循环 | 高 |
| 复用现有 ExactDecimal 公开工具 | 从 content-blocks 提供新的数值 API 能使数值工具集中在更底层 | 本包新增对 call-accounts 的工具依赖；当前无环且只消费已有精确比较，避免为本次版本比较扩展另一节点公开面 | 高 |

## 状态、并发与失败映射

本节点无权威存储、无提交点、无后台任务、监听器、取消句柄或在途外部副作用。单次调用持有其防御性复制的输入和局部中间值；并行调用不共享可变求值状态。C16 使用第 1 步得到的生效资产/版本完成一致性检查，不能以“已部分求出”绕过 `invalidInput` 的优先级。无生效根时仍校验输入形状和 C15，但 C16 不用 source 补出资产，结果按 S-20 保留 unresolved。

三个失败返回均没有半份 `EffectiveAssembly`；缺声明的成功不等于可调用模型。根的空 attributes、缺任一时限、缺 model 分别保留真实缺席，不代填默认，不把未锁 model 当已有选择。内部缺陷与缺失真实 Connector 提供者的既有技术异常边界沿原设计，不新增领域拒绝枚举。

两个用于实现验证的交错：调用 A 已取得版本 1 的完整值输入，调用 B 的生产者发布/选择版本 2；A 仍按原输入算，B 必须交版本 2 的新正文与 source。调用 A 的输入复制完成后，调用方修改原引用或另一调用求值，不应改变 A 输出。这只检验值隔离；发布、快照一致和现读顺序归生产者，不由本包进程内锁保证。

## 存储要求与装卸配对

**对存储提供者的要求清单：无。** S-11/S-30 禁止本节点读写存储；没有跨 owner 的同提交写入。registry 表与 manifest 求值记录的共同提交对象属于读取链提案和对应提供者，不能在本包加一个缓存表或事务来冒充该保证。

**装载贡献与撤除义务：0 对。** 模块加载只构造有界、不可变的纯规则和公开函数，无 Fiber、inject、effect 或资源取得。构建/链接失败由部署入口处理；没有本包受管资源可释放。调用已经同步开始时按自己的输入计算结束；本包不声明“卸载时由内核取消计算”。已有结果的持久保留和作废由消费者承担。

## 归外部提供者与装配的事项

| 责任与契约坐标 | 明确 owner | 本节点边界与待交付 |
|---|---|---|
| AE4 PRE-1～PRE-8、S-29：完整快照、分享现效、成员核实、官方持有、文件与动作集 | 组输入的资产读取/治理提供者；[asset-registry](../../tools/asset-registry/README.md) 持有本次动作集；入口装配核实调用方 | 纯包只能检查显式值的一致性，不能证明来源；沿既有前提逐项交接 |
| AE4 PRE-9、S-45/46；AD1 S-2/S-9：根两个槽位来自同一已发布版本 | 主线指定 `packages/assets/evaluation-input-store`；`apps/model-request-acceptance` 装配它；AD1 纯包仅校验值 | evaluation-input-store 节点尚未成稿，真实 IO 仍是缺口；先用本包候选 selector 选择，再取得真实正文并组完整输入；只匹配 source 数字不能证明正文相符 |
| `capability.asset-registry/v3` 的 fill/reload 与 `capability.assembly-manifest/v3` 的 readEvaluation | [asset-registry](../../tools/asset-registry/README.md)、[assembly-manifest-store](../../assets/assembly-manifest-store/README.md) | 分别提交真实求值、读取已提交结果 |
| runtime3 S-21/S-66：缺两项正时限时零出网、显式初选模型、当前输入 | [model-request-runtime](../../model/model-request-runtime/README.md)、`packages/assets/evaluation-input-store` 与 `apps/model-request-acceptance` | owner 已点名，具体新节点仍待成稿/实施；S-66 候选要求 runtime 用当前输入调用 evaluate，已提交结果只作历史；本包仍不暗读 IO 或扩大语义 |
| 时钟、密钥、配置错误及诊断持久宿主 | runtime/transport 与其装配 | 本包无此依赖，不读取或记录密钥、完整正文；可解释结果/失败经返回值交调用方，调用方负责带运行关联的诊断 |

## 实施缺口与受阻消费者

AE4-1～AE4-8 的精确验收义务见 [verification](verification.md#v4-候选增量的证据义务)。AE4 与 AD1 的接受、正文公开构件与制品闭包、结果判定和共享根选择实现、版本精度修复、真实生产者和独立装配尚未兑现，因此 v4 不能标为可实施已接受或已验证。现有 v3 消费者与原有限证据继续按原坐标读取；本稿不改原 `design.md`、冻结规范或接受事实。
