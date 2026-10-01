# Current-only resource audit（事实，不是新方案）

结论：本次新 CA `./schema/v2`、MS `./schema/v6` 不是归档证据，也没有对应的旧版本执行入口；它们是现行冻结契约引用的旧原字节资源。不过 MS7/MR10 注册图明显超过公开编译定义的实际 `$ref` 可达集合：MS7 的50公开定义不触达 CA2 或任何 LC/MS旧资源，MR10 的25公开定义只触达 LC6.FailureCause，不触达 MS6/CA2。真正直接依赖 CA2/MS6 的本轮现行公开校验面是 AE2 和 LC6。因此不能以「旧设计写了」解释永久保留，也不能把全文件扫描得到的22/25资源视为每个当前执行入口不可削减的最小闭包。

审计固定执行快照 `96ae5241b935f7735051f2ffae452a6d978c383c`（最初观察的 ac1771f2 已在核查途中合入 MR10）。所有当前入口名单、package exports、生产注册列表和根 Schema 均用 `git show 96ae5241:…` 读取；依赖 Schema 从明确设计工作区 `.meta_harness/design/spec/` 读取，逐份 SHA256 在 `definition-closure.json`。未写产品源码、设计、HUB、lock；未运行 source unchanged 算法测试。

## 三类材料

- `design_legacy/`、Git历史和历史决策复核文字只供证据；不建立现行接受或兼容承诺。本审计不使用 design_legacy 推导当前需求。
- CA2/MS6/MS2/MS3/LC2/LC3 等冻结 Schema 仍出现在当前 precise resource graph：属于现行契约资源依赖。不能将旧 URI 指向新版本，也不能原地改冻结 Schema。当前引用可以被新接受版本取代，旧资源没有永久存在的权利。
- CA、messages、model-response 公共当前 root 执行面未发现依据输入版本转派旧 judge、自动补字段、自动迁移或降级分支。MS7 契约明确缺适配/cap等拒绝，不转交旧格式读面。运行时另有 `legacyDiagnosticEnabled`/`legacySettlementEnabled` 回调收口代码，属于诊断回调共存，不是 CA2/MS6 数据兼容证据；本轮没有对全部 runtime 兼容行为作穷尽审计。

## 以实际公开编译入口为根

生产 `schema.ts` 逐个编译 `SCHEMA_DEF_NAMES` 指定定义；`createSchemaRuntime` 注册整个资源文件，但没有因此编译该文件每个定义。A2资源断开测试还会编译所有依赖文件全部 defs，所以证明的是整个声明资源图，而非 MS7 的50入口最小集合。

| 当前 root | 生产公开定义 | 定义可达资源数（含root） | 已注册资源 | 已注册但公开入口未触达 |
| --- | ---: | ---: | ---: | ---: |
| MS7 | 50 | 9 | 22 | 13 |
| MR10 | 25 | 9 | 25 | 16 |
| AE2 | 14 | 4 | 4 | 1 |
| LC6 | 43 | 10 | 21 | 13 |

注意 AE 当前 root 实际为 **AE2**，不是实现计划/映射文字中的 AE3。固定提交中 AE 注册了 root CA3，却缺其真正引用的 CA2；LC注册了 root MS7/CA3，却缺真正引用的 MS6/CA2。这是 A0 正在处理的消费者迁移缺口，不能把 committed96快照称为最终可运行装配。工作树中 root 已有相应未提交修改，本审计未覆盖其写入、未借此宣称已验证。

MS7必要资源：MS7、CB3、CB2、OE1、CA3、IV1、MP5、MP6、TD3。MR10必要资源：MR10、CA3、IV1、MP5、CB2、OE1、LC6、CB3、MS7。MR10通过 `AssistantMessage` 到达MS7，未到达MS7.created支路，所以 MR10公开入口亦未触达MP6/TD3。

LC6必要资源：LC6、AM3、TD3、MP5、MS6、CB3、OE1、CA2、CB2、IV1。AE2必要资源：AE2、CA2、CB2、LC2（仅FailureCause）。完整入口名单、每一条局部/外部 `$ref`、未触达列表及 hash 见机器JSON；下表只合并同义路径，不省略直接旧版本消费者种类。

## CA2 / MS6 的真实用途与引用

| 消费者 | 精确目标 | 使用位置 |
| --- | --- | --- |
| AE2 | `../../call-accounts/v2/call-accounts.schema.json#/$defs/ModelCallId` | ArrivalTarget.oneOf[0].callId |
| AE2 | 同URI `TrimReason` | TrimEvent.reason |
| AE2 | 同URI `Usage` / `Cost` | AccountEvent.usage / cost |
| LC6 | 同CA2 URI `AttemptId` | AttemptStartedSubject.attempt / ExtensionInput.attempt |
| LC6 | 同CA2 URI `RunId` | ExtensionInput.run |
| LC6 | 同CA2 URI `Usage` / `Cost` | AfterModelCallCompleteReplySubject.usage / cost |
| LC6 | 同CA2 URI `ModelCallId` | Conclusion.modelCallId |
| LC6 | `../../messages/v6/messages.schema.json#/$defs/Message` | ModelRequest.messages[]、BeforePersistMessageSubject.message、AfterPersistMessageSubject.message |
| LC6 | 同MS6 URI `CompactionMessage` | AfterCompactionSubject.compaction |
| LC6 | 同MS6 URI `AssistantMessage` | AfterModelCallCompleteReplySubject.reply |
| LC6 | 同MS6 URI `ModelCallDispatchedRecord` | AfterModelCallFailureSubject.dispatches[] |
| LC6 | 同MS6 URI `SystemReminderMessage` | InjectOutput.message.allOf[0] |
| 被LC6触达的MS6 | CA2 `AttemptId` / `ModelCallId` | AttemptStartedSource.attempt、InterruptedSource.about.call、ModelCallDispatchedRecord.call |
| MS6全部声明 | CA2 `ModelCallId` | 另有Opened/InterruptIntent/EndedRecord.call，但后三者不从本轮LC6公开入口触达 |

其他仍在完整资源声明图中的旧链：TD3→AM3；AM3资产定义→LC3.LoopExtensionDefinition、TD3.ToolDefinition、SP2/MCP2/Slash2/Connector2；这些资源含AM2/TD2/LC2/MS2及AM3/LC3/MS3，MS2/3、LC2/3声明仍引用CA2，Connector2声明引用MS2.SessionRef。它们不因整个文件注册而成为MS7/MR10公开值的实际嵌套依赖；不能把这些链直接推成完成资产/工具/Session全部功能的前提。

## 循环判断

不能据当前事实说「所有旧MS/LC钉版本都是为了避免循环」。MS7→TD3实际仅 ModelToolEntry/ModelToolName；该支路不达AM3。MR10→LC6实际仅闭合的FailureCause；不达LC6.ModelRequest/Subject。LC6.LoopExtensionDefinition 的定义级闭包只有 LC6+AM3+TD3，未到达Message。当前完整文件声明图已经有AM3↔TD3以及AM3↔LC3关系；JSON Schema文件有环不等于值必然无限递归，也不等于需要历史版本。

明确的防循环依据是 MS7 契约关于 MR/MS 互相使用的 ResponseId/SelectedBy/CredentialScope/ParameterAdjustment 保持逐字对齐形状、避免反向 `$ref` 的说明（contract.md末段，本版延续D060 M2规则）。这不能外推为旧AM/LC历史钉版本永久有效。

若把整个文件每一条声明一律改最新，资源层可能出现 MS7→TD→AM→LC→MS7；是否产生值递归须逐个定义检查。当前公开入口没有此链。需要处理最小共同值/不透明外部引用的触发点应是 **精确定义级环且拥有者/承诺冲突**，不能仅依据资源文件有环就先造新core包。本审计没有证明出现新的值递归，也未设计共同值包。

## 最小变更闭包的事实边界

1. 对MS7/MR10当前公开编译行为而言，消除未触达旧资源的注册并不需要改变它们冻结规范内任何 `$ref`；但现有 realization 明写22资源及MR/LC传递资源论证、资源断开验证采用全文件全部defs根，因此需要先修正采用/映射与验证根的决定，才能按新的已接受要求删生产注册/依赖。仅删出口而把旧资源藏包内仍是旧依赖，不是破坏性迁移。
2. 真正让本轮所有公开执行面不再消费CA2/MS6，至少需要 **LC6后继契约**将上述Message/record引用迁至当前MS7、CA标识/Usage/Cost引用迁至CA3；需要 **AE2后继契约**迁至CA3。两者所有权/语义条款、Schema、实例、verification、registry采用、各realization引用及生产公共root同步属于必要局部闭包。冻结LC6/AE2不能原地改。这不是新增行为或算法授权；这里只定位受影响所有者。
3. 若“单轨”进一步要求MR与AE也不保留旧LC资源文件，则MR10的FailureCause引用需在MR后继契约中采用LC后继，AE后继也要替换LC2.FailureCause，并同步它们采用与映射。即使FailureCause值形状相同，不能用新文件冒充旧URI。这个闭包仍不要求完成真正拓展件执行或Session运行时。
4. 若要求 **整个仓库所有当前Schema文件的每条声明**都无旧版本，范围会进入AM/TD/SP/MCP/Slash/Connector等后继契约及其提供者注册；这是不同于本轮公开执行入口的更大边界。本轮没有逐包穷尽其实际公共入口，不能称这份全文件26节点图为其最小闭包。Connector→MS2.SessionRef只是值引用，不构成完整Session实现要求；外域资产/工具的完整执行功能亦未由这些refs推出。
5. MP5/MP6仍被MS7直接精确引用（dispatched和created）；CB2亦经共同值引用可达。只处理CA2/MS6不能宣称整个系统已经“所有版本只剩最新”。这两类资源合并需要各语义拥有者另作精确规范裁定，本审计不擅自把值相同当成可改URI。

可直接触发 root 的局部设计核对点：MS7 realization 把整个文件22闭包称为递归可达；MR10 realization 将 LC6.FailureCause 的文件引用展开为MS6并注册整个旧图；AE“AE3”描述与实际AE2 root不一致。先核定验证根和本轮单轨范围，才可判断T29必须修正哪些已接受映射。历史归档可以继续保存，它不妨碍当前执行资源和入口删除。

## 可重跑证据与限制

在原spoke运行 `node tmp/model-request-runtime/ref-core-resources/current-only-audit.mjs`，退出0；输出 `definition-closure.json`。脚本按固定96提交公开入口与资源注册清单，沿URI+JSON Pointer访问所指定义并递归其内部refs；使用visited节点避免环，拒绝不存在的定义；记录source/schema SHA256。`current-only-graph.json` 是早先按完整文件所有refs的26节点图，仅作层次对照。

这是精确静态引用审计，不是Ajv实跑最小图测试，也不证明跨成员judge/完整runtime行为。没有重复A1算法测试，没有宣称独立评审或最终接受。

## 附：完整未触达注册列表（固定96）

messages:

- `data/call-accounts/v2/call-accounts.schema.json`
- `data/model-profile/v2/model-profile.schema.json`
- `data/tool-definition/v2/tool-definition.schema.json`
- `data/asset-model/v3/asset-model.schema.json`
- `data/asset-model/v2/asset-model.schema.json`
- `data/loop-extension/v3/loop-extension.schema.json`
- `data/loop-extension/v2/loop-extension.schema.json`
- `data/messages/v3/messages.schema.json`
- `data/messages/v2/messages.schema.json`
- `data/skill-package/v2/skill-package.schema.json`
- `data/mcp-endpoint/v2/mcp-endpoint.schema.json`
- `data/slash-command/v2/slash-command.schema.json`
- `data/connector/v2/connector.schema.json`

model-response:

- `data/call-accounts/v2/call-accounts.schema.json`
- `data/asset-model/v3/asset-model.schema.json`
- `data/asset-model/v2/asset-model.schema.json`
- `data/connector/v2/connector.schema.json`
- `data/loop-extension/v3/loop-extension.schema.json`
- `data/loop-extension/v2/loop-extension.schema.json`
- `data/messages/v3/messages.schema.json`
- `data/messages/v2/messages.schema.json`
- `data/model-profile/v2/model-profile.schema.json`
- `data/messages/v6/messages.schema.json`
- `data/model-profile/v6/model-profile.schema.json`
- `data/tool-definition/v2/tool-definition.schema.json`
- `data/tool-definition/v3/tool-definition.schema.json`
- `data/skill-package/v2/skill-package.schema.json`
- `data/mcp-endpoint/v2/mcp-endpoint.schema.json`
- `data/slash-command/v2/slash-command.schema.json`

arrival-events:

- `data/call-accounts/v3/call-accounts.schema.json`

loop-extension:

- `data/loop-extension/v3/loop-extension.schema.json`
- `data/loop-extension/v2/loop-extension.schema.json`
- `data/asset-model/v2/asset-model.schema.json`
- `data/connector/v2/connector.schema.json`
- `data/call-accounts/v3/call-accounts.schema.json`
- `data/model-profile/v2/model-profile.schema.json`
- `data/messages/v7/messages.schema.json`
- `data/messages/v3/messages.schema.json`
- `data/messages/v2/messages.schema.json`
- `data/tool-definition/v2/tool-definition.schema.json`
- `data/mcp-endpoint/v2/mcp-endpoint.schema.json`
- `data/skill-package/v2/skill-package.schema.json`
- `data/slash-command/v2/slash-command.schema.json`

静态算法适用前提补充：本轮实际触达的16份资源递归扫描结果：`$dynamicRef` 0，嵌套`$id` 0，anchor/dynamicAnchor 0。因此本轮URI+JSON Pointer算法没有遗漏这些构造；脚本不宣称支持一般含这些构造的Schema，扫描记录见`reference-structure-check.json`。
