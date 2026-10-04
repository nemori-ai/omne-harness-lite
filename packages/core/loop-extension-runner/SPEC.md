# Runner：整批动作与官方准入

本页拥有新增的整批动作、准入贡献登记及其代际行为，采用阶段二 ar3 实施简报。其他未迁 runner 行为仍沿现行旧承诺，不由本页替代。

RA-1：dispatch 的 before_action 只接受整批请求。宿主核实际 Run、attempt、adoption 和完整模型回复，提供同序稳定锚。
请求必须包含原批次中全部解析成功项，保留原序；来源不可读返回 unavailable，请求与真实来源不符返回 invalidInput。
数据在首个 await 前复制并冻结，grants 保留不透明身份。report 必须与本次真实 adoption 相同。
grants、运行模式和父约束来自可信宿主；请求不能以另一份形状合法的值代替。grants 核对象身份，其余核值。

RA-2：只有真实非空模型批次全部不可解析时允许 actions/anchors 为空。此时仍核实际链和官方贡献，返回 gate 与空结果，不构造虚假经过，不调用空 admit。
本条限定取代旧 runner v5 对 actions 必须非空的要求。单项 replay 仍可读取 before_action，不调用贡献或写日志。

RA-3：gate 是本次采用的链与贡献事实。链无官方末位记 missing/chain；定义在场而贡献或声明依赖明确缺席记 missing/contribution。
来源读取失败为 unavailable，不能充当缺席。官方定义在场时须唯一、末位、固定 builtin、veto 和 admission fallback。
gate 不授予执行权。后续撤除不改写已采用的事实；真实 admit 前后仍核原贡献与经过有效。

RA-4：各项先接续自己的前链，rewrite 必须先确认结论。每项已结束、asked、失败或到达官方末位后，才对到达末位且有表项的候选集调用一次 admit。
候选集为空不调用。无表项与 not_in_composition 分开；权限和 tenantAutoWritable 来自同一 EffectiveValue，不补缺失政策。
普通拓展件使用单项输入；官方贡献使用经过源固定的整批有效输入和原 finalKeys。

RA-5：任一项失败时整次不交效果或 token，已确认结论保留。任一项 asked 时整批不返回 admissions，不能提前交出其他项的 token。
失败或取消须释放会合等待者；贡献实际 Promise 未结束时，关闭仍保有其排空责任。

RA-6：已最终项按原锚和真实历史重建，不再次求值；仅未最终候选进入新的 admit。
未知写未认回或旧写可能迟到时禁止重入。物理恢复保持原业务 Run/attempt，不能借新 attempt 重用旧 adoption。
宿主对换代返回 attemptSuperseded，对已结束 Run 返回 unavailable。部分完成和整批完成的持久确认仍由应用驱动拥有。

RA-7：只有实际官方末位的最终 observed、有效工具表项、完整非等待批次，才返回该项正式 token。
token 是定位值；持久核验、整批完成事实、当前授权与执行意图的共同提交另由准入和运行时保证。

RAC-1：官方准入贡献只有一格。registerAdmission 在同一任已有登记时抛出装配错误，不覆盖现任。
普通 registerBuiltin 不接受 OFFICIAL_ADMISSION_NAME，不得借普通单项调用签名冒充整批准入。
登记属于可信装配面，不授予不可信工具 Context 或插件装载权限。

RAC-2：捕获的 lease 固定贡献代。旧撤除函数只移除自身那一代，不得删除后来登记。
开始调用前与真实 Promise 完成后均核代际和登记状态。失效或抛出时返回 failed/unavailable，不转调新贡献。
业务批次的实际授权、输入和结论仍由经过源、准入绑定与 runner 写入协议核验。

RAC-3：Cordis Service 的登记以调用方 this.ctx.effect 拥有，贡献者卸载即撤除。
关闭先拒新登记／捕获／调用，再等待已开始的真实 Promise 结束。服务不可见和提前拒绝结果不等于贡献已停止。

## 正式准入定位值的纯映射

本段按阶段二 tk1 选择承接原准入提供者 TLT1–3。它只拥有 runner 结论键与 AdmissionToken 的映射。
公开准入行为仍归 core/tool-admission；编码或解码成功不证明结论存在、整批完成或当前获准。
本项目当前集成的准入提供者共同消费此映射；只实现 AdmissionToken 接口不代表支持该格式。

TLT-1：正式格式为 admission.2. 加无填充的规范 base64url。载荷是 UTF-8 编码的 JSON.stringify 字符串三元组：callId、参数摘要、finalKey。
解码后重新编码必须逐字相同。非法 UTF-8、别名编码、非法身份和非三元组拒绝。纯判断的 admission.1 不是正式格式。

TLT-2：finalKey 必须是 runner/5 在 before_action、固定 omne-official:admission-judgment、final occurrence 的规范键。
解码只验证键形状；实际调用、原锚、scope、结论内容及日志代和尾仍由持久核验确认。

TLT-3：参数摘要是 canonical 参数 UTF-8 字节的 SHA-256，以 64 位小写十六进制表示。
数使用 ExactDecimal.toCanonicalString()，数组保序，对象按 JavaScript 字符串键排序并递归编码。
字符串、布尔值及 null 使用 writeJsonLossless。同值数和对象成员换序的摘要相同，不同大整数或数组换序不得混同。
