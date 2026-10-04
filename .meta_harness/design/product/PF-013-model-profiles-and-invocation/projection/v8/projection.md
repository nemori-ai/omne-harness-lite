# PF-013 · 两家优先模型贡献与纯图缓存投影 v8

2026-09-29，candidate，未接受、未实施。局部快照仅投影 OpenAI/Anthropic 的共享完整输出贡献及 Anthropic 纯图断点；不替代 PF-013 全部投影、不修改产品正文、不重开 T29。精确来源见 [provenance](provenance.json)。

沿 RT10/MR9、D107 v13、D109 v15 与原 basis 适用接缝；没有新公开 MR/RT 字段、operation、服务、存储或 Session/Run。唯一规则在[提供者 revision 5](../../../../realization/packages/model/pi-ai-transport/priority-family-output-cache-candidate.md)，选择和改票条件在[提案附页](../../../../record/proposals/model-input-usage-calibration/priority-family-choice.md)。

| 已确认需求 | 窄提供者承接 | 边界及待验 |
| --- | --- | --- |
| 公共实现加模型窄适配，有依据 estimated 与配置余量 | 跨厂商唯一完整组覆盖/去重/贡献函数；九 OpenAI 新叶与四 Anthropic 叶用完整 O+0 estimated；现三 GPT56 非 Pro 规则保持 | 净 framing 0 是假设，无精确/上界保证；六 Pro 的 I scope_unknown 不改；原 source/摘要非法不能借 full 绕过 |
| 完整历史与响应校准，不逐型号算法补丁 | full/new/φ 同一组计算，未知格式不可回落 JSON 分词；signed/encrypted 同组 text/tool 只计一次 | Opus5.5/Fable 需要实际 prefix 事实及精确边界；现原宽 envelope 摘要限制了合法变参后的可估域，不伪造窄摘要 |
| 原生支持的缓存需配置且验证命中 | 四 Anthropic 合格 last_message 纯图末端映射 OR 顶层 automatic，TTL 从当前声明配置读取；普通有效 text 路径保持 | 空目标明确失败；只对已证同一末端 planner-owned 控制移除整项计量元数据；真实 wire 不删，命中需真实 usage |
| 研究形成家族解法及精简自主补丁 | 合并旧 OpenAI 遍历/组检查和重复 basis 分支，删除旧执行过渡，保留合法原 O 事实解释 | 实际删除 diff、16 叶参数化正反验收及两入口组合仍待；不把两个家族的估算/缓存假设推广至其它六家 |

Cordis 归属不变：直接函数与已有 service 复用同一 planner/meter；签名前缀派生事实只在同步计量期间按本次 input 身份关联并 finally 清理，不持有历史内容、不成为新生命周期对象。完整选择、有限型号记录与验证表由唯一节点维护，本快照不复制另一份算法权威。

PF1–PF8 要求新 source/revision、工程与真实 public/service 接续、实际缓存及旧证据复用边界；当前新增 bindings 0。设计 review 不代表实现或模型正式认证，旧 paid 收据不可改标签。精确采用由主线决定。
