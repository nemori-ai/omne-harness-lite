# 成组契约交叉修订：revision 4

2026-09-29，candidate，未接受。接续 [r3](technical-choices-r3.md)，仅修订下列关系；此前能力 A、唯一 Session 日志事实源、消费者独立、原归属与授权等选择不变。本轮真实反例与精确基线见 [首轮契约评审](contract-review-r1.md)。这是修订方向，不是实现采用。

## 原回复证据与首次发布的消息

ready 与 final 的 `response.reply`、原 usage/cost、route、raw、时间与 inputCalibration 仍保留同一份原模型产出证据；final 只增加合法处分及真实 late。ready 与 response.reply 不成为第二条会话消息，不用于替代正式消息组装。

persisted 批首次发布唯一 AssistantMessage。其身份、原块序列、原块所有成员（包括已经存在的派生属性）、标注和原话与 response.reply 相同。仅真实系统转换件可在**原本没有派生属性的合格块**上按 CB3 S19/S22 与 LC6 S23 添加合法成对 renderings/transcript。原块不能增删或调序；合法 `renderings.blocks` 内新产生的派生块仍被允许，必须符合块类型、标识唯一和可见性规则。不能通过剥掉全部派生属性再比较来掩盖覆盖已有事实，也不能把此次例外推广为消息落盘后的补写。

最终原子写方负责核实当前消息写入/处分资格、真实系统转换来源和完整扩展关系，然后仍以同一个 Session 日志 batch 写消息与 final。普通 consumer 提交同形值或自报 system 不授予此权。批回执未知时保留并认回原消息、原 final 和原完整批，不能重新转换后替换重送内容。

**选择理由与代价。**现行产品明确转换件挂派生不是改写模型说的话；PF009 的唯一消息是在 persisted 批首次发布。保持原响应证据可避免为了迟到处分长期占用旧模型 provider，也避免重造旧校准。代价是 MS/MR 跨记录比较从逐 JSON 等改为严格、来源受限的单调扩展关系，必须新增正反组合检查。落选方案“final 改成转换后 reply 并重算 outputGroup”会修改原响应证据、引入原投影解释器的重新取用及真实性关系；其优势是消息与 final 仍可逐 JSON 比较，但此处代价更大。

## 校准必须先核原事实，再判所选表示

原 outputHistory／response.reply 与原 `outputGroup.blockDigests` 的真实性检查不放松。可判来源或摘要矛盾仍为原 malformed/invalidInput，不得降级 full 来绕过。只有原事实已经成立，再独立核实唯一 persisted 消息的合法派生扩展及**本次实际选中的表示**，才判原固定投影/φ 对这份回放是否适用。

已证合法选择导致原输出贡献映射不适用时，按既有规则全量计量；无法取得所需真实来源或关系不能被确认时明确失败/不可用，不能把未知当成合法转换。需要精确的选择视图时由成组契约及后继提供者明确，不让 caller 一个“transformed”布尔绕过验证。保持原 `outputHistory` facts/摘要，禁止为当前选择改写历史 `inputCalibration`。

本次**持久 AssistantMessage 的合法派生**与另一个候选中的 request-local 图片准备是两种不同来源关系：前者在首次消息发布前由系统转换件完成并同批存下，后者只改变当前网络发送表示、不修改日志。不能以后一种临时 mapping 证明前一种日志关系。共享接口如需要后继增量，必须单独对齐既有 H13 真实来源检查，不修改其冻结受审版本。

## 普通重新取得与失联追补

reconcile 保留为先识别会话中原调用的入口。live 分支只读确认原状态，允许当前合法消费者另行 acquire；它不要求存活网络停下，不取消、不重新发送。已有 final/ready 优先认回。只有确实需要追补的原调用才适用实际旧网络/门/全部写者已停止、唯一恢复资格和完整权威前缀等条件。全会话存在 live 调用不能被误解为对账失败，更不能为了满足停止前提取消它。返回闭合集合必须包括这些识别分支。

## 创建拒绝与零发送终结

`undispatched` 保持“尚未发出过”的原含义。创建检查即拒绝时，在同一拒绝批中建立 creationKey→CallKey 与 rejected 输入关联；没有 accepted created。已经成功发布 accepted created 后，首次 dispatch 因当前凭据或规划门拒绝时，沿原 CallKey 写零发送终结，**不再建立 rejected creation**。原采用内容、原 creationKey 映射和历史成功创建事实不变；同 key 重入认回原身份/绑定及当前终态，不重新选择档案或改判当时创建结果。数据分支、成对字段、判重和读取均须明确。

## 精确评价与未完成事项

architecture-reviewer 对本轮“原回复证据与首次发布消息”方向作只读定点评估：产品层相容，未发现必须新增产品裁决；最强反对点是形成两个消息权威，已在上述第一节禁止。其要求原派生不得覆盖、真实来源不得由形状冒充、unknown 认回原批，以及回放表示变化不能误用原输出贡献。该评估未看到修订后契约、未运行测试，不关闭原 A-B1。

随后主线补充 H13 约束：任意已知来源矛盾仍 invalidInput；仅明确合法选择的不适用性可进入 full。上文将此作为修订硬边界。第二份契约快照仍需两位 reviewer 复评及新的实际检查；realization/implementation 未放行。原 TLA 有限结果不覆盖本节跨记录转换关系。
