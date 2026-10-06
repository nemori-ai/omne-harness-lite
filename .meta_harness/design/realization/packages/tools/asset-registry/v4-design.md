# asset-registry v4 完整增量实现设计

本稿为 **candidate，未采用**。节点及源码路径均为 `packages/tools/asset-registry`，沿 D-059；**本节点尚未建包**。本稿完整承接七操作的实现责任，并新增 AR4 原完整 fill 的公共认回投影；不改已采用的 [design.md](design.md)、[v3-design.md](v3-design.md) 或 [原来源缺口稿](v3-original-fill-source.md)。本页新增服务、函数、配置及内部状态名字均为候选投影；引用的其他包公开名字仅说明实际可用构件，不表示本节点已经接线。

## 精确输入与实现路径

baseline 均为 `omne-harness-lite-design-2026-09-15`。[catalog](../../../../registry/catalog.json) 与 D-079 已接受 AR4/MF4 及 MF4 provider；**本 AR4 provider 仍 candidate**。D-078 的行政接续不改变 D-073～D-077 范围，D-079 也不替本节点接受或验收。

| 输入 | 精确范围与本稿消费 |
| --- | --- |
| [capability.asset-registry/v4](../../../../spec/capabilities/asset-registry/v4/contract.md)（下称 AR4、S-n） | SHA-256 `23ce5e5b88dbdaf4062184e2a0324cf0b75cd5af86cdf79aebaba05354c9b414`；完整保留 S-1～S-50，新增 S-51/S-52；不增领域操作或失败 |
| [capability.assembly-manifest/v4](../../../../spec/capabilities/assembly-manifest/v4/contract.md)（MF4） | SHA-256 `46c3d605fb889c6f66822f8aecb815c1e691bf605600a036dc48ac0c9aeb6a2d`；采用六操作中的 readHead/append/readHistory/readEvaluation/readGiven，尤其 S-32/S-36/S-37 |
| [MF4 provider 增量](../../assets/assembly-manifest-store/v4-design.md) | SHA-256 `d2394261503f5a37b39f67a6e11b552c19c218564e008bcf4884235be99c2784`；MG-1～MG-8、R-AMS4-1～5。此时 readGiven 尚未交付，MF3 五操作组件检查不证明第六操作 |
| D-074 采用的 registry v3-design | SHA-256 `30b4be1f04cc13a8ed98294f422109e98dbbd4df24889d08a6edb20082a81438`；继承一插件、公开纯构件、清单唯一权威、七操作正常次序、生命周期与未关闭缺口 |
| D-077 的 [EIS source interfaces revision 1](../../assets/evaluation-input-store/v3-source-interfaces.md) | SHA-256 `1d0be74b524b6609c2a1d61e5ce49ebdcf3247026b710458a951823ee83640b6`；SI-2/3/4 的受限 fixed-root 读面、当前资格与 C16 原因交接；SI-G1 须本节点真链证据关闭 |
| `capability.asset-evaluation/v4`（AE4，accepted） | S-6/S-7/C16、S-8/S-15/S-47；同一公开 evaluate、selectEvaluationRootSource、judgeEffectiveAssembly、defaultBodyContracts。纯值判定不证明来源真实 |
| `capability.session-tenancy/v2`（STT2）、`capability.organization-governance/v2`（OG2） | 真实 holdingTenant；当前成员资格经 EIS 已采用的 OG 参与面读取。STT 不由 SessionRef 或请求 tenant 推导，捕获角色不充当当前许可 |
| 其他规范依赖 | 精确沿 AR4 S-4：asset-model3、tool-definition3、loop-extension3、messages2、identity-values1、offer-expiry1、call-accounts2 及原 MCP/放行/治理等面；AD1 经 AE4/EIS 消费。包 root 的已实现版本须在制品接线时显式核对，不能凭同名类型自动升版 |

继续自建薄领域组合，复用本项目成熟的纯值、严格 JSON、源读取和清单提供者。Cordis 固定 D-025 的 4.0.4。本节点不 fork 内核、不建持久表、不直接取得 storage、不给 EIS/manifest 私有表增加旁路。源与清单是两个独立读取边界；本稿不增加完整 PF-004 装配代际、跨进程协议、中心同步、workspace/MCP/shared 来源政策或批量计划算法。

## 契约责任到 Cordis 的投影

| 编号与条款 | 插件／服务／公开构件（候选） | 实现兑现点 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| AR4-1：S-5～S-7/S-13～S-18/S-22/S-48～S-50 | `buildTableContents`、`buildSnapshots`；`assetRegistry.fill` | 真 evaluate 的完整 E＋显式 O→六表计划→一条 given→确认提交后投影；认回按原 S-22⑦ | MF4 S-17 与 R-M1～9；V4-1/2/10；真实 producer 归 AR4-G2 |
| AR4-2：S-16/S-23/S-31/S-51/S-52 | `extractRootSourceFromFullFillRecord`；内部来源认回闭包；`reload` | readHead(H)→readGiven(s,H)→核完整 fill→真实 STT/EIS→evaluate→全排列/目标表→expectedHead=H mint | MF4 MG-4/8，EIS SI-2/3；V4-3～8/10；AR4-G1/2 |
| AR4-3：S-8～S-12/S-20/S-24/S-51.5 | `computeAvailability`、`buildReport`；`refreshAvailability` | 固定 H 的表与原 fill；捕获角色配方＋当前资格；第一次求值、门控、依赖、桥、原规则第二次求值与命名冲突 | 不写清单、不增 report.head、不因新 append 重启；V4-6/8/11；AR4-G3/4 |
| AR4-4：S-19/S-20/S-25/S-26/S-33/S-34 | `findInSnapshot`；`lookup`、`list` | session 读真实当前表，run 读报告所依历史表；精确原版本正文，按类别执行原门控 | V4-9/12；历史正文/现读来源未全具备为 AR4-G3，不改用当前表 |
| AR4-5：S-27/S-28/S-48.6/S-50.3/4 | `markFailed`、`onAssetChange` | 只缩 slash_command；同一 reuse 保存被缩表原 E/O/ref，零隐式新增；日志顺序由调用方保障 | V4-2/9/10；通知及生产派发 AR4-G5；无 SQL/JSONL 同提交 |
| AR4-6：S-17/S-18/S-31～S-34/S-51 | 条件追加、历史重建、可选缓存发布 | 全部状态以 MF record＋tables 为耐久权威；观察 H 的自有值不被另一次调用改写 | MF4 R-AMS4-1～5；V4-7/9/10/13；不靠进程队列裁决 |
| AR4-7：S-29～S-32/S-52 的观测边界 | 一插件/fiber、公开 `createAssetRegistry` 闭包、一个 `assetRegistry` 服务、技术 `close` | 必需 manifest/clock；其他读面按调用取得；有界诊断、实际在途收口、零业务事件 | V4-13～15；basis 非本组合证据，AR4-G6 |

## 公开函数与持久事实的分工

纯函数层公开 `buildTableContents`、`buildSnapshots`、`computeAvailability`、`buildReport`、`findInSnapshot`，新增候选 `extractRootSourceFromFullFillRecord(record, session, head)`。它们仅消费显式自有值，不依赖 Cordis、存储、会话服务或全局当前身份；相等复用 AM3 身份与公共严格 JSON/精确数字构件。pure helper 可以判断给定值满足关联，不能证明记录已提交、是最后 given、输入已授权或来自真实求值。

候选 `createAssetRegistry` 接显式能力依赖并返回七操作与技术 `close`；Cordis 插件包装同一闭包。`close` 只承担实例准入及资源等待，不是第八个领域操作。内部来源认回、记录投影、正文定位、可用性读取、追加发布是可单独测试/取用的组合件；没有一个 `TrustedFill`/类型断言能取代真实 readHead/readGiven 调用。EIS 受限读闭包不从本包 root、服务或 adapter 转导出给产品调用者。

**生产 E/O 的边界。**fill 只接 S-22 原有 E/ref/O，可信装配先从真实源读取输入并调用 AE4 evaluate；服务只核值与顺序，不能凭 E 的 TypeScript 类型签发真实性。验收应用须记录真实 producer 调用因果，不能直接造 E fixture。O 始终是 caller 显式声明的 CapabilityId 序列，既不是 AE 输出，也不是 `composition` 的枚举次序；调用方可以明确写下其排列，服务无权排序、删补或生成 O。reload 自己消费真实 EIS 输入后调用同一公共 evaluate，再核 caller 的 O；headMismatch 重做时重新取 E、重新核这个 O，不偷偷让 O 适配新组合。需要新排列时由调用者作新调用，不发明服务端计划接口。

`buildTableContents` 在 append 前完成 E/O、原版本正文、resident、命名冲突、填表可用性及目标表计划。content **恰三个成员**：完整 `evaluation`、完整 `compositionOrder`、`filledBy`；不加 rootSource/locator/head/原输入。table.composition、table.filledAt、壳 evaluationRef 各自唯一权威；mint 提交前不造占位 basedOn。`buildSnapshots` 在成功回执后从该条壳投影，不能再做需要 IO 或可拒绝的正文读取；若投影代码有缺陷，显露已提交事实而不谎称没写。

所有入口、依赖交接、返回快照与报告用严格无损 JSON 的自有深复制／递归只读视图；浅 `readonly`/Object.freeze 不足以阻止嵌套数组变异。不以普通 JSON.parse/stringify 舍入大版号，不把 true 等同 1，不让对象键排列影响相等，序列次序则精确保留。不可复制值在所属表示边界拒绝；坏持久内容与实现缺陷分别收口。

## 原完整 fill：公共认回与真实 fixed-root 读取

以下是 AR4-2/3 的一个调用内流程，不创建另一份记录或来源缓存权威。

1. **先维持原错误顺序。**reload 的可直接判定参数错误、类别；refresh 的 run/attempt/报告 session/runId 错误在来源 IO 前处理。按原 S-31 由可信内部入口核实调用者实际会话/运行/尝试与租户权限，不以参数合法表示授权。随后公开 `readHead(session)` 得 H/latest。确认空头且无装配沿 sessionNotFound；有表但关联或内容缺损沿 unavailable，不能补空六表。
2. **固定表。**核 latest 各类别完整记录的 session、精确 seq≤H、壳/ref、相应 table/filledAt 与记录内容。当前六表分别从这次 latest 确定，不混入后来缓存或另一 readHead；相同 record 的重复引用内容须一致。所需历史调用仍按可信 category/filledAt 读回并核 session/seq≤H/内容关系。表重建的精确正文与可用性来源不能完成则 unavailable，不先把它当不存在。
3. **认最后 given。**真实调用 `assemblyManifest.readGiven(session,H)`，不扫描 latest 猜、不从 readEvaluation 求代用答案。MF 的 none 在已存在装配表时是不成立来源，返回 unavailable；MF 对这个真实合法 H 报 invalidInput 也作为依赖关联失败拒绝，不向 caller 归罪或改 H 重试。MF 读面选中最新坏 given 后不退旧给定，本节点也不另择较早合法记录。
4. **用途核验。**纯提取核完整原壳 session、1≤seq≤H、given{ref} 且 evaluationRef=ref；严格 content 恰 E/O/filledBy，filledBy=assembly；AE4 S-47 全量公共结果读取及 O 精确全排列；unresolved 为空；tables 恰六类别，空类别也显式存在。每表 composition 精确等于按 O 筛本类并从 E.assets 取得的完整条目（含 capability/asset/version/from/适用 resident）；时刻不伪造。E.root 按能力身份在 E.assets 恰有一个生效项，由它取原始 asset 与精确 version。MF S-32 成功只核两个槽位，不免去这些 AR 用途检查。
5. **租户与受限读。**本次通过真实 STT `holdingTenant(session)` 得到持有租户，核它与可信入口核实的租户相同；未知/不匹配不读他租户来源、不回退 factory。只把 `{session, tenant, purpose, rootSource}` 交给 EIS 已采用 `./registry-inputs` 的 reader，reload 用 `reload`，refresh 用 `refresh_availability`。EIS 再核 STT、recipe 租户及实际当前成员资格，真实同快照读取固定 asset/version 原正文，复用 AD1 从原正文提取 references/attributes。registry 不从 E.values 重造正文，不访问 EIS 私表。来源认回和 EIS 读取各有真实边界，二者不是一个快照。
6. **真求值。**EIS input 成功分支交完整自有输入，registry 对其调用同一 AE4 公共 evaluate；EIS 内的准入求值不能省掉消费方求值。`rootSourceMismatch` 仅接受 EIS SI-3 所规定的实际 selector 不等＋同输入实际 C16 invalidInput 因果，映射 unavailable、零追加且 refresh 无报告。保留原 fixed root/正文和当前持有；禁止换 source、改 current→pinned、捏造旧 holding、从 creation 或最新 E 填缺。根当前缺席不自动等于 C16 漂移，evaluate 的真实 unresolved 仍按原操作处理。

上述检查失败不进入后续 fixed-root 读取/求值/追加，也不产生新报告。表与 given 的用途检查不承诺发现绕开存储协议后被外部改成完全自洽的伪历史；可信 MF 写入链、只增不改及真实源权限仍是前提，必须有组合证据。

### EIS 结果和失败交接

| 依赖结果 | 本节点后果 |
| --- | --- |
| `{input}` | registry 真 evaluate；compositionCycle/categoryUnsupported 原样转交，ok 后才做结果相关全排列判断。输入不经二次 IO 改写 |
| `rootSourceMismatch` | 上述真实原因确认后整个 unavailable；不是 caller invalidInput，也不能只把权限项标 unavailable 后交报告 |
| EIS `invalidInput` | 对已核 session/tenant/purpose/source 的内部组参仍非法，是本节点接线/实现缺陷；上抛受控缺陷，不以 root drift 或正常 unavailable 掩盖；外部表示错误已在服务入口按原顺序拒绝 |
| EIS `unavailable{stage}`／固定正文不可读／当前资格无效 | 对应操作 unavailable；阶段仅作受限诊断，不增领域失败枚举、不把它当空持有。无 workspace/shared/MCP 来源同样不可用 |
| StorageUnavailable 等 EIS 已声明的可识别 IO 失败 | 由 EIS 等外层 atomic 真正结束后按 SI-3 映射；registry 不在其参与回调中捕获后继续。无关 TypeError、StorageDefect 等缺陷不 blanket catch |

## 七操作的完整消费次序

| 操作 | 本节点实现链与失败次序保留 |
| --- | --- |
| fill | 原表示层／E/O 校验→清单与会话事实→unresolved→toolNameConflict；需读事实的步骤读不到为 unavailable。装配真实 E/ref/O、六表、完整 content 同一次 given；clock 提供时刻，每类按上一份时刻保证严格递增（原 A-4，毫秒刻度而非重试时长）。given alreadyRecorded 只读原记录和真实当前六表，均 assembly 且 basedOn 为原 ref 才原样认回；任一已被替代为 evaluationSuperseded。重试输入不改原 E/O；不拿追加当任意 ref 的只读 locator |
| reload | 表示错误→categoryNotRegistered→sessionNotFound→上述 H/given/源链→实际 compositionCycle/categoryUnsupported→成功 E 的 O 全排列错误→dependencyUnresolved→toolNameConflict。建目标表、旧/新 plugin 成员共同决定的连带类别同次 mint；非目标表构成/次序/时刻/ref 不变。append expectedHead=H；只有已知 headMismatch 可按已采用可配置有界策略整套重取 H/表/given/input/E/O 校验/目标表；不能只改 expectedHead |
| refreshAvailability | 表示错误→sessionNotFound→固定 H 的表与 given→EIS captured-role 配方＋当前资格→第一次 evaluate→start 判 skill 门控或 continue 保留旧报告门控→先工具后技能的依赖可用性→按 mcp 表顺序钉动作与 endpointHoldings→按 S-24 原规则第二次求值（仅加入该次动作集；无动作集复用第一次结果）→全部工具 effectivePermissions、commandAvailability、模型面名字冲突→报告。第一求值 cycle/unsupported 原样转交；第一读不到/C16 整个 unavailable；通常第二次读不到则非 meta 权限项 unavailable、报告仍交。当前 EIS 未覆盖真实动作集分支时不能假造该分支通过 |
| lookup | invalidInput→categoryNotRegistered→sessionNotFound；session 用本次真实当前类别表，run 用报告的 category/filledAt 及 session/runId/attempt 所指历史表，tool/run 并入该报告动作。tool 按原 ModelToolName 查，不逆转写找定义名。slash_command 两种 within 均现读使用权限；skill/session 现读，skill/run 只按报告门控；其余类不增门。现读失败 unavailable，不是没有；run 不切当前表 |
| list | 同 lookup 的选择和门控，按原表顺序；tool/run 在后按 mcp 表顺序分组加入报告动作。任何必需门控读不到使整个 unavailable，不偷偷少列；无条目才是空序列 |
| markFailed | 原类别/③ 型/reload 排除校验→sessionNotFound→只删当前 slash_command 的指定条目。已不在则原样无追加；不 evaluate、不增加其他变化。目标表原历史 E/O/ref 形成 reuse，失败不发布删后缓存。调用方先耐久记录命令失败，后调用本方法；本节点不伪装二者同事务 |
| onAssetChange | invalidInput→sessionNotFound→对当前 slash_command 逐条现读权限→有收回才 reuse；任一门控读不到则全部不改。只缩 slash_command，skill 等五表不动；保留原 E/O/ref 和剩余相对次序。现求 E 仅是删除判据，不写成表源；重复通知无可删即不追加 |

刷新期间 H+1 的 full fill、reload 或 reuse 不要求末尾 readHead，不引发自动重启，也不给报告新增 head。内部观察 H 用于来源关联和诊断，报告仅以既有各表定位、session/runId/attempt 绑定该次快照。H 表不能在等待 EIS/桥期间换成新表。EIS 当前权限/持有是之后独立取得的真实观察；若其 C16 不成立仍整个失败。两次求值的配方固定为同一原根，真实动作集与其源的补齐沿已有 owner，不在本稿另造“全系统当前”事务。

## 依赖、作用域与未齐备的成功分支

| 依赖／技术面 | 取得、绑定及权限 | 缺席或换代 |
| --- | --- | --- |
| MF4 `assemblyManifest`、clock | 唯二必需 inject，实例固定借用；直接闭包由装配显式提供。MF4 版本在装配预检，缺 readGiven 不退回 readEvaluation | 缺席 fiber PENDING；提供者换代重跑。已受理操作按实际读/追加结束；clock unavailable 仅沿需要时刻的原分支失败 |
| STT2 holdingTenant、EIS registry-inputs | 按调用取得受限组件；装配构造并持有 EIS reader，registry 借用。只有可信 registry 实现/验收 bootstrap 可 import factory；产品 runtime、adapter、工具无取得该读权的路径 | 源/资格/归属缺席或 reader 已 close 为 unavailable；registry 不关闭借用 reader，也不以 captured standing 兜底 |
| AE4、AM3、各类正文判定、严格 JSON/精确数 | 静态公开 import，固定同一 BodyContracts 组合根。纯构件在 Cordis 外可单用 | 构造配置/制品版本错误沿本批启动失败；缺某类真实正文判定者不以宽松 DTO 接受 |
| 表条目精确正文、读时权限输入 | 沿已采用 v3 的真实正文/输入提供者责任，候选受限端口由源 owner 定义。此次 EIS 真实 input.definitions 已含的精确不可变版本可供 reload 构表；成功 fill 的装配 producer 须同样供其真实读取链 | EIS fixed-root 面不是通用历史正文授权。当前源不含旧表资产/旧版本时，必须由有权的原版本正文读面供给，否则重建 unavailable；不读私表、不用 caller 任填 bodies 冒充真来源。详见 AR4-G3 |
| MCP bridge、modality-projection、自报、有效模式、meta 清单 | 沿原按调用解析的可选读面；接入点持有来自这次真实求值。可信部署 meta 项来源沿 D-077，不可由发布请求自封 | 缺依赖只影响所属条目/命令的原可用性分支；meta 身份未核不能任意恒 auto。未有真实来源的成功分支保持 G-6/G-7/G-9 义务 |
| 诊断和故障端口、队列/冲突策略 | 装配拥有明确有界的端口与策略，本实例借用；配置非法启动失败 | 运行期依赖故障按各操作，诊断失败不改提交事实或吞业务缺陷；不后台持有无主 Promise |

S-51 来源证明只授权相应 fixed-root 用途；同一个 tenant 字符串、合法 DTO 或源码 import 不等于调用授权。入口内部调用者核 session/run/attempt 的真实关系；registry 和 EIS 的 STT 核实是纵深检查。跨租户默认拒绝；拿别会话已提交给定记录、报告或 ref 均不能取得其正文。`Context.isolate` 隔离实例不替代数据隔离，依据 [isolate-hides-instances-not-data](../../../../basis/cordis/isolate-hides-instances-not-data.md)。

### 历史表正文端口的必需交接

本次交付必须包含**旧报告以及当前已不持有的旧表正文成功恢复**，只有正确返回 unavailable 不能完成这项交付。以下是 registry 对 source owner 的候选技术要求，不是已存在接口；具体 source provider 增量和采用由 EIS owner/主线完成，在此之前 AR4-G3 仍阻断该成功链，禁止实现假端口或读 EIS 私表。

已与 [EIS 历史正文候选增量](../../assets/evaluation-input-store/v4-history-source-interfaces.md) 对齐，精确输入 SHA-256 为 `9313dcbe4788f4e72b1be13b05b109d55f7d5aa70d928e24927af49bc9e584a0`；该稿尚待采用，不因互指关闭 AR4-G3。候选技术投影为 `@omne-harness-lite/evaluation-input-store/registry-history` 的 `createRegistryHistoryReader`，返回 `read/close`。`read` 显式接 `{session, tenant, category, filledAt, capability, asset, version}`；这些值只从本次已核表／报告提取。source 的执行次序固定为：**技术表示校验／实例准入 → 真实 STT 核 tenant → MF4 公开 readHistory 回读原表及元组 → EIS 当前资格与版本的 atomic → 事务后 BodyContracts**。STT 归属不符、未知或不可读时即拒绝，**零 MF IO**；不得先读其他租户的清单再核归属。source factory 注入真实 MF4 readHistory，在 STT 通过后回读相同 `(session,category,filledAt)`，核原记录壳、对应表及其中 capability/asset/精确 version 元组，不能仅相信请求对象；MF 读取实际结束后，才在同一 EIS atomic 内核实际 OG 当前资格并读精确不可变版本，atomic 实际结束后才执行严格 JSON／AM3 judge／BodyContracts 纯判定。AR 仍独占报告 runId/attempt、H 与完整 E/O/filledBy/reuse 的用途判定，EIS 不复制完整 AR 校验；上述分阶段读取不构成 MF/EIS 共同事务。

候选正常结果 `{version: AssetVersion}` 交真实完整已发布版本，registry 再核 number 与请求精确相等、content 类别与所需条目匹配后，交自己的公开构表构件；不能取 draft 或从新 E 造版本。候选 `invalidInput` 表示技术请求本身非法：若由服务已验证的历史定位值组成仍发生，作为内部接线缺陷显露，不改为正常来源失效；`unavailable{stage}`（含 closed、无源、资格拒绝、实际读取失败）映射该次重建 unavailable。真实读取的阶段及缺陷分类由 source owner 的候选设计细化；无关异常不被本节点 catch-all。该接口不返回 EvaluationInput，不求值、不触发 C16、不把旧资产放回当前 holdings。

| 交接责任 | 候选 `historicalBody` 读端口的前置与结果边界 |
| --- | --- |
| 可信调用者 | 仅 registry 的表重建/可信验收装配使用。factory 由装配构造，传给 registry 的是受限读取闭包；runtime、adapter、工具不得 import、转导出或凭 asset/version 自行访问。静态边界负控须包含别名路径与转导出 |
| 表／报告来源证明 | registry 先按 S-25/S-33 用真实 MF readHead 或 readHistory 认回同会话不可变表记录；run 请求还核真实 caller 的 session/runId/attempt、报告 category/filledAt。核 record/table 的壳、basedOn、完整 E/O、filledBy 用途及所需条目确在该表 composition；对 reuse 核其原 E/O 与实际收窄子序列。EIS 自己再经真实 MF readHistory 核原记录及元组，不能把任意 typed DTO、最近 E 或 given 根证明当成该表的正文读取资格；AR/入口前置与 source 真实回读缺一不可 |
| 租户与当前资格 | 传显式 session 和真实 STT 得到的 tenant；source owner 在任何 MF IO 前再核 holdingTenant，归属不等／未知／不可读即拒绝。随后真实 MF 关联通过，才在 EIS atomic 内核 OG 实际当前有效资格/调用许可并读版本。跨 tenant、不明归属或当前资格无效拒绝；捕获角色不是许可。**不以当前仍持有该资产为历史读取必要条件**，否则无法满足旧报告恢复；读取资格来自已核表/报告用途，不能因此扩张为任意旧资产读权 |
| 真实正文 | 从已持久发布的同一资产、精确不可变版本取原 AssetContent；核 capability/类别/版本相等，使用同一 AM3 judge 与 AE4 defaultBodyContracts／各正文 owner 的实际判定。draft、latest、current 自动选版、原 E.values、空正文均不可替代。当前已换其他资产或已不持有时仍读原版本；这项历史正文读取不重新 evaluate/C16 改掉报告所依表 |
| 观察与失败 | source 内权限、租户/资格及版本来源所需一致性由其采用设计兑现，和 MF readHistory 不冒称同事务。输出严格无损的自有正文；缺失、不可读、损坏或前置无法核实沿重建 unavailable，程序缺陷另外抛出。不得以成功空值或读取新版本解除缺口 |
| 装卸 | source owner 定义并实现构造、准入、在途集合与 close；应用拥有唯一 reader，registry 借用到实际读取完成。先 registry close 等调用结束，再 source close，最后关闭其借用的 MF/storage/治理/STT。MF 依赖换代时装配显式重建 reader 并传新实例真实 readHistory，不让新 registry 无声复用旧关闭 MF 句柄；旧已受理读按其原实例真实结果收场。新调用遇已 close 按明确不可用收场，取消等待不等于读取停止 |

fill/reload 新表正文与历史重建的来源各自具名：前者可利用同次可信实际输入已经取得的精确版本，缺少的不得从 E 补；后者按上述表绑定授权读取。单独把发布时的正文 map 留在验收应用内存，虽能让纯构表通过，却不能算重开后的真实恢复证据。

## 状态、共同提交与缓存发布

本节点只持有停止标志、已受理 Promise 集合、有界会话工作队列和可重建缓存。MF 是唯一耐久事实，不增加来源表、JSONL locator 或 EIS 装配字段。原 R-M1～9 全部继续；下表映射 MF4 [共同对象](../../assets/assembly-manifest-store/v4-design.md#依赖存储要求与交错)，具体数据库由存储 provider/装配决定。

| 要求／契约坐标 | 存储性质与共同对象 | owner 与交接 |
| --- | --- | --- |
| R-AR4-1：S-17/S-18/S-22/S-48.5；R-M1/2/3/5 | given/mint/reuse 的完整 E/O/filledBy 与全部目标表一起进入 `assembly_manifest_record(session,seq)` 及其 `assembly_manifest_table(session,seq,category)`；一次提交全成全败 | manifest.append 唯一物理写者；新旧 registry 实例、full fill/reload/收窄皆经它，互指 R-AMS4-2/3。来源证明就是该 given 原 record＋六表，另无来源提交 |
| R-AR4-2：S-17/S-22⑦/S-23/S-51.4；R-M1/2 | expectedHead 判定和追加共同事务，同会话哨兵＋parent 主键排序；given 引用同库 owned_ref 全局唯一；reuse 只认同会话已存源 | R-AMS4-2/3；进程队列只能减碰撞，关闭队列后仍成立。parent/table 失败由 MF4 按语句阶段收口，registry 不吞冲突后自行写半张 |
| R-AR4-3：S-6/S-25/S-33/S-51.1/2；R-M4/6/8/9 | readHead 自身一致；readGiven 在其单次 ReadTx 固定实读范围、显式 H 及完整不可变 record/tables；历史 category/filledAt 唯一，不能把读不到当无记录 | R-AMS4-1/4；两个公开读并非一个事务，H＋只增不可变历史建立关联。核完整给定用途仍归 AR，不要求 MF 解释 assembly |
| R-AR4-4：S-18/S-32/S-33/S-48/S-52；R-M5/7/9 | 无损严格 JSON、记录只增不改、进程重开后保留已确认提交、故障可识别；表旧正文由相应 source owner 另保证 | R-AMS4-4/5；沿 D-027 实际耐久边界，不提升为断电无损；MF 历史存在不证明正文可读 |

**发布先后。**append 确认 committed 后才替换可见快照；given alreadyRecorded 按真实当前六表判幂等，不当作新提交。保留缓存时，候选缓存条目以真实 readHead 的 H 或已确认记录 seq 为标签，完整候选快照先在调用自有空间建好，整项发布；同实例较晚完成的旧 H 不能覆盖已经发布的更高 H。后续 session 读必真实对头，不能用内存单调数代替存储读。每个操作保留自己取得的不可变 H 视图；共享缓存已更新不改变进行中 refresh 或报告历史读取。旧 fiber 的结果不写新 fiber 的缓存。

**结果未知。**已知 headMismatch 才沿原配置有界重做（旧“一次”仅是默认配置初值）；耗尽/队列满按已采用 unavailable 收场。mint/reuse 回执未知不自动重发、不更换引用重试；返回未确认失败不能断言零写。后续真实读头/历史反映已提交事实，但 readGiven 不给 mint 新幂等键。given 只有持有原请求时可按 S-22⑦认回；当前六表被替代仍 evaluationSuperseded。所有故障观察须区分未写、已知提交和未知，不把诊断当回执。

MF SQL 与 EIS `evaluation_input_head(store_key)`／源行之间无共同提交对象，故不承诺同快照；EIS 内本地发布/当前资格的事务保证归 EIS。MF SQL 与 sessionLog JSONL 亦无共同提交；markFailed 前日志成功、之后崩溃或 MF 失败时，不回滚已记失败，不自动假造后续删表。

### 必须实跑的交错

- **两个实例同 H：**旧 reload 取得 H/F1，另一实例 full fill F2 提交 H+1；旧 mint 在共同哨兵/parent 处 headMismatch，整套重取才可再提交。禁掉队列后仍如此；只改 expectedHead 的负控必须失败。
- **只读固定 H：**refresh 先得 H 表，新 full fill/reload 提交 H+1，再执行 readGiven(s,H)；仍取 F1、报告仍指 H 表，根未漂移可成功，无末尾重核。若 EIS 此时实际当前根已漂移则真实 C16 收 unavailable，不能靠扩大 H 修好。
- **全局引用竞争：**两会话 given 同 ref，虽会话哨兵不同，仍在 owned_ref 唯一约束相遇，至多一方提交；不存在两份合法来源。
- **历史与发布倒序：**F/E0→tool mint E2→旧 slash_command reuse E0，重开后旧表 E0、readEvaluation E2、readGiven F 三者并存。另让较旧的缓存构建晚于新头完成，不能把当前缓存退回旧值；报告仍可读自己的旧表。

## 成对装载与撤除

| 取得资源或贡献 | owner／何时可用 | 部分失败 | 撤除、实际静止与仍成立事实 |
| --- | --- | --- | --- |
| 纯构件与不可变配置 | 本实例拥有校验后的副本；可独立函数采用 | 配置/制品不合要求则不 provide | 无 IO 清理；已交出的自有值不随卸载变异 |
| `assetRegistry` 闭包与服务 | 本 fiber，manifest/clock ACTIVE、构造通过后提供；应用通过真实 guard 后才开放入口 | 所有已取得本实例资源统一收口，不发布半就绪服务 | 一个组合 effect 先关新准入；旧引用之后调用 unavailable；技术 close 幂等、等待已受理操作完整收场 |
| 队列、在途 Promise、H 视图与缓存 | 本实例拥有，进入首个异步依赖前登记 | 正常拒绝/异常都有等待者；不得清队列遗留 Promise | 已受理调用跑完各自真实读/追加及失败映射，晚提交照实保留；结束后释放缓存。取消等待不等于底层事务停止 |
| MF、clock、STT、EIS reader、桥、正文/权限读者 | 其 provider 或应用拥有；registry 每次取得后借用到该调用结束 | 缺源按对应拒绝，不关闭别的服务“回滚”本次构造 | registry 不 close 借用对象。应用先停入口并 await registry，再 close 自己创建的 EIS reader/其他 provider，实际事务结束后最后关闭 storage/clock |
| 诊断与故障端口 | 应用拥有有界接收端；本节点仅发结构化事件 | 构造配置错误启动失败；运行期诊断故障经独立端口显露覆盖缺口 | 不拖出无主后台工作、不提前声称 resourceEnded；应用收诊断端口在业务调用结束之后 |

不新增业务事件、提醒、治理通知监听或自动会话枚举；onAssetChange 的定向转发仍归装配。旧报告是调用方的不可变值，卸载不删除它或对应历史；如果调用方丢失报告，重建表不等于恢复报告，崩溃后同 runId 再 start 仍沿 S-24⑦/G-15 的既有例外。

Cordis 机制逐条依据：[inject-has-no-optional-form](../../../../basis/cordis/inject-has-no-optional-form.md)（必需 inject／按需取可选面）、[plugin-body-reruns-on-provider-change](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)（依赖换代重跑）、[plugin-throw-fails-fiber](../../../../basis/cordis/plugin-throw-fails-fiber.md)（非法构造配置）、[effect-disposal-concurrent-not-ordered](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)（多个 disposer 不保证顺序）。这些已有 probe 不代证本组合；`provide-is-effect-managed` 仍无对应 basis 条目，保留**待核对主张**与真实宿主义务。内核不保证取消在途 JS/数据库，应用必须等实际 completion。

## 可观测性与实际证据

沿 [全局可观测要求](../../../../foundation/observability-and-logging/requirements.md)，生产与故障验收共用结构化边界：operation、provider 修订、已核 session/tenant/run/attempt、实际 H、选定 given seq/ref、固定/实际所选 asset/version、源修订（仅依赖实际返回时）、阶段与操作结果、expectedHead/实际追加结果、调用/资源结束。字段尺寸、队列、采样和保留由装配显式配置；不输出正文、references/attributes、完整 E/O、完整输入/持有/配值、秘密或任意异常 message。

记录来源核对拒绝、原给定认回、EIS 原因到 AR 失败、headMismatch 整套重做、未知回执、报告 H 保持和历史重建失败，诊断只是旁观事实，不补正式返回字段/来源定位。分别测 MF 读取、EIS 实际源读取、EIS 准入 evaluate、registry evaluate、正文重建、依赖/桥读取、追加及队列等待的次数和耗时；不把 JS 回调进入当 SQL 锁已取得，也不自报未测的性能阈值。观测失败不改变 already committed/unknown，不吞原缺陷。

## 关键选择与代价

| 选择 | 落选方最强论证 | 本方弱点／复查信号 | 置信度 |
| --- | --- | --- | --- |
| 一插件、必需 MF/clock、其余窄面按需借用 | 拆读写可独立热换；全部必需能少处理缺席分支 | 一个依赖变更重跑全部服务，可选端口失败矩阵较多；需真宿主演练 | 中高 |
| readHead(H)＋readGiven(H)，AR 检完整用途 | 最新 E 或 EIS creation 已可用、少一读；MF 直接懂 assembly 可少一层检查 | 多一次完整记录读及双层校验；真实读取成本待测 | 高：S-51/MF4 明确分工 |
| reload CAS 整套重取，refresh 保留固定 H | 所有操作末尾重核最新头实现看似统一 | 两种并发流程不同；refresh 可观察旧表与之后的当前源，必须可解释 | 高：S-51.4/5，不另定新鲜度 |
| 纯函数与实际来源/提交分开 | 有状态大类或 branded DTO 可减少参数 | 显式依赖与前置较多；函数测试不能代替真实来源证据 | 高 |
| 清单单权威、完整准备后追加发布 | 自有表/JSONL locator 查询更直接 | 历史正文重建有成本且缺源可失败；需保持来源 owner 的公开窄面 | 高 |
| 显式 caller O、严格深 JSON、失败显露 | 自动排序或普通 JSON 更易接线 | callers 需提供 O，精确数/深复制有成本；不能靠静默修补降低成本 | 高 |
| 不缓存跨调用权限判定 | 缓存能减 slash_command 高频现求开销 | 热路径成本未测，先完成 A-8 量测；需新失效依据后才能优化 | 中高 |

## 归装配、缺口与停止线

`apps/model-request-acceptance` 负责真实 account/OG/STT、EIS 发布/recipe 捕获、MF4 迁移与依赖 ACTIVE/升级 guard、caller 的 session/tenant/run/attempt 身份、真实 evaluate＋显式 O、完整 fill/reload/refresh 消费、报告传递、正文来源、日志后 markFailed、有界策略与诊断、实际停止顺序。应用不得填固定成功 E/固定 tenant/固定 sourceRef 替代 producer；有真实发布也不自动获得读取其他租户的资格。

| 缺口 | 条款／受阻消费 | owner 与关闭条件 |
| --- | --- | --- |
| AR4-G1 | D-079 已接受 AR4/MF4/MF4 provider；本稿尚待采用，MF4 readGiven 与本节点尚未交付；全部新来源消费 | 主线独立评审/采用本稿；MF/registry 实施者完成 V4-1～15。MF3 与 EIS 各自组件通过不代证 |
| AR4-G2 | S-22/S-31/S-51/S-52 真实 E/O、六表原 given→固定源链；D-077 SI-G1 与旧 OF-G1/2 | D-079 已接受公共定位和观察范围，只有真实 producer、readGiven、用途核验、EIS/AE4 及重开/并发证据后才关闭实现缺口；不能仅凭本稿成文关 SI-G1 |
| AR4-G3 | S-7/S-20/S-25/S-26/S-33 的所有类别正文、历史版本重建和门控现读来源；旧 A-2 的剩余部分 | EIS/source owner 起草并采用上述 `./registry-history` 增量，registry/装配真实接线；本批必验旧报告与当前不再持有的旧表正文成功恢复。EIS ./registry-inputs 只覆盖既定 reload/refresh fixed-root 用途。正确 unavailable 仅是失败分支，不能算完成该成功交付 |
| AR4-G4 | S-8～S-12/S-24 的 workspace/shared/MCP 动作来源、正文构件、自报/有效模式/meta 分类；原 G-6/G-7/G-9 | 相应 source/bridge/meta/装配 owner；本轮可验明确无挂载 workspace、无 MCP 动作、已支持本机源。不能清掉实际存在的未支持来源让场景通过；完整分支待真实提供者 |
| AR4-G5 | S-27/S-28，G-3/G-14/G-15/G-17、旧 A-3：产品通知转发、下一 run 完整装配触发、报告跨崩溃 | apps/cli、Agent Loop/PF-004 owner；本稿不补产品政策。表历史可重建不等于报告持久，不越权枚举会话 |
| AR4-G6 | S-17/S-18/S-31～S-33/S-52：并发、未知回执、真 Cordis/close、诊断与成本；旧 A-8 | registry/MF/EIS/storage/验收装配执行真文件库、真实主机、故障及制品边界测试，source-check 核提供与收口；无新 bindings |

验证入口为 [v4 义务](verification.md#v4-完整增量的证据义务)。本稿不修改 bindings；全部新义务尚未执行。旧采用范围与旧证据原坐标保留；本稿完成只表示可送独立评审，不表示接受或产品验证。
