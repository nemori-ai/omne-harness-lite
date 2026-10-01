# 两家优先提供者增量：独立定点评审

2026-09-29。候选未接受，review 不代替主线技术采用或实现验收。最终受审 commit `d6bd6af7f218a3c51c95611f995425ee901ce25f`：

| 对象 | 精确 SHA256 |
| --- | --- |
| [提供者 revision 5](../../../realization/packages/model/pi-ai-transport/priority-family-output-cache-candidate.md) | `59efdb9f397ba5d74f00ba7e2b125a175e68615eaf88707e6eea69fd30ef1def` |
| [选择附页 revision 1](priority-family-choice.md) | `6cfdbaebe928e36971ae721b2797ee5b572038f85a06bb36becd8090251d7fec` |

评审者分别为独立 architecture-reviewer 与 spec-reviewer，均只读上述对象、已接受 RT10/MR9/D107/D109 接缝及两篇固定研究。未重开 T29、未执行源码验收或 paid 请求。本页由调度者记录原报告结论，不自行代替独立判断。

## 实际修订轨迹

| 基线 | 发现或修订 | 后继 |
| --- | --- | --- |
| `aaaae006` revision 1 | reviewer 读取主体；作者随后据两厂商事实核清旧宽 envelope 并非原生窄签名前缀，补三态分类及 body→projection 核验 | `eda2dd16` revision 2 |
| revision 2 | 两 reviewer 独立识别 P→X→signedG 反例：boundary≤G.start 允许插入 X 后仍通过旧 P 摘要 | `940361aa` revision 3 要求 boundary=G.start，三路径同负控 |
| revision 3 | spec review：独立 full 的既有 TokenMeasurement 无 invalidInput，不能与 planner 失败面混写 | `5b3c203a` revision 4 分开 planner malformed、独立 φ/δ invalidInput、独立 full unavailable |
| revision 4 | spec review：剥 cache_control“两个键”可歧义成保留空对象 | `d6bd6af7` revision 5 明确移除整项顶层属性、PF4断言不留空对象 |

这些是有明确反例与语义差分的修订，不是把同一未改基线反复送审。最终两文件摘要均按 Git 对象固定。

## 架构评审结论

最终 revision 5 **未发现阻断、无新增非阻断问题、无新增产品待裁决**。完整组唯一贡献源、Pro O/I 分离、三态分类和来源门有保护点；private input 身份关联、实际 projection 派生、同步 finally 清理使前缀事实寿命可兑现。宽摘要相等仅作充分条件，合法变参无法证明时 unavailable 是明确有限域。纯图严格末端谓词、TTL配置及 planner-owned 中立投影成立。O+0估计误差与 OR 实际 pure-image 行为仍是工程/真实验收，不冒称形式或路由证明。

## 规格表达评审结论

最终 revision 5 的 full 失败面、boundary 精确等式、宽 envelope 充分条件与整项 cache_control 剥离已明确；定点检查未发现剩余阻断。非阻断验收补充纳入本次施工：**PF3 必须增加只变 effort/max_tokens 的请求，预期必要贡献 unavailable，而不是 invalidInput 或“签名非法”**。它直接检验已写正文的有限域，不能只断言“未通过”掩盖错误分类。

## 未覆盖与后续责任

两次评审均未执行实现：对象复制/重入/finally 清理、覆盖去重、有限 source 全值、真实两入口共路、旧函数删除仍须 PF1–PF5/PF8。PF6 每叶新行为多轮观察与 PF7 四 Anthropic 纯图暖读/TTL 仍待，旧文字 cache 收据和旧 binding 不能冒充当前行为。当前没有新增绑定，主线接受精确候选后才能实施；接受不表示厂商完整交付。
