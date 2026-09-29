# 独立架构评审与处置

## 受审对象与结论边界

- Reviewer：`/root/usage_calibration_architecture_review`，2026-09-29。
- 精确受审提交：**`c662f6852fec4d43a99c94fa4e62d643b79377af`**，U0 revision 1。
- 对象：A/B/C 数据承载与责任边界选择；核对 MR8、RT9、MP6、CA2、MS6/SL3 及用户已定范围。未运行测试、形式工具或产品操作。
- 正式结论：本范围未发现架构阻断，支持 C 作为后继候选规格基础；置信度中高，仅限责任边界选择。**评审不等于接受**，不表示规格发布或实现验证完成。
- 主线随后选择 C 作为后继候选规格施工方向；本包只登记该施工方向，不创建接受记录。当前包 revision 3；revision 2/3 是作者处置与范围澄清，不冒充初次评审已覆盖这些新字节。

## 一、阻断

本次范围内未发现阻断。评审确认：I 与 φ/δ 精度分开；最终前缀包括消息、system、tools 和计量相关 envelope；耐久 owner 仍是 response/reply 的 SL3 同批；service 授权关联与公开纯规划分开；分支/重试/乱序不取最后到达值；没有新增 kernel 事务、计量后台服务或业务控制事件，lease/settlement 沿 RT9。

## 二、非阻断及处置

| 发现 | 原位置与依据 | 触发及后果 | 作者处置及复核状态 |
|---|---|---|---|
| 移除为旧日志兼容而设可选的动机 | revision 1 简报§3、§6；用户破坏性演进要求、SYS-EXPERIMENT、RT9 S-74当前格式边界 | 新runtime把缺新字段的MR8旧值当合法后继值并自动全量fallback，会新增未授权旧读取承诺，混淆格式缺失与usage确实不可得 | `10f33c82453d549ca681fba162c551d894652700`：后继当前格式校准字段及observation判别必填，语义缺usage为unavailable；旧格式拒绝、不可解释耐久值、原在途责任沿RT9，禁止回填。由reviewer/主线复核，作者未自行接受 |
| 固定兼容判定权威链 | revision 1 design§3/§7/§8 G3，简报§1/§3/§4；RT9 S-74(3)(5)(6)、handbook性质承载要求 | provider/template/retention变化或适配换代后若只有caller兼容标签，各消费者可能补不同规则，把旧I用于新口径 | 同一`10f33c82`提交：绑定的适配/计量提供者拥有版本化basis/φ/meter与兼容依据，固定调用持有精确组合；planner验实际最终输入和声明，未知/不可判全量回退，计量仍不可得沿unavailable；禁止caller trust/skip布尔。字段由spec细化，owner已定；待独立复核 |

以上两项不改变 C 的边界选择；评审将其判为局部施工输入修订，没有升级为架构阻断。

## 三、范围外待裁决

- **G1**：PF-010 §6.8 压缩硬fit后置条件不能由estimated准入代证；归产品/上下文压缩架构owner。本纵线不实现compaction，不据此否决C。
- **G2**：各模型φ精度归模型适配提供者及验收者，以具体路由证据认定；缺exact依据保持estimated/unavailable，不需因此暂停通用规格起草。

## 四、未覆盖

- 尚无新TLA+、Schema或realization待审稿；只核施工要求，未验证义务已实现。有限oracle不能证明真实tokenizer或上游计量准确。
- 未复测百万token benchmark，也未独立核验线上模型/OR行为；性能结果不能证明φ精度。
- 跨进程身份重验、证据完整传递、固定计划及binding生命周期仍由后继契约/realization兑现；未凭进程内绑定推定分布式保证。
- 精确版本保留、字段命名、Schema引用闭包和操作九项表达完整性归spec-reviewer。作者已明确双盲未达成，评审未将其当独立领域封存。

## 候选反方与复查触发

Reviewer支持C：保留输入实测原精度，并让知道实际回放形状的下一规划解释输出。落选方最强理由分别是：A载荷/关联成本小；若消费者已有可信来源，A可避免C重复存关联；若未来回放域在写时固定且φ准确稳定，B可简化读方。C增加输出组校验/适配责任，也不能消除最新opaque输出事实缺口。若后续证明关联能由既有耐久字段无歧义取得，或写时已经固定未来回放域，应复查A/B，避免重复载荷。

## Revision 3 的窄施工澄清

主线要求形式化只建**新增校准状态及其与既有RT/SL协议假设的组合**，不重建整条纵线。简报§5已划分新增动作与环境事件、assume/guarantee边界，并保留全部原负控性质。既有协议环境假设不算本次模型已经证明，实际I/O与停止/释放仍需原有及后继组合证据。此项是施工范围澄清，不改用户方向、不删验证义务。

## Revision 3 独立窄复核

2026-09-29，原独立 architecture-reviewer 核对 `69b27bff67b166b9d219c1ad2084189a6e8b18d9`：两项非阻断在设计输入层闭合，未引入新架构阻断；评审登记没有把施工方向提升为规格接受。新增校准性质与既有 RT/SL 保证组合的形式化范围合理。负控必须实际破坏新增校验或事实传播并击中断言，不能被环境假设吸收。G1/G2及尚未运行新TLA、尚未审查新规格/realization的范围限制保留。该复核只判断修订的责任边界；后继候选规格仍须独立审阅。

## 2026-09-29 U1 第一轮独立规格及架构审查

冻结受审提交 `f5891f5afebfe468b08cdb67fcaa6c0e2ca9e25c`（HUB 等价 `c0415666`），MR9/RT10、Schema、89 条候选 covers 及新增形式任务。spec-reviewer 完成十三操作/公开函数消费链、表达、登记与形式对应；architecture-reviewer 独立核性质承载和投影。二者只读，没有重跑 TLC 或实现测试，均不构成接受。主线核对作者 83 文件摘要、19 配置/原始日志；[原始证据](../../evidence/2026-09-29-formal-model-input-usage-calibration/README.md)保留 17 Schema 例、5 正向配置和 14 指定负控，以及失败和修正经过。

### 阻断与处置

- **B1：read→invoke 观察事实交接缺责任。**RT10 S-59⑤仍只承诺原 CA2 usage/cost；上游 total 已知但缓存分项未知时，reader 可合法丢掉唯一准确输入总量/出处，S-79无法履行独立函数返回观察的要求。两评审同意固定适配 reader 必须保留并交出同次 observation/provenance，invoke 明确传递，不私读不透明响应或加隐藏旁路。由规格作者补 S-54/S-59/S-79 同一链，不新增操作或服务。
- **B2：known outputGroup 缺可解释的版本。**MR9 S-43引用 requestInput 的 projectionRevision，而 Schema 允许 requestInput unavailable 与 known outputGroup 并存。由规格作者补输出摘要自身耐久版本及跨值关系/正反例，保留合法部分事实；不让消费者猜当前版本。
- **B3：没有能检出“不用新锚”的形式性质。**RT10 S-79/S-82承诺稳定条件下重锚；EventuallyDone 允许总选 full/拒绝。架构评审另指出始终选最早合法祖先也可满足既有守卫和 ErrorReset。由作者加入准确观察确认后在稳定后继规划中实际采用新锚的条件性质、正向配置及 NeverUseAnchor/KeepOldAnchor 最小负控；保留原有限终止性质，不扩十三操作状态机。上述反例是静态构造，不能写成已执行负控。

### 非阻断与未覆盖

规格评审 N1：新旧 G-35 重号；新增适配证据 gap 改用未占编号并同步引用。N2：规范 verification 中含可变验证状态和运行经过；保留规范义务，结果移版本外/evidence。架构审查未发现第四项语义缺口，继续支持 U0 C 的既有边界；非加性贡献、两类失效、分支来源、原批/lease和未知不作零已有保护点，前提和有限域不能删除。

主线认可这一轮的五项处置范围，已交原 spec-drafter 集中修订，新运行另目录保存。**U1 本轮未通过采用门；U3 不放行。**压缩硬窗口政策与各 provider 的实际 φ/δ/兼容依据仍是原 owner 的明确缺口，本轮没有新增产品裁决。性能改善、实际 tokenizer/网络/存储/租户、完整旧模型复验均未覆盖。

## 2026-09-29 U1 修订二独立复评

冻结提交 `62ab2001f095566dcb6b5cfeaaf7c1c3c1ff755d`（HUB `1fef9c90`）；UsageCalibration 模型 SHA256 `18d9acad96865e38ea7a847bec3ebec78f937ae059bf511ff52aff3e951c9684`。同两位独立 reviewer 分别完成表达复评与性质承载窄复核，**原 B1～B3/N1～N2 全部闭合，本次范围无阻断或新增非阻断发现**。

B1：S-59固定reader解释并经同一终止事实交出 observedInput/provenance，S-54承接，错误/取消不抹掉已知事实；禁止不透明/诊断旁路。B2：输出组自有必填projectionRevision，请求未知仍可解释输出，双方known须相等。B3：S-77/S-82与新增重锚性质选择最新可用因果祖先；StableSuccessor只限制环境，不强制planner执行待证明选择。NeverUseAnchor和KeepOldAnchor分别表达两种违例，EventuallyReanchored排除提前拒绝导致的空泛通过。N1新增gap G-37与原LC6 G-35分开；N2规范verification保留义务，可变结果移版本外。

两位均只读，查看20个Schema实例及新增形式日志，未独立重跑或复审未变旧模型；主线逐项核验的86份输入快照、22份配置/原始日志和实际6正16负结果见[第二轮证据](../../evidence/2026-09-29-formal-model-input-usage-calibration-2/README.md)。初始结果判读字符串修正没有改写原始日志或冒充产品修复。

主线据此释放三个既有节点的 realization 候选起草（core/model-response、model/pi-ai-transport、model/model-request-runtime）；契约仍 candidate，**尚未采用、尚未放行 U3 实现**。实际模型 φ/δ/兼容证据、压缩硬fit政策、真实授权/存储/网络、性能改善与端到端交付仍按各自边界验证，复评通过不代替这些结果。

## 2026-09-29 U2 core 整体审查与 transport 窄反例

独立 architecture-reviewer `/root/usage_projection_review` 只读核对 HUB `970cf35e`：core v9 正文 SHA256 `a650ba101257ca9ee51b9d6cb8520c7351aaf53eb6e6fceba5e5d210e6813726`，transport v12 正文 `338c0d71117798719c02e51bc090eca046e69480892322d17db1d0884e207cba`；结束时摘要不变。本轮未运行产品测试、形式工具或模型请求。

**阻断 B1（仅 transport 正常 Anthropic 增量采用）**：完整 wire message 摘要纳入每次移动的 cache_control，四条官方 explicit/1h/last_message 路由在正常追加时旧断点消失，稳定内容每轮 prefix_changed→full；assistant/tool 的 string→单 text 数组还有表示变化。保守回退保证安全，却不满足稳定前缀仅计新增的性能目标，不能标为后续优化或通过。固定适配提供者须给出有来源、有型号/路由/角色范围的 input-bearing 投影；实际 wire/字节/逐图检查不变，未知字段和真实内容、role、tools、reasoning 变化仍须失效。有限 token 同值或缓存命中不独自证明普遍中立。须补三轮 full→marginal→marginal、稳定历史 tokenizer 零调用，真实内容/未知字段/换代负控，以及 public/service 和百万输入分项成本。φ/δ 允许有依据的 estimated 加配置余量，不得把旧 P 的未知变化藏入新增估算。作者另行修订，本轮未关闭 B1。

**core 范围无阻断，也无新增非阻断发现**：已核 R9-P1～P5/V9-1～7、MR9 S-27/S-39/S-41～45 和 RT10 S-79～82。六共享类型及 copy 只负责表示、自有快照、局部关系；validate 保持 Schema-only，judge 保留具名拒绝顺序；摘要、真实来源、祖先和 φ/δ 分别归适配及 runtime。共同提交对象明确为 SL3 原 response+reply batch，无第二写者、服务或存储。可在有权者采用规范与此映射后独立实现纯 core。

**范围外及反方**：压缩硬 fit 与估算准入差异仍归原 owner；保守全 wire 摘要有不遗漏未知变换、容易审计的优点，但已知正常路径代价不满足目标。core 的 codec/unknown 原子性、真实授权及 runtime v16 整体交接仍待组合验收。规范有限模型不证明厂商 tokenizer 准确性。本轮意见不代替采用。

## 2026-09-29 U2 runtime v16 整体架构审查

同一独立 architecture-reviewer 只读核 HUB `9ac88753`：runtime 正文 SHA256 `17e4552faac16a3ab03aa974b210e150ac1fc96a5982f4812b8e549e203c978d`、README `42ad0b028f270dbe7a19d57eaf960abc04872ab6d77f25b72bbaa5a009105eae`、verification `6d214af100803292603f9f1b073ee4463b67baf17fa9dc4d6565901ba562b04d`，结束复核不变。范围 U16-P1～P7/V1～V12 及 MR9/RT10/core/transport 交接，未重复 core 全审。

本节点无新增阻断或非阻断发现。受控历史读面和 runtime 核授权前缀/原 response/reply/选入关系，planner 核 P/θ/G；不合用的新响应不遮掉旧合法祖先。reader 的同一累积器交 final facts，实际停止另判，取消不等待未来usage。自有捕获的计划固定 projection/meter/reader/projectOutput；实际停止和结算责任结束前保留lease。SL3原M/R batch为共同存储对象，unknown保留原owner，冷恢复认回原值且零新tokenizer/projection/HTTP。core六值唯一，runtime拥有组合参数及三分支接口，估计不覆盖actual usage。V10/V12覆盖稳定历史零tokenizer与实际demo，不新建app或校准store。

既有transport B1仍未关闭，不放行该组合完整增量交付；U16-G5只登记问题。transport的projectOutput须按runtime唯一三分支账本对齐，由接口表达检查继续核对。无新增产品裁决：G-36硬fit归原owner；U16-G3真实withRun来源不能用noRun或受控测试代签。

未运行实现、形式、模型或性能测试，新增绑定0，V1～V12均为义务。旁路raw、最后到达响应、独立锚store各有简化局部实现的优点，但分别引入第二解释、因果错误或第二提交责任；当前设计避免这些边界，线性扫描/读面成本仍待实测。若实现需绕过final facts、冷恢复依赖当前模型或稳定前缀不能marginal，须重开相应审查。意见不代替采用。

## 2026-09-29 transport B1 revision 2 独立窄复核

Reviewer `/root/usage_projection_review` 核对 `e93e69bf` 上三文件修订（作者提交 `be847d0a`，HUB `f686055c`）：v12 正文 `8e2c62b2379ef7741ad44112421b1e6440849ec43d4b54edd7d94c2ff8e41476`、README `e77691af08c3acc73e13f523cda3a00fd3237c9cec7da36322addbe50d26ff8d`、verification `7999b6af006b6afb999db1ed13c93aeea126dfd85a15defafb7122c13a5594e4`。原 B1 在设计层关闭，无新阻断/非阻断。

只排除四型号/固定provider配置下planner生成的精确缓存控制对象；非空assistant/tool从首轮固定合法数组，不推定string/array计量等价。新basis首次full，未知字段和真实内容仍比较，实际wire/完整字节/图片门保留。UCT-V12四型号public/service三轮full→marginal→marginal、历史tokenizer零调用、恢复旧摘要/假归一/遗漏真实贡献负控可以击穿原问题。projectOutput三分支/fullContribution与runtime v16账本一致，不改授权来源、reader、lease或原批责任。

未实施或执行测试/模型/性能；UCT-V10～12、上游口径/φ/δ及固定OpenAPI制品provenance仍待真实验收。omne-next其他算法/stride不属于本修订前提，若另采用需明确范围。反方全wire更保守却不能完成正常增量；比较时归一化缺等价依据；固定旧断点会改变当前配置。采用仍归主线。
