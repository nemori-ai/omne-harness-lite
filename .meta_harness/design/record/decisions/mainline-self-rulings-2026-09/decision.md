# D-040：主线在自驱授权下的自定裁决汇编（2026-09-23 夜～2026-09-24）

**性质**：产品负责人 2026-09-23 晚授权「自驱推进计划全部阶段；真正待裁的单列；过度设计与过早复杂度剔除；经调研或 subagent 讨论后能裁的自决」。本记录把这段时间主线（设计主会话）在该授权下作出、并已落进候选契约或产品正文的裁定**逐字**汇编（原文来自任务区账本 `tmp/assets-runtimes/pending-user-rulings.md` 与简报 `briefs/spec-revision-2-2026-09-24.md`，落盘时不改写），使契约里「主线裁定，待产品负责人确认」的依据在设计链里有持久落点。

**接受状态**：这些裁定**由主线作出、产品负责人尚未逐条追认**；契约据此起草不等于契约被接受（G4 仍留产品负责人签字）。产品负责人当场裁过的（U-1～U-6、复制/分享矩阵、U-24-1～6、PF-002 D-2/D-3/D-4、PF-007 D-3、G3）不在此处，归 [D-039](../assets-runtimes-split-and-rulings/README.md)。**被后来的用户裁决或后续决定推翻的项，以推翻它的那条为准**；本记录只追加不改写，推翻情况在末节登记。

**怎么引用**：契约条款写「主线裁定，见 D-040 §<小节> <编号>」并链接到本文件对应小节锚点；追认或推翻后由后续决定取代对应编号。

## 一、2026-09-23 夜自驱期间的自决（账本 §二原文）


### 块 A 形状（`shapes-draft-assets-v0.md` A1–A10）

| # | 裁定 | 推理 |
|---|---|---|
| A1 | **要资产记录号**，与能力标识并存 | 同一标识在出厂/组织/租户/工作区可各有一份实现，持有必须指到「哪一份」；只有能力标识指不到，只有记录号丢了「是不是同一个东西」 |
| A2 | 本程起 **skill 包、MCP 接入点、斜杠命令、connector** 四份数据契约（connector 原判「只给形状条款」，S21 简报改为小契约 `data.connector`，已起草合回：asset-model 的壳要有可 `$ref` 的家，一节放不下四个 `$defs` 与拒绝值）；agent_definition 引 PF-004、不起 | 交付边界要求 Skill/斜杠命令/MCP 可独立运行；connector 本程无消费者，只给形状 |
| A3 | 属性声明**从各类正文推出**，`AssetDefinition.attributes` 只是缓存不是权威 | 显式列一份会与正文漂移；八类各自契约给「属性项投影规则」一节 |
| A4 | MCP 凭据 = 持有上一条配值，值为**不透明凭据引用**；凭据本体存储归块 A 提供者设计 | 明文进配值会随求值结果四处流；U-1 不挡 |
| A5 | 设置层序「会话」那格：求值输入带可选 `session: AttributeAssignment[]`，值归会话记录（PF-015），**写面本版只有会话创建参数**；其它写面留 G（owner PF-015/PF-016，技术缺口） | PF-002 §5.8 列了会话级且「不外溢」；PF-015 未定义写面，不替它发明 |
| A6 | 求值链**触发 Alloy**（团队资产不出那棵树、锁截断、禁用析取、工作区滤权四条） | 计划 §阶段 4 已列；四条都是结构性质 |
| A7 | 复制血缘用**系统血缘号**，不暴露源记录号 | 目标组织不该拿到能推出源组织的引用；PF-003 只要求「谁、何时、第几版」 |
| A8 | 承载目录 = `<dir>/.omne/workspace.json` **一份清单显式列举**，不扫目录；滤掉的权限/落点/immutable 项读入时留可见记录 | 计划 §阶段 2 明写「本程定，不问负责人」；显式列举最小且可审 |
| A9 | 注册表**按类别一张**，`omne-official:reload-<category>`；plugin 那张刷完连带成员类别 | 产品原话「命令、技能、plugin 各住一张」；按消费者分会与八类正文重复一套枚举 |
| A10 | 热更新对进行中运行的呈现时机——**留缺口 G**，owner PF-004 | 产品未决，不替他定 |

### S1（content-blocks）报回的

| # | 裁定 | 推理 |
|---|---|---|
| S1-a | **不跨契约 `$ref` identity-values 的 `OpaqueIdentifier`**；各契约按 S-31 散文自定义（S2 与 governance-center-entry 的做法）；对齐时改 S1 | 那一版已冻结且自述「不单独被引用」；开 v2 只为公开一个 `$defs` 是版本噪音 |
| S1-b | 嵌套工具结果里的 `callId` 只作记录、不配对 | 产品未给嵌套结果用例；不配对是最小承诺 |
| S1-c | PlaceholderReason 拆 `backgrounded_auto` / `backgrounded_by_user` | PF-006 §6.7 那行原文就是「自动 / 用户手动切」两种 |
| S1-d | **G-2 → 产品补一行**：PF-006 §6.7 占位原因表加 `run_cancelled`（运行被取消而执行还在前台） | §6.12 与执行收场词条都把它列为中断触发源，原因表漏了；借用 `user_interrupted` 会把「系统取消」与「人打断」混成一格，卡片与排查都分不开——只有加行自洽 |
| S1-e | **G-3 → 产品补一条**：参数收齐但解析不了的工具调用，**调用块保留原文、不执行、结果块记 `failed` 并回给模型**（PF-009 §5.x / PF-006） | 半截调用「两边不给」是为流被掐断设计的，那时运行已停；解析失败时运行还在转，模型必须看到才能改——业界（Claude Code、Codex）一致做法就是回一条错误结果 |
| S1-f | 无词条概念：媒体类型、附件引用所指、占位原因、来路标记——**立四条属性词条**，随对齐波一次做 | 都跨 topic 且误读有代价 |
| S1-g | PF-013 转换件：一个文件块同时命中「模态」与「媒体类型」两键 → **媒体类型键优先、只出一份派生表示**；只交 transcript 不交派生块**非法** | 特定压过一般是唯一不产生两份 transcript 的读法；PF-013 原话输出恒是「块 + transcript」 |

### S2（call-accounts）报回的

| # | 裁定 | 推理 |
|---|---|---|
| S2-a | `input_tokens` 与 cache_read/cache_write **两两不相交** | 否则派生量重复计 |
| S2-b | 工具执行补账覆盖**自有部分**，不覆盖含镜像的总额 | 同一笔模型费用不能被两条补账各改一次 |
| S2-c | `unknown_with_source` 推广到 Cost/CostItem；`malformed` 覆盖组合约束；五个拒绝值有判定次序 | 同一逻辑、同一输入同一答案 |
| S2-d | **G-3 → PF-012 I-11 收窄**：「运行终结之后不再**发起**新的成本产生动作；已发起的账目（补账、后台工具的收尾）仍可在终结后落账并归该运行，标 `late`」 | 原句与「按 Run 汇总成本」直接相抵——后台工具在运行终结后结束是产品明写的路径；只有收窄 I-11 自洽 |
| S2-e | `CostItem.service` 与 MCP 接入点 CapabilityId 的对应：`service` = `"<category>:<name>"` 的规范串，写进对齐 | 一个字段、一个规则，不另立结构 |
| S2-f | 「一次发出」立属性词条（随 S1-f 一批） | 全文拿它当账的单位 |
| S2-g | Q1/Q2/8a–8h/Q13 等口头裁决**落一份决定记录** `record/decisions/message-and-shape-rulings-2026-09-23/`，逐字引 g1-rulings | S1/S2 都报「契约无处可链」 |

### S6（model-profile）报回的

| # | 裁定 | 推理 |
|---|---|---|
| S6-a | **官方档案的引用**：`ModelProfileRef = oneOf { origin: official, routeName } \| { origin: custom, scope, routeName }` | identity-values S-11 刻意不含出厂层且禁止消费者补；官方名对所有层保留（Q11）使 `{official, routeName}` 足够唯一——唯一不与冻结契约相抵的形状 |
| S6-b | 撞名判定：名字在**全部档案（所有层、含已撤回行）中唯一**，码点逐字、不折叠大小写、不判相似字；新官方件撞现有自建名同样拒建 | Q11「拒建」的直接推广；相似字判定是过早复杂度 |
| S6-c | 上游把 maxOutputTokens 降到档案参数之下：不改档案，发出时按「改值留痕」处理 | 档案是创建者的声明，运行时留痕即可追溯 |
| S6-d | `inputModalities` 必含 `text`，拒绝值 `input_text_missing` | PF-013 全文以文本为底、聊天目标皆收文本 |
| S6-e | 请求参数合并：拓展件覆盖**按项**替换档案值，限额在合并后校验（写进 model-request-runtime） | 唯一不丢档案默认又能覆盖的规则 |
| S6-f | 「合法目标集合」「展示列表」「官方档案/自建档案」「在册/已撤回」立词条（随对齐波） | PF-013 §四已定义，只是没进词表 |

### S5（tool-definition）报回的

| # | 裁定 | 推理 |
|---|---|---|
| S5-a | 多命令 `input` 生成规则改判：**顶层 `oneOf` 每命令一支** `{command: const, args: 该命令 input 原样}` | 简报原形状（`args: oneOf`）不把 args 绑到所选命令、命令 schema 相交时误拒、放不下各命令 description——drafter 举了反例；仍是一个条目一份 schema 带判别，Q5 不变 |
| S5-b | `JsonSchema` 取值不 `$ref` 官方元 schema，条款写「须为合法 Draft 2020-12 schema，由实现校验」 | 检查器只解析 catalog 登记的 Schema；为一个 URI 改检查器是过早复杂度 |
| S5-c | 有转后台阈值但无后台许可的定义 → 拒 | 永远用不上的声明只会误导 |
| S5-d | `help` 就是文本字段，`Tools().inspect` 呈现它；不另设 help 命令空间 | PF-006 的「可选命令空间」读法与 D-031「内建 help 相反方向」相抵，字段读法最小 |
| S5-e | 七种形状错都归 `malformed`、逐条列 M-n，不增专名 | 与 model-profile 同法，同一坏输入同一答案即可 |
| S5-f | 命令 `input` 内禁止根相对 `$ref` 与 `$id` | 生成顶层 oneOf 后根已变；禁止是唯一不用改写 schema 的读法 |

### S8（model-response）报回的

| # | 裁定 | 推理 |
|---|---|---|
| S8-a | 回复在落盘前被否决（如转换件转不成）：响应体 `replyDisposition ∈ persisted \| vetoed{by}`，调用照常结束；「退避重试」= loop 下一次迭代另起新调用，**不加第九个成因、首 token 规则不加例外** | PF-013 §5.4 例外与 PF-012 落盘前否决明写「退避重试」；走新调用最省——运行时不用记「可再发一次」的特殊态 |
| S8-b | `upstreamModel` 可缺席；`attemptId` 是整数序号（UL-run-attempt：(运行, 第几次)，不另存） | 不填初值；词条原话 |
| S8-c | 共用标识的家：`ResponseId` 归 model-response；`RunId` `AttemptId` `ModelCallId` 归 **call-accounts**（它按尝试记明细、按 Run 汇总本就要它们）；到达信封 `target.model_call` 带 `dispatch` | 避免 call-accounts ↔ model-response 环；一次调用多次发出各有 finish/account |
| S8-d | 新增拒绝值 `failure_on_success`、`reply_ending_mismatch` | 一值一因 |
| S8-e | `replyDisposition` 凡 `reply` 存在即必带（含被用户中断但有内容的那支） | 中断的半截回复同样要过落盘前否决 |

### S3（messages）报回的

| # | 裁定 | 推理 |
|---|---|---|
| S3-a | `attempt_started.reason ∈ first \| resumed_after_interruption \| resumed_after_wait` | 账本原值对不上 PF-012 §5.7 任一原因 |
| S3-b | 后台收场提醒的结果 = 消息里唯一那块，`source` 不带副本 | 两份会分叉 |
| S3-c | 等待答复回来：答复落卡片、解除等待时追加一条提醒（PF-014 与 PF-010 两句都成立） | 卡片是记录不是消息、提醒才是消息 |
| S3-d | Alloy 工件：断言 UNSAT 才算无反例，退出码不作数；未能机判的先不登 formal task | 工具事实 |

### S7（loop-extension）报回的

| # | 裁定 | 推理 |
|---|---|---|
| S7-a | `stop` 加 `terminal ∈ cancelled \| failed`（缺省 cancelled）；循环守卫 L3 用 failed | 八种结论里没有能落「失败」的，加成员比加第九种结论小 |
| S7-b | `treat_as_veto` 在「之后」位置 ≡ `stop{failed}` | fail-closed 在没有可否决对象时只能是「不继续」 |
| S7-c | `ignore` = 只落日志；`record` = 落日志 + 下次组装注入「某件没跑成」提醒 | PF-012 原话「留它没跑成一笔」要对 agent 可见才有意义 |
| S7-d | 用户中断的模型调用不触发 after_model_call | 中断既不是收场也不是失败 |
| S7-e | after_terminal 不许 inject | 会让队列变非空起下一次运行，越权 |
| S7-f | before_persist_message 输入不带 run/attempt；stop 在 before_persist_message / after_terminal 不合法；rewrite 不改 `request.target`（只能 select_model）——drafter 推导采纳 | 产品正文原话；绕过合法目标判定的路必须堵 |

### D-033 推迟的 G1–G11（hooks 兼容层）

全部主线裁定，写进 S15 简报的表；要点：越档输出 = 报错按档策略；`ask` 用放行四档选项、`defer` 不导入；改资产的输出译 observed 留痕；路径不存在/落点不可用 = 不可用、非零非 2 退出/超时 = 报错、退出 2 = veto；每条 command 一件、系统放行判断钉 before_action 最后；子进程跑会话级执行环境、账形状留 G；**工作区来源的 command hook 导入默认禁用、租户层显式启用**（PF-002 §5.7「权力不从项目来」的唯一保守读法——这条是产品面，你回来看一眼）；Stop 无单独上限只靠循环守卫；非 loop 事件不导入；重导入 = 同资产新版本；钉 CC 2.1.280 / Codex 5c5308fc。

### 块 C 对账（D-reconciliation-c）「需主线看」八项

| 项 | 裁定 | 理由 |
|---|---|---|
| C-R1 | 档案快照落 model-response `route.profileSnapshot`（发出与重试消费的属性子集 + `updatedAt`），**不**给档案加修订身份 | 目录不存历史行，修订身份指不回去；快照跟着发出记录走最省 |
| C-R2 | 本版转换件**不得发起模型调用**（`convert` 是本地纯计算或本地识别库）；RP-7「落盘前调用没有宿主」的未裁项随之关闭 | 没有宿主方案前不开这条路；要调看图模型的转换件留到有宿主的版本 |
| C-R3 | 「同一步内连续被否决的调用上限」作为 loop 一程的运行时设置项，超限 Run 失败、原因指向否决者；本程只在 gaps 指路 | S8-a 让否决后的重试成为新调用，「试尽」只对 failure 维度，跨调用得有人判；归 loop |
| C-R4 | `interrupt` 按 callId 单次；插队时宿主默认只中断当前步主调用，挂件自己发起的调用跑完——PF-014/loop 补一句 | 接口最小；插队语义归 loop |
| C-R5 | 合法目标加输入「本据点传输能承载的模态」，落 S16b；档案登记不校验 | 否则语音档案进合法目标、出门才送不出、成因无处归 |
| C-R6 | U-1 影响面加模型凭据（已改 §一） | 两种凭据是同一道「组织层下不下发」 |
| C-R7 | `attemptId`／发出序号属于**每次发出**而非调用，跨尝试连续；对齐波核 model-response S-7/S-8 后改 | 调用跨尝试，按调用挂 attemptId 会在重试时撒谎 |
| C-R8 | 投影定义域「派生表示里的块不计」由 S17 按 PF-013 §4 复核，PF-013 有说法以它为准 | 机制推导不压产品原话 |

### S10（asset-evaluation）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S10-a | **设置按资产取值**（不按能力标识跨层跟随替换件）；权限仍按能力标识跨层取交集——改判 A-G2 里「设置项同理」那半句 | 按标识跟随，租户给官方 MCP 接入点配的凭据会跟到同名替换件上，凭据外泄；替换件要值得自己配 |
| S10-b | 权限层级计算：**只有带锁（immutable）的配值是约束，参与交集；不锁的是建议，内层覆盖外层** | PF-002 §5.4「组织说默认问一下，成员可改成自动」在纯交集下求出空集；这是唯一同时过 §5.4 与 A-G2 的读法。PF-002 §5.7/acceptance §三随产品修订批补写 |
| S10-c | Alloy 变异体退出码全 0 → 不登 formal task，证据留 verification.md | `alloy exec` 退出码分不出有无反例（记忆已有） |
| S10-d | 工作区清单读入的 `dropped` 只保留本版能产生的两种理由，删 `permission_item` 与 `placement_identity_setting` | 不给产生不了的值留位 |
| S10-e | 「禁用先于锁」使租户能在自己范围隐藏组织锁住的资产——**不改**，PF-002「禁用是逐层配的布尔设置，任一层为真即不可见」「`immutable` 不能配到禁用上」原文即如此 | 锁管的是替换与配值，不管可见性；改它是产品变更，无依据 |
| S10-f | 局部编号 C/P/E/M 与前提编号 `P-` 撞已登记的性质前缀 → 对齐波改前提为 `PRE-`；asset-model 依赖补登 catalog；G-1～G-15 余项进 S23 简报 | 对齐波统一 |

### S21（connector）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S21-a | 鉴权绑定**不进正文**（简报账本 `credential?: CredentialRef` 作废），只作持有配值 | PF-002 §4 Connector：鉴权绑定是每份持有各配、不跨租户身份共享；asset-model S-23 ④ 引用只在配它的那份持有上有效；进正文会随复制/分享带出组织 |
| S21-b | **投递目标也不进正文**：正文只留 `source?`（作者给的默认来源标识），`target` 与 `credential` 都是持有配值、无作者默认；未配 = 缺席（唯一拼法，与 MCP 接入点同） | 正文带 session 指认，官方/组织连接件给不出有意义默认，复制/分享会把源组织的会话指认带到别的组织 |
| S21-c | 权限项按 PF-002 原话：「能不能安装」「送进来的消息按什么身份处理」；简报的「谁可以用」「启用」作废（`disabled` 是 asset-model 保留项，正文契约不得声明） | 产品原话优先于简报 |
| S21-d | 会话引用的正式名：本程统一 `SessionRef`，家在 `data.messages`（loop 一程若立会话契约再迁） | 树里只有这一个定义 |
| S21-e | 附件落成哪种块：按 content-blocks 的媒体类型规则（image → ImageBlock、audio → VoiceBlock、其余 FileBlock）——S23 核 content-blocks 是否已有此条，无则补 | 两个接收实现不能各选各的 |
| S21-f | 连接件端点 → 接收方的交接（含 `externalAccount` 与凭据实际身份的核对）无契约 → 归 PF-014 入站那一程；「编辑过的外部消息是否同一事件」是 PF-014 产品缺口 | 本程边界 |

### S17（modality-projection）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S17-a | `convert(block, tenant)` 带租户身份——采纳 | SYS-TENANT + content-blocks S-23：读引用字节、写派生块都要带租户 |
| S17-b | 查登记服务面定名 `lookupConverter(key) → { registered } \| { unregistered } \| { unavailable }`（对齐波填入 S-19）；`toolModalities` 归 asset-registry 读 tool-definition 两端声明 | 工具结果那一端「转换件能不能兜底」要问登记表 |
| S17-c | 挂派生表示**不是 rewrite**：不改块序列、不改产生者的话；`before_persist_message` 对 producer=model 合法输出 = veto \| pass \| attach_renderings（后者仅系统转换件、装配钉死）——D-5 不变，loop-extension 可改成员表对齐波补 | 否则模型产出的图永远没有 transcript |
| S17-d | 系统转换件钉 `before_persist_message` 末位动块件；loop-extension S-33「不可用视作卸载」对系统自带件被 fail-closed 表压过（C-7） | 已发 S15 |
| S17-e | 只给人看的块（`toModel=false`）**不转、不进投影** | 不给模型看的块无需 transcript |
| S17-f | 不落日志的系统提示词里的非文本块：本版系统提示词只文本（PF-010）→ 产品正文补一句，非缺口 | 没有这种块 |
| S17-g | 一次转换的时间上界 = 拓展件时限（runner 运行时设置项），不单独立 | 同题不立两处 |
| S17-h | 契约身份沿用 `capability.modality-projection`，README 写明拥有「投影判定 + 转换件」两件 | 改名收益不够 |
| **提醒你** | 「转换件不得调模型」（C-R2）的代价：本版 transcript 只能来自本地识别，「让视觉模型替纯文本模型描述图」这条路本版没有 | 产品负责人应知 |

### S4（arrival-events + stream-assembly）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S4-a | 帧流里块的 `id` 由**工具侧宿主的帧入口**编（= content-blocks「装配那一方」与 arrival-events「生产的一方」同一处）——对齐波把两处措辞统一成「帧入口」 | 字面冲突，实体同一 |
| S4-b | call-accounts S-15 不等式改为「每帧至多计一次未送达」写成宿主前提（先截短再拒收只算一次） | 边界情形被算两次 |
| S4-c | 采纳 drafter 新增：`stream_not_finished`、`abandon` 交出账、`firstContentAt` 是位置并进快照与 ending、解析点在封口那一下、开着的调用块落半截 | 各附理由成立 |
| S4-d | 无参调用参数原文为空串 → 传输适配翻译为 `{}`，不落 `unparseable`（S16b 装配给表） | 上游习惯不该成为模型侧失败 |
| S4-e | 中途重进的观察者看不到此前砍过什么（快照不带砍汇总；汇总只在 ending） | PF-009 在途状态原话只列内容 |

### S18（skill-package）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S18-a | 五处偏离全采纳：不收 `resident`、不收 `permissions`、加 `body`、目标环境作 `settings` 保留项 `targetEnvironment`、保留路径名不自造 | 产品正文优先于简报账本 |
| S18-b | 定义记录保留路径 **`.omne/skill.json`**（与 A8 `.omne/workspace.json` 同一保留目录） | 一个保留目录 |
| S18-c | 「谁可以使用它」由 asset-model 保留为跨类别共用权限项（与 `disabled` 同法），项名 `usableBy`，取值域按 A-G14（租户角色枚举 + `self`），作者默认 `self` | 四类资产各一份会分叉 |
| S18-d | `executable: false` 常量删掉，改成条款「资源只读」 | 常量成员误导 |
| S18-e | 技能名不收窄到开放格式名字规则；`metadata` 非字符串拒收，外部导入由导入器先映射 | 已裁 S9-c；D-034 |

### 块 A 拆分提案报回的（推荐 B：core 纯模块 + 治理与流转一个插件）

| 项 | 裁定 | 理由 |
|---|---|---|
| PA-1 | MR-9「资产不存在」取「被移除或被删除」（从产品正文 PF-003 §6.14），SAF-1 共同存储对象锁记录行与持有行两者 | 正文优先于主线早先简写 |
| PA-2 | 提升时持有怎么变（INV-3）、个人组织清除时资产去向 → 产品修订批 PF-001/PF-002 | 产品缺口 |
| PA-3 | asset-transfer 对齐 MR-1：落地写成「同一提供者在确认的同一次提交内完成」（S23） | 已裁 A-M5 |
| PA-4 | 组织治理节点登记两项外部依赖：`lockSentinel('organization-governance/affiliation')` 与直接读 `organization.parent`（实现映射阶段） | 已裁 A-M6 |
| PA-5 | 入口契约 v1 路由表封闭 → 资产各面对外可达要出 v2（记入实现映射「归装配」事项，不在本程做） | 规格演进 |
| PA-6 | MR-1～MR-10 落一份决定记录 **D-039「块 A 拆分的主线裁定」**（待你签，材料就绪时列 G3） | 依据要有家 |
| PA-7 | 邀约类对象条目（复制通知、分享邀请、分享记录）与 UL-asset-holding 形态「属性」vs 持久行 → 对象条目复核批 | domain-objects 批 |
| **G3 待你拍板** | 领域名 `assets`；`packages/core/{asset-model,asset-evaluation}`、`packages/assets/asset-governance`；中心侧装入 `apps/tenancy-host`（名字与承载内容有张力，D-027） | — |

### 块 B 拆分提案报回的（推荐 C：按拥有者分领域）

| 项 | 裁定 | 理由 |
|---|---|---|
| PB-1 | **可独立运行装配无放行件**：验收用一个标明「非产品行为、只供本装配验收」的放行件（bypass：全放），不立 realization 节点、不进产品装配 | 你裁「不交付放行实现」；验收仍要跑通 |
| PB-2 | 注册表落 `tools`；asset-evaluation 落 `core`（纯） | 两提案对齐成一个答案 |
| PB-3 | `apps/runtime-host` 无 PF → 据点装配归现有 `apps/cli` 节点修订（PF-016 是它的 PF），「可独立运行」以验收场景装配体现（**G3 一并拍板**） | realization 准入「没有 PF 的应用不建节点」 |
| PB-4 | MCP 在途执行随桥换代落 failed（已发 S19） | 连接归桥 |
| PB-5 | 执行记录与会话日志同提交无共同存储对象 → 契约写「装配给」两种形状，提供者设计选（已发 S13） | 不在契约选机制 |
| PB-6 | reload 结果记进装配清单（已发 S22） | 否则重启改命令集 |
| PB-7 | 派发器与 hooks 兼容层归 loop 侧领域，领域名候选 `agent-loop`（**G3 拍板**；未拍板前按 B 全放 `tools` 并写搬迁触发条件） | D-024 先例 |

### S14（tool-admission）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S14-a | 三档 token 只有一个名：`ExecutePermission`（tool-definition 已有），账本 `ExecutionPermission` 作废 | 一个概念一份权威 |
| S14-b | 采纳推导：`answer`（四选项 id 或 `declined`）、有答复时第 ① 步照判、`verifyToken(token, call, session)`、凭据按「callId + 最终结论」指认、`unavailable` 失败值、五拒绝原因/四选项 id/四无效原因 token 由 drafter 命名（S23 核一致） | 各附理由成立 |
| S14-c | 放行到执行之间的窗口：照当时结论执行，不重判（PF-001 §6.6、PF-012「有结论的不重跑」）——产品面提醒你 | 正文已定 |
| S14-d | 放行判断件**不得被替换、禁用或收窄**：写成 PF-012「系统自带件」的例外条款（产品修订批），运行时 verifyToken 只认装配钉死的那一件 | 否则同名替身被认成真放行 |
| S14-e | 第四档（本租户）在组织收窄到不含「自动」时不出现（可行选项 = 与有效允许集合求交非空者） | 出现也无效 |
| S14-f | PF-008 flows「卡片生成失败仍停住并告知人」读成：停住 = 不执行（全拒）+ 告知人 | 两读法一致 |
| S14-g | 卡片答复的记录形状、授权写入（allow_session/allow_tenant）归 PF-008 卡片契约（后续程）；本程留 G | 边界 |

### 块 C 拆分提案报回的（推荐 A/A/A：目录独立插件·中心；运行时选择与调用同在·据点；模态转换独立登记表·据点）

| 项 | 裁定 | 理由 |
|---|---|---|
| PC-1 | 中心侧装配 = 现有 `apps/tenancy-host`（名字张力随 PA 一并 G3 拍板），不另建 `apps/governance-center` | 已有节点 |
| PC-2 | 「自建名在隶属树内唯一」**只在登记那一刻核**（撞名判定读当时隶属树）；隶属变化后同名并存被接受，不是不变量 → 无跨 owner 同提交，P1-A 成立；model-profile S-3 对齐波按此改 | 撞名挡写入不守恒 |
| PC-3 | 入口组合契约 v2（路由表开放资产与模型目录各面、凭据跨进程送达条款）与 PA-5 合为一波，实现映射阶段记「归装配」 | 一波出 v2 |
| PC-4 | P-3 整件不在时 runner 只否决含非文本模态块或文件块的消息（已发 S15） | 与 S17 S-22 同 |
| PC-5 | 「响应体」「切换事实」「传输适配」立词条；「档案目录」「在途表」「锚点记录」不立 | 词条批 |
| **提醒你** | 三份提案（A/B/C）的推荐全与主线早先裁定同向；按记忆规则只对「改票条件近」的对象开三票（S24 模板）：拟只开 **P-1 目录 A vs B′**（U-1 判乙时 B′ 会翻）与 **块 B 注册表 tools vs assets**，其余直接采纳 | — |

### S20（slash-command）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S20-a | 不认得的名字 = `unknown_command`、当场明说不发送（简报「当普通文字」作废）；`$N` 自 0 起（照 Claude Code 2.1.280） | 产品原话与上游行为优先于简报 |
| S20-b | 引号未闭合 reason `unterminated_quote`；位置区间与识别结果立 `$defs` `Span`、`Recognition`；「谁可以用」= asset-model `usableBy`（S18-c） | 账本补名 |
| S20-c | 留痕块**不是第八类块**：以 content-blocks S-8 来路标记表示（来路加 `slash_command_expansion` / `slash_command_record`） | 不动「恰七类」 |
| S20-d | PF-002 把「参数声明、参数提示、绑定目标」列为设置 → 产品修订改为正文成员，参数提示 = `ParameterDeclaration.hint` | 它们不随持有配值 |
| S20-e | 命令与交付面动作不相交、无优先级（PF-016 decisions）；名字词法与「谁可以用」两项主线裁定进 D-039 汇编 | 依据要有家 |
| **提醒你** | 两处面向用户的后果（PF-016 已定，未改）：以空格开头的 `/xxx` 按普通文字原样发出；「/tmp 满了」这类日常话被判 `unknown_command`，要写成 `//tmp 满了` | 产品面 |

### S22（asset-registry）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S22-a | `onAssetChange` **只收窄**（去掉被收回权限/被移除/被禁用的条目），不做等价 reload 的全量重填；主线早先「权限收回触发 reload(slash_command)」（R-B3）作废 | PF-002 §4「①② 型增删禁用不自动改进行中的会话」；正确性靠读时现读，通知只是加速 |
| S22-b | `markFailed` 只去掉失败那一条、同步生效，不做全量重填 | 同上 |
| S22-c | `filledBy` 加 `asset_change`；`unavailable` 沿用 organization-governance 收场名 | 账本补名 |
| S22-d | 可用性变化**不出提醒**（B-M04 作废）：PF-012「每一次尝试开始不必额外告知」现文优先；agent 靠 `Tools()` 读到 | 正文优先 |
| S22-e | 重启重建按装配清单记下的构成与那一版正文重填，不以此刻持有重跑求值；正文取不回的那一类收 `unavailable` | PF-015 §6.11 |
| S22-f | 关掉的命令被调用 → 执行运行时落 `failed{cause = 注册表可用性原因}`（已发 S13） | 不新增收场值 |
| S22-g | 装配清单的追加面与 reload 记录形状归 PF-004 契约（后续程）；热更新对进行中运行何时可见（A10）留 G | 边界 |

### S19（mcp-endpoint + mcp-bridge）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S19-a | 动作清单副本、OAuth 绑定、凭据都**按持有存放**，不进正文（A-M11「读正文里的动作快照」改判为「读持有上的副本」） | 副本由某租户的连接取得、不跨租户；正文跨持有共享 |
| S19-b | 四个新失败值 `callTimedOut` `oauthNotApplicable` `dependencyUnavailable` `bridgeWithdrawn` 与 `oauthDenied` 四来由合一——采纳 | 各附理由成立 |
| S19-c | **工作区来源的 stdio 接入点默认禁用、租户层显式启用**（与 command hook 导入 G7 同一条规则：权力不从项目来，PF-002 §5.7 / PF-005 §6.2）——**产品面，你回来看一眼** | 否则克隆仓库 + 开一次尝试 = 在宿主机跑仓库写的命令 |
| S19-d | MCP 条目对「实现被撤下不影响在途」（C-B-M9）开例外：桥换代在途落 `failed{abnormal_interruption}`；content-blocks S-18 该来路加「桥换代」（已发 S13；S23） | 连接归桥 |
| S19-e | MCP 动作的两端模态声明 = 桥从对端描述投影（`projectActions`），投不出即「任意」，tool-definition S-24 对 MCP 条目按投影结果判 | 否则每个带图 MCP 结果都「违反声明」 |
| S19-f | 凭据保管方无契约 → 实现映射阶段作装配给（`infra/secrets` 候选节点）；求值交出 `provenance`（来处层）→ asset-evaluation 输出补 | 边界 |
| S19-g | 多据点下 OAuth 凭据**跟机器**（PF-016「每台机器只有自己那把」）；明文 http 本版不禁（记产品缺口）；rug pull（对端动作描述变化）归 PF-007 后续 | 正文已有／产品缺口 |

### S15（loop-extension-runner + hooks-import）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S15-a | 采纳推导：一次经过由（会话, 位置, 维度, 锚）指认、注入链只一层、`manifestMissing` 不当空链、`replay(run)` 不带 attempt、`selectModel` 并进 `proceed.subject.request.target`、转换件取整链末位、`degraded` 带资产、删 `skipped{defer}`、14 个降级 token 由 drafter 命名（S23 核）、`unavailable` `attemptSuperseded` 两失败值 | 各附理由成立 |
| S15-b | **兼容件载荷的家**（阻断项）：data.loop-extension 下一版 `LoopExtensionDefinition.implementation ∈ builtin{capability} \| command{command, matcher?, timeout?, host, dialect}`，asset-model 的 `loop_extension` 壳 `$ref` 它 | 没有家兼容件跑不起来 |
| S15-c | **回放要建行为模型**（改判简报「不触发」）：runner 的回放、先落后算、只跑一轮是自定义恢复协议，按手册门槛建 `Runner.tla`，对齐波后单独派一小任务 | 手册：自定义恢复协议要建模 |
| S15-d | tool-admission S-29「不可用时每一项都落 veto」与 runner「不可用记录不带 output、靠效果得 vetoed」统一为后者（S23 改 tool-admission 措辞） | 一个读法 |
| S15-e | 钉末位与「自带的不享受特权」：按 R-B9 写成装配清单排序义务；放行判断被收窄到 veto 以下的漏洞由 S14-d（不得替换/禁用/收窄）关闭 | 已裁 |
| S15-f | G7 禁用配在**租户层那一格**（析取合成，配组织层租户开不回来）；导入来源由导入者声明、资产治理不核实（本版） | 析取语义 |
| S15-g | PostToolUse 干预力按研究「可改写」（简报 G1 表写错） | 研究优先于简报 |
| **提醒你** | 兼容件复用四档选项后，人会在同一动作上看到两张同名不同含义的卡（一张带授权、一张不带）——PF-008 产品面 | 产品面 |

### S16（model-profile-directory + model-request-runtime）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S16-a | 采纳全部推导（范围链以 TenantId 为锚、发布序号与 `manifestNotNewer`、清单撞名只拒那一条、`officialProfileNotWithdrawable`、`notAuthorized` 不细分、registerProfile 同内容认回、读面不返 `CredentialRef`；`ResponseId` 在「已出门」时定、带回复的响应体由调用方写、对账表加三行、`wrongPhase`/`releaseCall`、默认件「下一家、每家至多一次」） | 各附理由成立 |
| S16-b | 「已终结」只用一个值：dispatch 类操作对已终结调用返回 `alreadyEnded`，`retryRefused{why}` 去掉 `call_ended` 支 | 一件事一个名 |
| S16-c | `ModelCallRequest`：`callId?`（缺席 = 新调用，给出 = 续接）；成员名统一为 `parameters`（与 loop-extension `ModelRequest` 同名，`parametersOverride` 作废）；工具清单用 `CapabilityId[]`（`ToolDefinitionRef` 作废）；加 `targetChangedBy?: CapabilityId` | 账本自相矛盾处取一读法 |
| S16-d | 运行时写的五种日志记录（已出门、已开口、中断意图、调用终结、切换事实）的家 = **data.messages 下一版**新增日志条目种类（与 `attempt_started` 同族），不另立契约 | 它们是会话日志的事实 |
| S16-e | 目录加两个写面：`unbindCredential(scope)`、`updateProfile(profileId, patch)`（只改 MP S-12 允许的属性；路由名不可改，改名 = 新登记 + 撤回旧的） | 没有写面等于永远改不了 |
| S16-f | 官方档案出门用的凭据：出厂格可有**一把由部署装配配置的凭据**（PF-013 §5.6），C-12「出厂无」改判为「出厂格的那把由装配给、不可经写面改」 | 正文优先 |
| S16-g | 首 token 之后停机 = `interrupted{runtime_lost}`（PF-013 §5.13「说到一半断了」是同一件事的措辞）；不允许回退的档案默认件**同家至多重试一次**（保住 §5.12「开箱就有重试」）；展示列表按 §5.10 公式；`unrecognized` 归策略类（flows §2「不能重试」改） | 产品修订批四处 |
| S16-h | RP-22 改判后隶属合并破坏唯一性的风险由 PC-2（唯一性只在登记那一刻核）吸收，不动 org-gov | 已裁 |
| S16-i | 宿主停止前先 `interrupt(run_cancelled)` → loop 一程；「范围允许」的输入 = asset-evaluation 输出里「用哪个模型」允许集合 → S23 | 边界 |

### S13（tool-execution-runtime）报回的

| 项 | 裁定 | 理由 |
|---|---|---|
| S13-a | 注册表判为不可用的条目被调用 → **一律落收场 `unavailable`（别重试）**，不用 `failed{not_available}`（S22-f 改判）；`stand_in` 与 `unavailable{reason}` 两支同归此 | PF-006 §6.3/§6.13：连不上装替换件、落 unavailable，failed 会让 agent 重试 |
| S13-b | 声明了 `offload` 的原始结果**由运行时总是 storeRaw**；卸载判定件只决定给模型看什么，它不可用时消息里只落引用、摘要缺席 | PF-006 §6.10「存着没丢」是运行时义务 |
| S13-c | 采纳推导：姿态 × 阶段两维、失败种类八值只在执行记录、`preempt` 原子且处置同批排队者、`notInBackground`、`callIdConflict`、`dependencyUnavailable{which}`、超时与阈值只计前台运行时间、并发按会话计、被拒费用记一条条目、违反声明落 `failed{result_rejected}`、单独中断后同批后续照起 | 各附理由成立 |
| S13-d | 工具执行被中断**不另补** interrupted 提醒（占位已承载）；messages S-21 对工具执行不适用 | 一件事一条记录 |
| S13-e | 进展任务（约 16 分钟）保留登记，例行 `FORMAL=run` 接受 20 分钟量级；不加机制 | 复杂度无收益 |
| S13-f | call-accounts 下一版：`ToolCallAccount` 加 `externalEffect ∈ confirmed \| unknown`、`stoppedAt?`、`late`（已列）；收场后到的费用走 `CostCorrection` | 三件事装不下 |
| S13-g | 执行记录与会话日志同提交：契约写两种承接形状不选（PB-5）；共同存储对象在实现映射阶段指认 | 已裁 |
| S13-h | 三个占位原因（`run_cancelled` `backgrounded_at_start` `terminated_by_agent`）进 content-blocks 下一版（已列） | — |

### 产品修订批（2026-09-24 凌晨合回 HUB `45ca6227`）留给你过目的 ⚑ 七处

product-design-drafter 把约 57 处裁定落进 PF-001/002/006/008/009/010/012/013/014（各升一 rev，PF-007/015/016 不升），每处在 decisions 里标「主线裁定 2026-09-23，待产品负责人确认」并附内核三问。它单独标 ⚑ 的、**改变用户看到的东西**：

| ⚑ | 内容 | 出处 |
|---|---|---|
| 1 | 展示列表只含合法目标和当前选中；出厂格可以有一把凭据；转换件本版不调模型 | PF-013 rev 9 |
| 2 | 单独中断一次回复之后，运行显示为「完成」（P30，PM 推导） | PF-014 rev 6 |
| 3 | 并发上限按会话计（PM 推导） | PF-006 rev 18 |
| 4 | 不锁的配值只是挑选（S10-b）；**「禁止」锁不锁都是界**（PM 推导，比 S10-b 字面收窄，为与 PF-007 §5.6「任一层明确禁止是终局」同时成立） | PF-001 rev 17 / PF-002 rev 17 |
| 5 | 界内谁都没挑到时取离最具体挑选最近的一档（G-9，PM 推导） | PF-002 rev 17 |
| 6 | 仓库带来的本地命令型 MCP 接入点默认不启用（R-MC-1） | PF-002 rev 17 §5.7 |
| 7 | 已接受内核正文被改动：PF-001 §6.2/§7、PF-009 §4「七种都落日志」→ 六种、PF-013 裁决 27 的机制 | 各 decisions 三问里标「请负责人确认」 |

另：PF-002 D-2（「谁可以使用它」怎么判）、D-3（Skill 两项设置指什么）、D-4（Connector 两项权限取值）与 PF-007 §9.3 D-3 只登记了 PM 倾向未裁——✅ **2026-09-24 全部按 PM 倾向裁定**：D-2「不能用就不装」（「自己」= 作者本人）；D-3「拿掉，我也没看懂这两个是啥玩意儿」；D-4 同意（安装权同「谁可以……」取值；按什么身份处理是固定规则不作权限）；PF-007 D-3 同意（偏好/绑定类随 read 给 agent，落点/身份类只给脚本）。**待主线派：PF-002 与 PF-007 decisions 转拍板记录、正文相应升 rev**。

### 词条批（2026-09-24 合回 HUB `0256d02c`：216 词条、10 项待裁、对账全绿）

| 项 | 裁定 | 理由 |
|---|---|---|
| T-1 | 立 34 条（清单在词条批提交里）；「一次发出」判**过程**（改早先 S2-f「属性」）；「注册表」正式名「会话资产注册表」判视图；带限定词的取名（权限界／权限挑选、工具并发上限、模型展示列表、增量节流、模型调用上交成因）采纳 | 按 ubiquitous-language skill 判据，理由各附 |
| T-2 | 未立的约 60 个规格层名字**不立**，契约里「（无词条）」即可；生效参数等 PF-000 认领记录条目种类后再立 | 产品正文没定义的不发明 |
| T-3 | 冲突 C-31「`capability.model-request-runtime` / `capability.tool-execution-runtime` 名字与『叫 runtime 的必须是协程』规则相撞」——**名字保留**：两份能力的提供者各是一条 fiber（宿主协程），契约 README 由对齐波补一句「本能力的提供者是运行时协程」，C-31 以此闭合 | 规则量的是所指，所指确是协程 |
| T-4 | 两项新待裁（PF-003 owner）：「待确认的复制通知与分享邀请」是否对象（PF-016 §6.14 要逐条可见、flows §3.4 再发是新的一份 = 另一种身份）；「一段分享关系」有状态机无身份——**产品未决项，与 U-3 同看** | 判不了不硬判 |
| T-5 | UL-asset-holding 保持「属性」（C-17 已闭合），注 ⑤「形态不是存储」 | 存成行是架构决定 |

### 产品负责人 2026-09-24 追加要求：工具定义须能构造供应商工具 payload（已取证、已发对齐波）

| 项 | 裁定 | 依据 |
|---|---|---|
| TD-1 | S-6 模型面条目定形 `ModelToolEntry = { name, description, parameters }`；三家线上形状（OpenAI Responses / Chat Completions=OpenRouter / Anthropic）只是键名与外壳不同，投影是纯键名映射、不改写 schema——契约承诺，映射归传输适配 | 研究 V-1～V-3（源钉在 `tmp/sources/extracted/{openai,anthropic,openrouter}-docs/`） |
| TD-2 | 模型面名字转写 `":" → "__"` 由契约定死、作者 name 不得含 `__`（拒绝值 `name_reserved_sequence`），可逆；转写后 ≤128、字符集 `[A-Za-z0-9_:-]`（收窄 G-1） | Anthropic name 正则不含 `:`，而本项目 name 允许 `:` |
| TD-3 | 参数 schema 顶层必须 `type: object`；**每个参数必带非空 `description`**（递归到嵌套对象与数组元素对象），拒绝值 `parameter_description_missing` | OpenAI「推荐」、Anthropic「最重要的因素」；必填代价为零 |
| TD-4 | G-12 收窄为「非 strict 模式两家直接接受」的关键字子集；`strict` 附加要求本版不承诺，留 G 给传输适配可选投影 | OpenRouter 页面未写各家转译与限制 |


## 二、2026-09-24 用户在场期间主线随用户裁决所作的自定（账本 §二′ 原文；标「主线自定」的行）


| 项 | 裁定（你的原话要点） | 落点 |
|---|---|---|
| U-24-1 | 工具定义须能构造出各家模型供应商要求的工具 payload：工具说明 + 每个参数各自的说明 | tool-definition TD-1～TD-4（取证 V-1～V-4） |
| U-24-3 | **复制与分享的方向矩阵重定**（三条规则 + 你确认的矩阵与四处改动，原话全文在 `briefs/PF-003-rev5.md` §一）：组织内分享是新格；组织—组织复制允许（T′ 超管确认）；个人 → 我在团队的租户级可分享；跨组织落不到别人的租户级 | PF-003 rev 5（已派 product-design-drafter，简报 `briefs/PF-003-rev5.md`）；随后主线改 UL-asset-copy / UL-asset-sharing、闭合领域对象两项待裁、asset-transfer 契约 v1 方向规则与 TLA+ 重做 |
| S-U24-3a（主线自定） | 「共享」不另立词：正式名仍是**资产分享**，组织内的一格只是接收方为同组织租户；属性扩展优先于新概念 | 同上 |
| S-U24-3b（主线自定） | 组织型复制在目标侧的作者 = (目标组织, 确认的那位超管)；本人型仍 = (目标组织, 本人) | PF-003 decisions §二 PM 推导 |
| S-U24-3c（主线自定） | 「待确认的复制通知与分享邀请」「一段分享关系」**都是对象**：你说「不复活，重新分享」「分享是双方确权的动作（同邀请）」，再分享是新的一段；PF-001 的邀请与隶属请求已裁对象，同形同理 | PF-003 decisions §四闭合两项来源问题；主线立词条与对象条目（原 T-4） |
| U-1 / U-2 落盘 | PF-013 rev 10（§5.6 删「否则组织层」、§6.3 列表带 origin、撤回可恢复、Q11 撤）；PF-002 §九闭合；U-24-1/2 → PF-006 rev 19（§5.3 flat 唯一、说明必填） | 已派第二位 product-design-drafter，简报 `briefs/product-batch-2026-09-24.md` |
| 产品批二报回（HUB `19862602`） | 起草者报回待处置：① UL-model-credential / UL-custom-model-profile / UL-profile-listing-status / 对象「模型档案」身份与生灭要改（主线 rev 复核时做）；② PF-016 非目标、§6.20、acceptance 两行仍以「组织层有一把模型凭据」为前提；③ PF-007 §4「门后命令不必逐个列出」与 flat 命令表措辞要对；④ spec：MPD S-20、MRR 取凭据次序「否则组织层」删，G-1/G-4/AG G-10 关；`data.model-profile` S-3 按 U-2 改；S-20 自建档案回落出厂凭据与裁决 3 相抵；⑤ D-038 Q11 撤、Q5 flat 读法只在 decisions 注了一句；⑥ **新待裁：MCP 对端动作不带说明时**——主线自定：系统补一段占位说明（「对端未提供说明」）仍可用，不当它不可用（否则半数 MCP 服务器不可接）；⑦ PF-013「用户要看得出这次模型读到的是哪一份」链到 §6.3 无落点——排进下一产品批 | ②③⑦ 进产品批三；④ 进 spec 修订批；⑥ 已自定 |
| U-24-4 | **连接件加「可订阅事件目录」**：正文声明事件类型目录（类型名+说明+消息包形状）；订阅是持有上的一项设置（目录子集，作者可给默认，各层配值）；agent 不在运行时订阅，但组合了该连接件的 agent definition 把被订阅类型的说明带进上下文；信封多一个「事件类型」成员，不在目录或未订阅即受理拒绝。原话：「Connector 升一 rev，然后等 research 完成后这块我们再讨论一次」 | 产品批四：PF-002 §4 Connector 升 rev（排在批三之后，PF-002 rev 19 → 20）；`data.connector` v1 修订（spec 批第四节）等 research `connector-products` 完成并再讨论一次后再收口 |
| 产品批三报回（HUB `1c35ba4d`） | ① 词条「替换件」撞 UL-stand-in → 已改「指定挂件」；② UL-admission-decision/UL-card-batch/objects 决策卡片 → 进 rev 复核批；③ **PF-002 D-5「不可用处置算哪类属性」——主线自定：它是拓展件定义里的一项声明（同工具定义的 `allowBackground`），不是四类设置也不是权限，各层不配值**；④ PF-007 §6.11「没有第五个出口」字面已不成立；⑤ PF-004 I-4「权限变化不改变动作空间」与 D-2 跨运行生效——主线读法：一次运行内不变、下一次运行起生效，两者不冲突，PF-004 补一句；⑥ PF-012 §5.8「租户可挂自己的转换件」与 PF-013「本版换不了转换件」相左——主线自定：以 PF-013 为准（转换件本版不是资产），PF-012 措辞收窄；⑦ PF-012 §8 依赖表 rev 过时 | ③ 进产品批 4b（随连接件）；④⑤⑥⑦ 产品批 4a 已派 |
| 批 4a 报回（HUB `fbc7f18c`）→ 进产品批 4b | ① PF-004 §6.3 复用判据只看系统提示词成分，与 D-2「不能用不装」相冲——主线自定：判据补「构成变小也重新装配，下一次运行起生效」（PF-004 rev 12）；② PF-012 §4/README「第八类资产」对转换件无例外，§8 另三行 rev 落后（PF-004 11、PF-009 8、PF-010 6）（PF-012 rev 14）；③ PF-008 §8 PF-012 rev 更新、decisions §四 PF-007 出口项闭合；PF-002 decisions §四 PF-004 I-4 项闭合、§九 D-5 按主线自定闭合；PF-007 decisions §四「等待态上限」旧账与 README 矛盾清理；PF-006 decisions §四「MCP 动作缺说明」改为已裁；④ PF-012 §5.7「重算可用性后动作空间可能不同」vs PF-004「不可用靠替换件占位」——只登记 PF-012 decisions §四；⑤ PF-002 §4 Connector 事件目录（等你四点）。rev 复核批已合（HUB `24b312bc`，对账器全绿） | 4b 简报待你连接件四点后一次派 |
| U-24-5 ✅ | **自建档案同路由名并存**，原话：「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」——路由名当能力标识用，有效档案按层从最具体一格取（租户 > 组织 > official），列表每条带来源 | `data.model-profile` S-3 / MPD S-17 / MRR S-10、S-12（已发模型侧起草者）；PF-013 §4「档案的身份」补「同名按层覆盖」一句（批 4b） |
| S-U24-5a～c（主线自定，随 U-24-5） | a. 同名覆盖挑胜者时**先滤掉已撤回的行**再取最具体（类推 PF-002 §5.6「先滤禁用再取最具体」），缺凭据不滤；后果：组织建了同名自建、成员没配自己那把就用不了官方那条——裁决的直接后果，写明代价。b. 覆盖同样作用在锁之上（锁的是路由名；供应商/参数/凭据取胜出档案的）。c. 被覆盖的条目照列、带来源并标 `overridden_by{scope}`，呈现归 PF-016 | MRR G-15/G-16 关（已发起草者）；PF-013 rev 12 同句补（已发批 4b 起草者） |
| S-U24-7（主线自定） | asset-model G-14：PF-002 §5.2「每一类资产都有『谁可以使用它』」vs S-36 只三类 → 以产品为准，八类都推出 `usableBy`；Connector 的「能不能安装」即此项（项名统一 `usableBy`，`data.connector` 收口时改） | 已发工具侧起草者 |
| U-24-6 ✅ | **连接件四点**，原话：「1）结构化；2）目前这版先支持厚信封；3）connector 本身就是资产，所以归属本来就是明确的，channels 你应该理解是一个已有的会话在它会话中开的一个信道（来接收外部事件投递），而 connector 自己发事件来触发会话是另外一个动作，应该开新会话（走 inbound 来触发执行），也就是动作主体不同，当然这块具体的设计就是 会话 那块的事情了；4）一个 connector 配置的时候至少把它触发的会话的默认运行模式设置上（并且配置者，也就是租户可调整）」 | 批 4b：PF-002 §4 Connector rev 20（事件目录结构化、订阅为持有设置、厚信封、两种投递方式各自主体、触发会话的默认运行模式为持有设置）；PF-014/PF-015 登记「连接件触发型到达开新会话」的产品缺口（以哪个 agent definition、会话侧信道）归会话那块；新词条 UL-connector-event-type、UL-event-subscription；`data.connector` v1 随后收口 |
| **请你确认（已裁，见 U-24-5）** | `data.model-profile` S-3：U-2 说身份是（范围, 路由名）。起草者据此写成**组织层与租户层的自建档案可以同路由名并存**；2026-09-23 主线原裁是「自建名在隶属树内唯一」。两读法产品上的差别：前者每层各建各的、列表靠「来源+范围」分辨；后者一棵树里自建名只有一份、成员想自建同名会被拒 | 待你一句 |
| U-24-2 | **多命令工具的模型面只支持 flat 形**（`{command: enum + 一行一命令的表, args: object}`），不生成 oneOf 判别联合；理由：多命令范式为的是一个槽位 + 上下文紧凑；omne-next 的 typed_union 是 LangChain 严格类型校验所迫，本项目自建判定层不需要 | tool-definition S-7 重写；examples 第 9 节；**PF-006 §5.3 「带全部命令的完整参数 → 一次到位」那一格要修订**（作者带的完整参数用于校验与 inspect/help，不进模型面）；D-038 Q5 按 flat 读法 |


## 三、2026-09-24 第二轮规格修订的主线裁定（简报 R2-1～R2-16 原文）与 G-24／G-25


| 编号 | 裁定 | 依据 |
|---|---|---|
| R2-1 | **组织治理出 v2**（加法版）：成员关系记录加「成员关系生效时刻」（最近一次由无效→有效的时刻；首次建立即写，解除不清空，再加入改写）；上级组织属性加「隶属建立时刻」（最近一次设定上级的时刻）；读组织、六个读面、当前租户身份查询把这两项暴露出来。其余条款与 v1 逐字相同，v1 保持 accepted/frozen 不动，v2 登记 candidate，lineage 记 v1→v2。`packages/tenancy/organization-governance` 仍消费 v1，v2 的采用是实施侧另一步——v2 README 的消费者一栏写明 | asset-transfer G-11：U-3 乙「分享不复活」要在读时判「关系建立时刻 ≤ 确认时刻」，v1 没有这两项读面 |
| R2-2 | asset-transfer S-9 第三个合取项改读 OG **v2** 的两项时刻，依赖登 v2；G-11 关 | 同上 |
| R2-3 | `data.identity-values` v1 CS-3 `sameAccountDistinctTenants` 的前提与组织型复制（同一账号在源、目标两组织各有租户身份）不合处：**identity-values 已冻结不改**，在 asset-transfer 的前提／消费者核对里写清这一处以何种读法成立（按各自组织的租户身份分别署名，账号相同不构成同一人型），不新开缺口 | 冻结契约只能出新版；这里不需要新语义 |
| R2-4 | G-9（分享方删除已分享出去的资产）：那段分享**记录置 `revoked`，原因 `sourceDeleted`**——分享方删除资产等于分享方主动结束分享，删除前的告知（账本 A-M25）不变 | 只有一个答案自洽：源没了，分享无物可指 |
| R2-5 | G-12（本人型复制的重放认回）：落地操作带调用方给的**尝试键**，同键重放返回首次结果、不多发布版本；用本仓库已有的重试惯用法（看 `capability.account-registration` v1 怎么写未知结果之后的重试与 formal 里的 crash 任务），不另发明 | 技术缺口，主线自定 |
| R2-6 | G-13（组织型复制通知的目标侧读面）：**带源组织的标识，不带源资产正文**——确认的超管要知道东西从哪来才能判 | 确认动作的前提；主线自定，账本记一行给产品负责人过目 |
| R2-7 | 分享期间提升（caller 把仍有 active 分享的租户级资产提升到组织）：**提升不被分享挡住；提升那一刻 caller 作为分享方的全部 active 分享随之结束**，记录置 `revoked`、原因 `ownerChanged` | 类推 G-7「分享方不再是有效成员则分享结束」：所有权易手后分享方不再是所有者。账本记一行给产品负责人过目 |
| R2-8 | 名字账本追加：`targetLayerNotSelf`、`layerNotAllowed`、`recipientNotMember`（asset-transfer，接受）；组织层不收凭据类项的拒绝值**用 `layerNotAllowed`**（asset-governance，不另立 `notPermitted`）；`workspace_governance`（asset-evaluation FilterReason，接受）；分档权限的挑选不恰一档的拒绝值 **`selectionNotSingleTier`**（asset-governance） | 同类失败同名；值名风格随各契约现状（治理／流转 camelCase，求值 FilterReason snake_case） |
| R2-9 | asset-governance 写入面「拒绝写界外的值」要认**不锁的执行权限 `{forbid}` 配值也是界**（asset-evaluation S-23 已改）；分档权限的**挑选必须恰一档**，界可以是集合；多于一档或空集在写入面拒绝（R2-8 的值） | PF-002 §5.3「禁止锁不锁都是界」；asset-evaluation G-9 |
| R2-10 | asset-model S-19 `shared` **可落租户格**（组织内分享、本人型分享的接收方是租户）；S-21 复制血缘按 PF-003 rev 5 与 asset-transfer v1 的矩阵改（血缘按（源, 落进的层）；组织型复制的 `importedBy` 是确认的超管在目标组织的租户身份，本人型是本人；「有血缘的所有者是组织、组织级不能复制」两句按 U-4「普通成员落租户级；超管选层」改写）；**流转语义以 asset-transfer v1 为准，asset-model 只承载形状** | asset-transfer G-14；PF-003 rev 5 §6 |
| R2-11 | asset-model S-20 工作区格「持有带权限或落点配值即 `malformed`」与 asset-evaluation 清单读入→S-24 过滤的关系：工作区的持有来自承载目录文件，**没有写入面可拒**；S-20 改为「这类配值不属于良构的工作区格，读入时按 FilterReason 丢弃」，S-24 就是那道过滤；E-1 的 h10 保留 | 早就有的不一致，两边都对着产品「工作区配不了三样」 |
| R2-12 | asset-evaluation PRE-2 对齐 asset-transfer S-9 的三个合取项，并认 `shared` 落租户格 | 同 R2-10 |
| R2-13 | asset-registry S-20：钉住的单位是**运行**（run），不是执行尝试；`onAssetChange` 与读时现读的收窄**只对下一次运行起作用**，已开始的运行照样用它钉住的那份；G-14 ②③ 关，① 留（要 PF-004 的契约来答） | PF-002「这次运行照样用得上它」；产品说的是运行 |
| R2-14 | `data.connector` 推出规则：产出治理类项「触发会话默认运行模式」，且**不带 `default`**（asset-model S-12/S-13）；**只改这一条**，连接件其余收口等专项讨论 | U-24-6 ④ |
| R2-15 | PF-002 acceptance「成员乙写了一个 tool，组织持有了它……丙的 agent 面前没有这一条」与 asset-evaluation S-31（定义直接引用、无同名 official ⇒ 装配失败）**不冲突**：前者是持有而丙用不了（不进构成），后者是 agent definition 直接引用一个无人提供的能力标识（PF-004 I-9）。两边都不改 | 两种情形 |
| R2-16 | PF-001 rev 17「提升是交付，所有权易手，不可逆」与 asset-governance S-27 ④「caller 租户层那份持有的依据由 `owned` 改 `organization`，其余不动」：核对是否一致——持有本身不动、只是来路重算，写明这不是一次持有变更；若 PF-001 正文另有「提升不动持有」以外的说法与 ④ 相左，**报回不改** | asset-transfer 报回项 |


| 编号 | 裁定 | 依据 |
|---|---|---|
| G-24（asset-governance） | 配值操作加可选「随值加锁」（同一次提交写值并锁上，等价于配值→加锁两步原子化；产品的两步流程不变）；带锁写入的值是界，可以多档或空集（空集依据 PF-002 §5.3「锁成空集」原话）；不带锁的值仍须恰一档（`selectionNotSingleTier`） | 简报 R2-9；PF-002 §5.3 |
| G-25（asset-governance） | 随值加锁可以替换这一层自己已上锁的界，前置仍是新界落在外层界内（含不锁的执行权限 `{forbid}`）；这一层自己写的锁不构成 `lockedHere`（它只挡不带锁的改值与清除）；解锁多档或空集的界仍拒 `selectionNotSingleTier`，出路是先随值加锁改成恰一档再解锁 | 同上；drafter 乙 2026-09-24 落条款 |

## 四、被推翻或被覆盖的项（追加登记）

| 原项 | 被谁取代 | 说明 |
|---|---|---|
| U-3 建议「甲：复活」 | 产品负责人 2026-09-24 裁乙（D-039） | 分享不复活 |
| S6-b「新官方件撞现有自建名同样拒建」、D-038 Q11 | 产品负责人 U-2／U-24-5（D-039） | 官方件与自建件同路由名并存、按层覆盖 |
| S1-c / S2-f「一次发出」判属性 | 词条批 T-1 | 判过程 |
| S22-f `failed{not_available}` | S13-a | 不可用一律落收场 `unavailable` |
| A-G2「设置项同理（跨层跟随替换件）」 | S10-a | 设置按资产取值 |
| R-B3「权限收回触发 reload(slash_command)」 | S22-a | 只收窄不重填 |
| S8-c 工具清单 `ToolDefinitionRef` | S16-c | 用 `CapabilityId[]`（S25 第一轮 L-3 又指出 MCP 来源无能力标识，待第一轮修复裁定） |
| 「写一条界不查外层的界」（drafter 乙 2026-09-24 推导） | G-25 落条款 | 所有界都须落在外层界内 |
| S2-e `CostItem.service` 规范串写成 `"<category>:<name>"` | `data.asset-model` v1 S-3 的规范串 `<category>/<name>`（call-accounts S-9 已按它写） | 分隔符以 asset-model 为准；S2-e 的 `:` 是早期笔误 |
| K21 的成因名 `credential_missing` | 修复波 1 落条款时取已有值 `credential_unavailable`（与出门前分支、`FailureCause` 同名） | 同一情形同一个名 |
| K29「卸载判定的能力标识在 TER S-1 给出」 | 实际落在 `capability.tool-execution-runtime` v1 S-63（S-1 只作指路） | 条款号以契约为准 |
| S22-a 括注「去掉被收回权限／被移除／被禁用的条目」 | asset-registry S-28：`onAssetChange` 只去掉此刻用不了的（权限收回）；被移除、被禁用的按 PF-002 §4 等 reload | 括注写宽了，契约为准 |
| K44「读入时丢弃」一句 | R3 落法：`immutable` 标记与未列资产在读入时以 DropReason 丢；权限、落点与身份类、治理类在第 4 步以 FilterReason 滤（读入时没有声明可判） | 按种类分两处，一处只滤一次 |
| S18-a「目标环境作 settings 保留项 `targetEnvironment`」 | 修复波 1b L3：技能包删掉该保留项——PF-002 rev 19「系统不为技能另规定设置项」，PF-006 §6.8 的目标环境是工具的设置 | rev 19 之前的读法；K12 随之作废 |
| D-038 Q1 关于文本块 `origin` 的措辞 | 词条 UL-origin-tag（来路标记）与 UL-source-tag（来源标记）分立后以词条为准 | 决定原话不改，用词以词表为准 |
| L3「技能包删掉 `targetEnvironment` 保留项」 | L3′（2026-09-25）：技能包恢复「执行环境要求」为**定义记录里的固定声明成员**（作者声明需要哪几种设施、要求绑定在哪一层；各层不能配值、不参与设置求值）——PF-006 §6.4「工具，以及带脚本的技能，声明它需要什么样的执行环境」与 PF-007 §6.2 主线漏核；PF-002 rev 19 只说系统不为技能另规定**设置项**，固定声明成员不是设置项，三处同时成立 | 主线改判；skill-package G-8 关 |

## 五、S25 第一轮修复波的主线裁定（K1～K50，2026-09-24 夜，追加）

七批独立评审（`spec-reviewer`，基线 HUB `765b01dc`）报出的跨契约分歧，由主线按同一授权裁定如下（简报 `briefs/S25-fix-1-2026-09-24.md` 原文）。「落点」一列写的是哪份契约改哪一半；追认状态同上：产品负责人尚未逐条追认。

| 编号 | 裁定 | 落点（谁改） |
|---|---|---|
| K1 | 外部效果（`externalEffect`）的判据权威是 tool-execution-runtime S-14；call-accounts S-11 只定义两个取值的含义并以坐标引 S-14 | call-accounts（R1）；TER 不改 |
| K2 | `ToolInternalEnding` ↔ `FinishReason` 的对应表由 **data.messages S-14** 拥有；stream-assembly、TER 引用它。`ToolInternalMessage` 成立的判据 = `closeOut` 交出的 `blocks` 非空（messages S-13 原话）。执行者无回答（`no_answer`）与桥换代都不是「有意停下」，映射到 `lost`（arrival-events `FinishReason` 若无此值则加，含义「生产者失去连续性」） | messages（R1）给表并加映射；arrival-events（R1）按需加值；stream-assembly S-2、TER S-19/S-39（R4a）改引 |
| K3 | messages 按 PF-009 rev 8：`SystemMessage` 不落日志、每次组装现算（G-9 关，S-7、S-29 ④ 与 Alloy 的 `SystemMsg` 映射改写或删）；按 PF-010 rev 6：S-6 表 `system` 列只文本 | messages（R1） |
| K4 | 模态不符的块头由 arrival-events 自己拒，值 `head_modality_mismatch` 进 S-28 表；S-9、S-24、Schema、examples 一致 | arrival-events（R1） |
| K5 | 工具 `CallId` 的判重键与补账目标身份 = 会话日志归属 + `CallId`（call-accounts S-22/S-23/S-25） | call-accounts（R1） |
| K6 | tool-definition 两个撞名值改 `setting_category_unknown`、`tool_origin_unknown`；skill-package M12「设置项类别未知」报同一个 `setting_category_unknown` | tool-definition、skill-package（R2a） |
| K7 | 「凭据位写了非引用值」只有一个拒绝值：asset-governance 写面 `valueOutOfDomain`（取值域校验）；mcp-endpoint 删 `credential_plaintext`，connector 同引 | mcp-endpoint、connector（R2a）；asset-governance（R3）在 S-38 写明凭据项取值域 `CredentialRef` 也走 `valueOutOfDomain` |
| K8 | 拓展件不可用处置：data.loop-extension S-6 加声明成员 `unavailability ∈ skip \| veto`（缺席 = skip；它是拓展件自己的声明，不是设置也不是权限，词条 UL-extension-unavailability-policy）；S-31 记录带「按什么处置」；S-33 改写为「租户件按声明；系统自带件由装配预先声明的指定挂件顶上」。runner S-12/S-13/S-17 对齐：不可用 + `veto` ⇒ 这一次经过以否决收场、记录写明「此刻不在、按否决处置」；U-5 已裁（D-039），删「待裁」 | loop-extension（R2a）；runner（R4b） |
| K9 | loop-extension 补属性项推出规则（asset-model S-12 四项义务）：`position`、`dimension` 是绑定类设置项、`power` 是权限项（取值域为各自枚举、默认 = 声明值）；`onError`、`needs`、`implementation`、`unavailability` 不出项。asset-evaluation S-4 末段／S-10／G-3、asset-model CS-1、asset-governance G-5 改指这条 | loop-extension（R2a）；asset-evaluation、asset-model、asset-governance（R3）改引 |
| K10 | **工具的指认**：调用块与 `ModelRequest.tools` 里流转的都是**模型面名字**（tool-definition `ModelToolEntry.name`，`:`→`__`）；tool-admission 的比较在模型面名字上做（S-7 `definition` 由 runner 组装时带模型面名，S-18 逐码点比较不变）；**逆转写只在 tool-execution-runtime 起执行者之前做**（登记消费 tool-definition S-6），模型请求运行时的传输适配不做逆转写。`ModelRequest.tools: ModelToolName[]`（loop-extension S-15 与 model-request-runtime S-7 同改，元素引 tool-definition 的模型面名 `$def`） | loop-extension（R2a）；tool-admission、TER（R4a）；MRR（R5） |
| K11 | MCP 来源的工具定义不按结果端模态判（tool-definition S-24 ③ 改成可判写法，与 mcp-bridge S-17 一致） | tool-definition（R2a） |
| K12 | skill-package `targetEnvironment` 无默认且无配值时，S-16 按未声明处理（Schema 不加 required） | skill-package（R2a） |
| K13 | model-response：`parameters` 记**实际发出**的值；新增 `parameterAdjustments: [{name, requested, sent}]`（adapter 改值留痕）；`droppedParameters` 含 `extra` 项的名字。model-request-runtime S-7、loop-extension S-23、model-profile 消费者表同步 | model-response、model-profile（R2b）；MRR（R5）；loop-extension（R2a）只改 S-23 那一句 |
| K14 | `ModelResponse` 加可选 `late: true`（只在所属尝试被栅栏关掉之后才结算时写；缺席 = 不晚），与 call-accounts S-39 对上 | model-response（R2b）；call-accounts（R1）核 S-39 措辞 |
| K15 | `ResponseId` 由模型请求运行时在写「已出门」时铸；写响应体的一方（调用方、恢复对账）沿用；model-response S-6 改成这句 | model-response（R2b）；MRR S-8 不改 |
| K16 | 一笔账归哪次尝试／运行／租户的权威 = call-accounts 条目壳（S-25）；响应体的 `attemptId` 是「发出所在尝试」的事实、不作归属；`initiator`（发起者）由条目给，响应体的 `initiator` 只指中断发起方并在 S-12 注明 | model-response（R2b）；MRR S-19（R5） |
| K17 | data.model-profile 立「建档内容」文档种类（不带 `registration`、`updatedAt`，其余同 `ModelProfile`）及其拒绝值；directory S-14/S-18 用它做表示层校验，带了这两个成员即 `malformed`（M-新） | model-profile（R2b）；directory（R5） |
| K18 | 恢复在册（`relisted`）可与属性改写落同一次提交；model-profile S-10 与 examples §8 的「其余不变」断言限定到 `relistProfile`（directory S-33） | model-profile（R2b） |
| K19 | `ModelCallId` **会话内唯一**（call-accounts S-37 为准）；MRR S-5 改；六个调用操作 ① 加 `session`（身份参数无默认，先判归属，不符 `callNotFound`） | MRR（R5） |
| K20 | 绑定持久化：messages S-49「已出门」记录加 `profile`（引用）、`profileSnapshot`、`parameters`、`selectedBy`、`credentialScope`；MRR S-28/S-33/S-38 改读它；model-response 不放宽 | messages（R1）；MRR（R5） |
| K21 | 上交成因：messages S-50 允许 `released` 带 `cause`；`undispatched` 仍只指「一次也没发出」；MRR S-29 ⑧／S-30 ⑧「续接或再发时凭据取不到」写 `released{cause: credential_missing}`，S-6 补入口；模型补分支或列进「吸收」 | messages（R1）；MRR（R5） |
| K22 | MRR 暴露只读守卫判定 `canDispatchAgain(session, callId) → {allowed} \| {refused{why}}`，与 S-30 同表；runner S-14 第②类改用它 | MRR（R5）；runner（R4b） |
| K23 | TER 逐条承诺 stream-assembly S-28 的第 1～4、6、9 条（路由与迟到丢弃、串行不分叉、执行者只交 open/fill/close、被拒增量恰一次 `rejected` trim、快照衔接）；stream-assembly G-2 关 | TER（R4a）；stream-assembly（R4a） |
| K24 | 参数收齐却解析不了的调用：**拥有者 = tool-execution-runtime**——`submit` 接受它并即刻收场 `failed{unparseable}`、写 `ToolMessage{failed}`；tool-admission S-7 写明这种调用不进 `admit` 输入；stream-assembly S-11/S-28 第 5 条改指 TER | TER、tool-admission、stream-assembly（R4a） |
| K25 | TER 整批拒收之后那些调用落什么收场：登显式缺口，owner = agent loop 契约（PF-012 那一程），闭合条件「loop 契约写明由谁写 `ToolMessage` 与哪种收场」 | TER（R4a） |
| K26 | `admit` 失败的记录 = `skipped: errored` + `error`（tool-admission S-29/S-34 为权威）；S-40、S-44、examples、runner S-48 对齐 | tool-admission（R4a）；runner（R4b） |
| K27 | 放行凭据核对按 (session, callId, 生效参数)（TER S-23 ②）；tool-admission S-16「不绑会话」那句改写为「凭据本身不含会话，核对时带会话」 | TER、tool-admission（R4a） |
| K28 | 「每帧至多计一次未原样送达」归 stream-assembly S-14 去重规则（本能力承诺），call-accounts S-15 的指派对上 | stream-assembly（R4a） |
| K29 | 系统自带件的能力标识：放行判断 `omne-official:admission-judgment`（tool-admission S-26 给出）、卸载判定 `omne-official:offload-judgment`（TER S-1 给出，卸载判定归 TER）；runner S-7 引用 | tool-admission、TER（R4a）；runner（R4b） |
| K30 | MCP 逐动作执行权限：注册表钉住动作集之后**再求一次值**——asset-evaluation `EvaluationInput` 加可选 `mcpActionSets: {endpointHolding → actions[]}`，输出里逐动作 `execute:<动作名>` 的生效值；asset-registry `refreshAvailability` 在钉住后发起这次求值（依据装配时那次求值的输入 + 动作集），结果与每个接入点的 `endpointHolding` 一起钉进报告（`effectivePermissions`、`endpointHoldings`）交放行判断与 TER；拿不到 = `unavailable`（放行判断全拒）。凭据改值对下一次尝试生效（bridge P-9 保持）。mcp-bridge CS-2/CS-4 改引报告 | asset-evaluation（R3）；asset-registry、mcp-bridge（R4b）；TER（R4a）S-23 取 `endpointHolding` 自报告 |
| K31 | runner 的 `dispatch` **一次针对一批动作**（输入 `actions[]`，同一位置同一轮），不逐个；`admit` 由这一次 dispatch 发起一次、结果分给各动作；回放后的下一轮 = 同一批答复到齐；写进 S-21/S-29 与 S-32 | runner（R4b） |
| K32 | hooks `ask` 带改写：data.loop-extension S-28 `DecisionCardDraft` 加结构化 `proposedRewrite?: {arguments}`；hooks-import S-20 写例外「`ask` 带改写时改写在答复允许之后生效」、S-21 回放从该槽位重建 `rewrite` | loop-extension（R2a）；hooks-import（R4b） |
| K33 | 被引用的能力无人可用且无下一层：装配失败（PF-004 I-9）；收口方 = 装配——会话创建失败／`reload` 失败对交付面可见；asset-registry S-20 写明 | asset-registry（R4b） |
| K34 | mcp-bridge `fetchedAt` 取**列举开始时刻**，单调规则、目的句、例子、P-5 四处一致 | mcp-bridge（R4b） |
| K35 | directory：授权依赖不可用时立即 `unavailable`，先于一切需解析的值（S-13 ⑥ 重排）；examples 加故障注入例 | directory（R5） |
| K36 | 重试挂件只凭 loop-extension S-14 的失败主体下结论（model-response S-5/S-23 改成「这条序列是那份主体背后的事实」）；`truncated` 收场也补中断提醒（messages S-10 为准）；`vetoed`／`consumed` 的响应体由 MRR 在同一提交写（model-response S-3 改「`persisted` 那条由调用方写」） | model-response（R2b）；MRR（R5） |
| K37 | 读组织治理 v2 两项时刻的调用主体 = 运行时**代行**（装配给；单机可串行化读即满足）；跨进程由服务身份兑现（协议给）——asset-transfer S-9/S-34 与 OG v2 §十二 写同一句 | asset-transfer、OG v2（R3） |
| K38 | 复制落地的 `byAgent` 由 asset-transfer S-11 写集合给（取发起复制的调用上下文） | asset-transfer（R3） |
| K39 | 分享结束**不通知**，被分享方经 `listSharings`（S-30）读结束原因；asset-governance S-27/S-28 ⑨ 与 asset-transfer S-33 同句 | asset-governance、asset-transfer（R3） |
| K40 | 合法目标集合仍是三项（词条不动）；「本据点传输能承载」是**可发出**的另一前置，MRR S-11 分开写 | MRR（R5） |
| K41 | modality-projection 补整份声明操作 `declareConverters(set)`（原子替换、`keyTaken` 在整份内判） | modality-projection（R5） |
| K42 | 「用哪个模型」设置的允许集合取值域是**路由名**（与 U-24-5「设置记路由名」一致）；MRR G-4 关，directory S-17 把允许集合写成显式参数 | MRR、directory（R5） |
| K43 | asset-evaluation S-16 ⑧：列表缺席 ⇒ `invalidInput`（asset-model S-24 为准），为空 ⇒ 没配值；`workspace_immutable` 删（读入时 `immutable_flag` 已丢）；配值的 `since` 由读入方按清单读入时刻填（S-27/S-28 写明） | asset-evaluation（R3） |
| K44 | asset-model S-36 的 connector `install` vs `usableBy`：登 G（owner 主线 + data.connector，闭合条件「专项讨论后 connector 收口」）；工作区格条目过滤阶段统一为「读入时丢弃并留痕」（asset-model S-20/S-24 与 asset-evaluation S-24 一句） | asset-model、asset-evaluation（R3） |
| K45 | asset-governance S-24 ① 与 S-46 一致：调用方即作者，`author` 不作输入 | asset-governance（R3） |
| K46 | OG v2 第十三节：逐个 v1 消费者列出消费条款的变化与相容性（返回多一项／失败多一种）；同一提供者同时服务两版的规则；S-45 覆盖声明收窄；S-22 ② 删「（超管）」 | OG v2（R3） |
| K47 | hooks-import：导入的兼容件不可用处置 = `skip`（租户件缺省），S-10 写明、报告明示；「宿主」改称「来源产品（Claude Code／Codex）」，不与 runner 的宿主撞 | hooks-import（R4b） |
| K48 | tool-admission S-15「第四档恒为四个」改为按 PF-008 §5.2「写得进去才出现」：由放行判断出草稿时滤（S-15、S-39 场景同改）；G-10 按 PF-012 rev 11「放行到执行之间不重判」关闭 | tool-admission（R4a） |
| K49 | runner S-30 ③ 连续否决上限就是 PF-012 那项运行时设置（与循环守卫 L2 分开，各自阈值）；写清 | runner（R4b） |
| K50 | TER S-23 ④⑤⑥「发起即后台而不许后台」只保留**收场** `failed{background_start_refused}`，删逐条失败值 `backgroundNotAllowed`；判重在 ② 之前（同 callId 同参数 ⇒ 返回已有 disposition；同 callId 不同参数 ⇒ `callIdConflict`）；`submit` 核对会话租户（不符 `crossTenant`）；丢失在途状态时 `frames` 写 `unknown`（call-accounts S-11 加 `frames: FrameAccount \| unknown`）；等待／发帧／报账／交回四原语补返回值与失败集合 | TER（R4a）；call-accounts（R1）加 `unknown` 支 |

## 六、修复波 1b 的主线裁定与接受的命名（2026-09-25，追加）

修复波 1 各批报回「D-040 没有登」的裁定与起草者取的名字，主线在此接受登记；同样待产品负责人追认。

| 编号 | 裁定或接受的命名 | 来源 |
|---|---|---|
| L1～L12 | 见 `tmp/assets-runtimes/briefs/S25-fix-1b-2026-09-24.md`「主线裁定」表（原文抄录如下）：L1 content-blocks S-8 标题改「文本块与来路标记」；L2 `implementation.capability`→`implementation.builtinName`；L3 技能包删 `targetEnvironment`（**已被 L3′ 取代，见第四节**）；L4 已出门记录带 `parameterAdjustments`／`droppedParameters`；L5 「切换事实」改「模型切换落下的那条记录」；L6 MRR 逐条承诺到达装配前提 1、2、4、6、7、8、9；L7 `tenantAutoWritable` 取自 asset-evaluation 输出；L8 注册表二次求值「配方同装配、持有与配值取此刻」；L9 hooks-import 不给会话标识；L10 替换件由会话资产注册表判、怎么造归执行运行时；L11 asset-model examples 行号、asset-governance 收 `name_not_projectable`；L12 content-blocks 登 G | 修复波 1b |
| N-1 | tool-definition：判参数时未知键一律拒；模型面不改写 schema；`ToolSource` 命名；`ModelToolName` | R2a |
| N-2 | loop-extension：C-9 `before_model_call` 否决即运行落失败；RP-33 不承诺自定义重试件会停；`consumed` 不触发「调模型之后」；`UnavailabilityPolicy` 记录值 `fallback`；PF-002「谁可以安装它」读作 `usableBy` | R2a |
| N-3 | mcp-endpoint：`not_fetched` 是显式取值；逐动作项按动作名键（A-G12）；条目名拼法「接入点:动作」 | R2a |
| N-4 | connector：起草时主线给定的形状（其 G-9 所列），专项讨论后按收口结果取代 | R2a |
| N-5 | call-accounts／messages／arrival-events：C-12 两种成本归属；`level_1`～`level_4`；loop-extension 名字空间；`block_id_duplicate`；「一个回复只有一份权威内容」；`released` 名；`about`；AE 各处规格层推导 | R1 |
| N-6 | model-profile：`$defs/ModelProfileContent`；MP-5 例外只管 `maxOutputTokens`；S-28 逐成员相等规则；model-response S-11 ⑤ 发出值须能用统一词表表示 | R2b |
| N-7 | asset-governance：S11-G2/G9/G14/G17/G18/G19 与命名、持有默认取当前、钉官方版本、官方资产由部署清单登记、`creationKey`、分享结束后 shared 持有不动、删除即归档；asset-transfer：T-1 失败名、T-2 `listPendingForOrganization`、S11 名、A-M21、A-M25；asset-model：词法、五支来路、`byAgent`、`versionSelection`、`carrier`；asset-evaluation 2026-09-23 追加裁定；evaluation S-21 `execute:` 前缀即权限项；K38 推导（组织型复制通知发出时记 `byAgent`；缺席 `unavailable`）；K37 代行 = 以被读租户的 TenantId 为调用方、跨进程服务身份归 OG v2 G-7；OG v2 §十三 双版本服务规则（写按 v2、答按钉住版本、无时刻的旧记录 v2 读 `unavailable` 不回填） | R3 |
| N-8 | TER：`notInForeground`、`AdmittedCall`／`UnparseableCall`、`reportedCost`、四原语交回值（等待 `answered`／`ended`；发帧 `accepted`／`dropped{rejected\|notAFrame\|executionEnded}`；报账 `recorded`／`rejected`／`executionEnded`；交回 `settled`／`discarded`／`escalated`）；租户核对先于判重（R-29）；交回写不下去 `escalated`（R-30）；报告写「没有持有」却提交了动作 ⇒ `dependencyUnavailable{registry}`（R-33）；G-13 七条（一批依次、本地实现撤下不影响在途、落点不到位 `failed{environment_unavailable}`、参数不合即刻失败带用法、未知键一律拒、单函数同规则、即刻收场次序）；tool-admission `tenantAutoWritable` | R4a |
| N-9 | MRR：`basis`（openCall／settleReply 输入）、`canDispatchAgain(session, callId, plan)`、`reply_pending`、`settleReply` 单次提交写 `vetoed`／`consumed` 体、不属于任何 Run 的调用在会话重新承载时对账；directory：`origin_not_custom`、官方清单 origin 非 official 取 `malformed`、`officialProfileReadOnly`／`relistProfile`／`loadManifest`／`relisted`、恢复在册不发通知、已撤回的行可修订 | R5 |
| N-10 | runner：G-13 两条（`before_model_call` 否决等于运行落失败；回复落盘前被否决追加一条提醒）；asset-registry：G-16（`onAssetChange` 作触发操作、`commandAvailability`、`slotConflict`→`toolNameConflict`）、K30 读法（配方同装配、持有与配值取此刻）；mcp-bridge：G-14（连接不上签名、按持有寻址、收口次序、OAuth 落据点、最小规范化） | R4b |

| L13 | **`tool` 表里每条条目的执行权限都按尝试钉进可用性报告**：asset-registry S-11 的 `effectivePermissions` 由「每条钉住的 MCP 动作条目恰一项」扩为「`tool` 表里每条条目恰一项」——常驻与作者写的工具取第二次求值（S-24 ④）里该工具执行权限项的 `EffectiveValue`（含 `tenantAutoWritable`），MCP 动作照旧；runner S-29 第 5 条统一从报告取，一次尝试内不变（与 S-11 第 1 条同一口径）。runner G-18 关。理由：作者写的工具与 MCP 动作在放行判断面前没有区别，两处取值就要有两套新鲜度口径 | 修复波 1b 丁报回 6 |
| L14 | **asset-evaluation S-42 的三条推导接受**：① 生效资产没声明该项为假；② 工作区提供的资产为假；③ 组织格的界按项名对齐、不论那份持有在不在效（与写面 `lockedAbove` 同口径，分叉时取更严）。租户格无该资产持有时第四档怎样落地（先加持有再配值、还是要求已有持有）并入 tool-admission G-2 的范围，本位只答界与锁 | 丁报回 4、5 |
| N-11 | asset-evaluation PRE-2：租户格以 `organization` 支持有同一份被分享记录时，随它所在组织那份 `shared` 持有一起判「此刻仍然成立」（2026-09-24 R3 修复时的规格层推导，主线追认） | 丁报回 7 |
| N-12 | hooks-import 缺 `session_id` 不在导入报告里另说明，与 `transcript_path`、`permission_mode` 同一处理；asset-evaluation G-6 闭合时读入工作区承载清单那条路也要判 `name_not_projectable`（mcp-endpoint S-26 已列该登记点） | 丁报回 8、9 |
| N-13 | skill-package（L3′ 落地）：成员名 `environmentRequirement`（值沿用 tool-definition `$defs/TargetEnvironment`，不叫 `targetEnvironment`——那是工具的落点与身份类设置词条，技能这里是固定声明）；M13 多收「多带 `default` 即拒」；「没有脚本不得声明」的理由补「平白让技能在满足不了那项要求的部署里不可用」；拒绝值仍八个，`binding_layer_unknown` 改落在该成员上 | 丙报回 |
| L15 | **不在此刻组合里的工具条目不牵连同批**：asset-registry S-11 里，`tool` 表条目的能力标识不在第二次求值的组合里（被禁用、被移除、本租户用不了）时，那一项写显式值 `not_in_composition`，`unavailable` 只留给求值本身失败；tool-admission S-8 对 `not_in_composition` 的项单独判 `deny{reason: not_held}`（S-14 收该 token），不算缺依据、不使整次 `admit` 失败；runner S-29 第 5 条同口径。理由：租户此刻不再持有它是一个结论，不是没有结论；整批全拒只该留给判不出来。与 G-17（构成变小何时生效）的产品裁决方向一致偏严，用户裁定后若取「下一次运行起」再放宽 | 丁报回 1 |
