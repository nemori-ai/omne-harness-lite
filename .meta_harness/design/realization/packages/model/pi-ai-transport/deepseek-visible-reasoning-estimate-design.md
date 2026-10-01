# DeepSeek 可见推理详情的参考计量

2026-09-30，revision 2，candidate；未技术采用、未实施、未实际验证，新增 bindings 0。本页补充已采用的 [v10](v10-token-estimate-design.md)、[v12](v12-usage-calibration-design.md)、[v13](v13-output-history-design.md)，不改原受审字节。持续消费者为两款 DeepSeek 官方定义、独立 InputMeter 和模型调用规划器；实现方案或固定上游 encoder 变化时复核本页。

## 基准、性质与证据

基准为已接受 MR9/RT10 的计量语义及当前两款 DeepSeek 实现，接受依据沿 [D107](../../../../record/decisions/model-input-usage-calibration-adoption/decision.md)。本次不新增公开操作、输出组语义、对象或存储；RT12/MR11 后继沿用此计量责任。相关对象仍为已定义的 ModelDefinition、ModelProfile、ModelInvocationInput、PendingModelResponse；对象归属不变，未经尚不存在的装配反查索引核实。

领域读数沿既有已封存性质：全部实际输入须有有据计量或发前拒绝（RT10 S-74）；估算不冒实际值/上界；稳定 P 不重新 tokenize，I/φ/δ 不漏计或双计（S-77/S-78）；独立公开计量不偷读日志/凭据/环境（S-79）；保留完整原响应、实际 wire 与上游 usage（MR9 S-43）。此次补读已知机制，不声明新的双盲封存。

[实际旧响应及固定 encoder 调查](../../../../../research/model-request-adaptation/reports/2026-09-30-deepseek-reasoning-history.md)说明 Pro/Flash 的真实首轮 `reasoning_details` 是可见 `reasoning.text`、`format="unknown"`、`index=0`；当前 guard 一律拒绝，旧受控三轮的 `delta.reasoning` 没有覆盖它。pi/omne-next 提供保留与回放路径；DeepSeek 固定官方 encoder 能编码文字 `reasoning_content`，不证明 OpenRouter/DeepInfra 的隐藏转换与该计数相等。本页采用的是**有来源的估算候选**，不是上游等值事实；原始样本亦不证明当前绑定认证通过。

## 最小承载与范围

落点为现有家族 InputMeter 的纯数据投影（#1），不是新服务。固定范围只为 `deepseek/deepseek-v4-pro-0813` 与 `deepseek/deepseek-v4.1-flash` 经 `deepinfra/fp8` 的当前官方贡献；不按厂商名字放行所有未知格式。

一次有限解码供 full、边界预处理、φ/δ 共用；复用既有 Pro/Flash 官方 tokenizer 与各自 tool-aware encoder，不复制 encoder，不在型号叶子各放一段兼容分支。候选私有函数名由实现者选择，不增加公开 DTO 或 runtime 参数。

| 实际 wire 中的消息 | 计量投影 |
|---|---|
| 没有 `reasoning_details` | 沿既有参考编码路径 |
| assistant，恰一项 details，其 own keys 恰为 `type,text,format,index`；type 为 `reasoning.text`，text 为字符串，format 为原字面 `unknown`，index 的精确整数值为 0；消息不同时具有 `reasoning` 或 `reasoning_content` 键 | 在仅供计量的派生副本中将该 text 交参考 `reasoning_content`，去掉 details，其他字段保持；原 body/serialized/units、原块与摘要均不变 |
| 其他 details 形态、字段、角色、多个元素、summary/encrypted、双文字来源或含糊字段关系 | 不作本映射；计量依据不足，沿既有 unavailable／full回退／最终input_size_unavailable |

这里的 text 直接来自实际发送体，空串是可见的空文字；不经序列化 JSON 长度、密文字节或摘要猜隐藏 token。固定 encoder 负责带/不带 tools 时的原生参考规则；私有 serving 转换差异仍属 estimated。没有证据承诺误差上界，不引入未经验证的修正常数，宿主原有可配置 margin 只在合成后应用一次。

此增量**不采用任何新的 DeepSeek aggregate O→回放输入映射**。full 计实际参考表示，φ/δ 计既有参考边界差；均不另加原 O 或 reasoning_tokens。原 O/组事实不删不改，仍参加现有显式来源与选择合法性核验；不因它未用于数值公式就过滤历史。body-only 的公开 full 计量不要求捏造一个原响应组；显式交入的组若非法，必须由共同守门拒绝，不能用可见文字分支绕过 H13。

实施前提：当前 `defineInputMeter` 仅冻结函数并填默认值，不能声称它已校验来源。已有共同校验位于 `input-meter.ts` 导出的 `measureFull`、`measureReplay`、`measureNew` 包装函数；当前两款 factory 的直接方法调用尚未确保经过这些包装。本次须将两款 factory 内部原始计算对象与其公开方法组合：公开 full／φ／δ 调用对应共同包装，包装再调用私有原始对象，避免递归；不复制来源校验，不依赖 planner 恰好再次校验，不因此改写其他厂商算法。保留共同包装既有 unavailable／invalidInput 判定及无 HTTP 副作用。该责任是已接受 H13 的落实，不新增契约承诺。

## 覆盖、失败与版本

full 首先确认原 body 与原 serialized 一致，再只对有限解码后的派生表示编码及计原有 supplemental；同一 details 文字不能同时进入 reference 与 supplemental。最终请求字节、图数和图像内容门继续检查原实际请求。带图片的 Flash 保留原图像估算，没有新图片公式。

P/G/N 的划分、原输入锚及共同覆盖分配不改。边界构造可在线性投影中解释 P 的这类可见 text，但 tokenizer 只收到既有有限旧终端差和 G/N 后缀；禁止为了支持新形态把整个 P 重算一遍。φ/δ 的 supplemental 也经过同一解码，不能把 details 元数据又序列化成 token 代理。非前缀变更、模式/tools/basis 改变继续使锚失效并 full；full 仍不能解释的输入保持拒绝。

发布时将该家族 implementation、两款 definition 及实际算法/边界/transform依据提升到新的唯一修订，原固定 lease 不热替换。新入口直接采用当前实现，不保留旧 factory 或兼容重载；历史事实保留原坐标，旧到新 basis 未证明兼容就 full，不伪造校准连续性。窄路由核验复用当前定义，不再写死一套会滞后的版本字符串表。

非法显式 history 的拒绝、未知 details 的不可判和上游拒绝是不同层：前二者不发 HTTP、不产生新响应/账；后者保持真实请求及用量事实，不能自动降参数、删历史或重试。

## 对账与反向核对

| 对账 | 结果及承担 |
|---|---|
| A 性质承载 | 原wire保真与费用沿现共同层；来源校验复用现有共同包装，并在两款 factory 的直接公开入口补齐接线，不能假定 `defineInputMeter` 已完成。家族只提供可见文字参考估算。稳定P零tokenizer访问、一次计数由同一边界构造＋测试核实；上游误差不承诺为零 |
| B 内核负面清单 | 无新增持久/跨fiber事务、可靠投递、权限或时序保证。精确实际usage继续以上游事实为准，内核不替估算背书 |
| C 原边界复查 | 不新增来源真值、O转换、公开操作或消费方身份。full/φ/δ共用现有值图，不扩大Session/Run责任；若实现发现须改变语言无关性质，停该分支回spec，不偷改 |
| D 代价 | 共享有限解码＋两叶修订。继续全拒绝会阻已选模型的真实多轮；把所有details按JSON或密文数token没有依据；让每型号各自修补会重复边界和判定。选择复用固定encoder的有限明文投影，代价是需实际路线差分验证，置信度只到estimated |

Cordis 继续原官方模型贡献插件/transport service 固定整份 meter，采用版本沿 D025，不增加新上游主张、service/fiber/inject/事件。构件装载时取得原tokenizer与策略，初始化失败不发布半份；一次调用的派生副本随规划结束释放，插件卸载与既有lease/实停责任保持。跨进程无新状态可继承；原响应及真实上游费用不因本纯函数结束而改变。新增Storage要求0、装配节点0、bindings0。

## 实施与验收义务

DV1：两叶经真实公开plan/invoke与Cordis transport，用捕获形状的 `reasoning.text` 受控流各做有/无tools三轮，核固定输入形成full→marginal→marginal、实际wire保留详情且资源实停。旧delta.reasoning通过不替代本项。

DV2：原body/serialized、details与原组digest逐值不变；直接full、φ/δ一致使用单一解码，工具有/无的参考encoder行为对照其已固定fixture。同一text不在supplemental再计，O和reasoning_tokens没有新增加项；逐负控type/format/index/extra/mixed/角色/重复文字来源，未知形态发前拒绝。

DV3：稳定长P的tokenizer访问为0，G/N仅后缀及有限边界；原强前缀、basis、tools/mode变化产生正确full，不能清空历史或旧O。已有H13非法组/重复目标/部分组反例仍拒绝；必须直接调用两款 factory 返回的 full／φ／δ 方法验证，不能仅通过 planner 或独立包装函数的测试充作直接入口证据。共同包装接线、无递归与 body-only 合法 full 均须覆盖。

DV4：两leaf来源/算法修订、真实reader/public及最终runtime service在HUB组合验证；旧binding真实证据只复用不受影响部分。至少有/无tools真实历史与上游input usage对照记录估算误差，不能将受控usage当实际精度。沿唯一预算账本，由root执行有限真实验证；不因此重做全部37模型或旧已有效门。

DV5：更新包双语README、制品消费及受影响测试；未知与失败原件保留。当前无新代数/并发性质，不扩旧TLA证明范围，以既有共享形式边界及上述具体正反例验证实现。候选须独立architecture-reviewer判断与主线技术采用后才能释放实现；是否需spec后继由审查具体反例决定，不凭字段名把明文归成无条件opaque许可。
