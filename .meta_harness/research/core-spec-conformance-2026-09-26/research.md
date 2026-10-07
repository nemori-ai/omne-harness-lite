# CB2／SA2 一致性调查

对象为 baseline omne-harness-lite-design-2026-09-15 的 CB2、SA2及公开 core 消费者；观察时间2026-09-26，静态固定基线a5c54b15，主调度公开CB产物probe在4e9a0c3a。CB源码与frozen资源在这两基线相同。逐资源摘要及实际结果归 evidence。两项观察足以构成局部矛盾，不构成全规格不成立或所有实现错误的推广。

## 一手事实

1. [SA2 examples §5](../../design/spec/capabilities/stream-assembly/v2/examples.md)第25/26行的 open head 模态不符，却期望索引拒绝。 [SA2 S25](../../design/spec/capabilities/stream-assembly/v2/contract.md#s-25-判定次序)把 head_modality_mismatch 排在全部序列拒绝前；[AR2 S28](../../design/spec/data/arrival-events/v2/contract.md#s-28-表示层拒绝值)该谓词不需要已有open上下文。版本外SA verification的旧记录也明确同fault从index_reused转head_modality_mismatch。
2. [SA2 S10/S11](../../design/spec/capabilities/stream-assembly/v2/contract.md#s-10-工具调用在封口那一下解析且只解析这一次)沿D060 N32要求非法名字原样成为完整未解析调用；[CB2 S12](../../design/spec/data/content-blocks/v2/contract.md#s-12-完整的工具调用)与Schema在所有完整调用上统一要求ModelToolName，未解析分支无例外。root实际调用公开judgeContentBlock，bad:name完整未解析调用返回malformed，原JSON结果已保存。正文／Schema／产物三者在CB2这条约束上相符；矛盾在联合消费承诺，不是单凭实现测试失败推出。
3. 当前TD源码 judgeToolReturn先调用CB judge，再判result_call_in_content；AR源码将嵌块malformed延后，自身Fill/Close形状禁止tool_call，replace工具调用要求string。主调度已回读这些关键代码，独立spec-reviewer也复核完整非法输入的结果，而非只看合法域。

## 推导与局限

由事实1可推两行期望与固定拒绝顺序不能同时成立；未见可解除该矛盾的已有open前提。由事实2可推固定CB2／SA2下，非法名封口分支不存在同时满足两者的合法输出；型别字符串、跳过judge或改名都不能改变Schema约束。

在假设仅把完整未解析调用的tool扩为收到的非空string、保持其它断言与拒绝次序时：Messages/MR/Loop可以直接到该值，TD非法ToolReturn结果可从malformed变result_call_in_content；AR该完整调用作为非法填充／封口最终仍malformed。此部分是静态推导，尚未运行修订后产物对照；不能声称实现等同已验证。AM／AE标准正文路径未直接到调用实例，但 AM2 Schema精确引用TD2／Loop2，默认端口换ID不可能自动供应旧ID；任意外来声明端口未全量审查。

旧SA形式模型明确不覆盖参数解析形状及表示层拒绝顺序，既有TLC结果不能消除此反例。本调查未运行形式工具；未审完全部非core运行时，未据此证明任何新版本。规格与采用的处置归D068。
