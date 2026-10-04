# tool-admission 行为契约

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 设计并实施第二阶段。公开形状归 `src/index.ts`；本页只约束类型不能保证的行为。分阶段兑现范围由实际验证证据报告，不以本页存在宣称全部实现。

TA-1（core/tool-admission）官方经过绑定来自真实 runner 链；token 只指向其结论，确认最终结论前无执行效力。缺正式系统贡献、缺报告或权限求值失败必须拒绝执行。核验不消耗 token，唯一次执行由 TER 承担。

TA-2（core/tool-admission）沿 TA v2 既有四步算法、批次同序等长与整体失败语义；grants 与有效权限快照由可信宿主取值，workspace 不提权。opaque 类型不替代可信构造与当前读口。

TA-3（core/tool-admission 与 core/tool-execution-runtime 各守其一侧）核验返回的 checked 指向实际核验的 scope、日志 ownerGeneration 和完整前缀 tail。执行方只能使用同代同尾构造并提交意图，append.tailEquals 必须等于 checked.tail；前缀、尾或 owner 换代即重新核验。执行方不接受普通调用者携带的 checked，核验后不能另取新尾直接提交。
