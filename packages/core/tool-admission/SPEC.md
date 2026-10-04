# tool-admission 行为契约

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 设计并实施第二阶段。公开形状归 `src/index.ts`；本页只约束类型不能保证的行为。分阶段兑现范围由实际验证证据报告，不以本页存在宣称全部实现。

TA-1（core/tool-admission）官方经过绑定来自真实 runner 链；token 只指向其结论，确认最终结论前无执行效力。缺正式系统贡献、缺报告或权限求值失败必须拒绝执行。核验不消耗 token，唯一次执行由 TER 承担。

TA-2（core/tool-admission）沿 TA v2 既有四步算法、批次同序等长与整体失败语义；grants 与有效权限快照由可信宿主取值，workspace 不提权。opaque 类型不替代可信构造与当前读口。

TA-3（core/tool-admission 与 core/tool-execution-runtime 各守其一侧）核验返回的 checked 指向实际核验的 scope、日志 ownerGeneration 和完整前缀 tail。执行方只能使用同代同尾构造并提交意图，append.tailEquals 必须等于 checked.tail；前缀、尾或 owner 换代即重新核验。执行方不接受普通调用者携带的 checked，核验后不能另取新尾直接提交。

TA-4：经过读口只读取 runner 已建立的本任活体记录，没有登记或签发操作。读取核当前 run.advance，并匹配实际 SessionAccess 对象、tenant/session、宿主借用及官方贡献代。合法访问但没有该任经过是 passUnavailable；来源故障是 unavailable，不能以缺席代替。inputs 为前链改参后的有效候选，同序 finalKeys 来自各项固定锚及官方 final occurrence。

TA-5：forPass 固定经过记录及全部输入。返回的 Judgment 只接受同序、逐值相等的整批输入，grants 必须为相同对象。改调用、定义、权限、模式、父约束或答复不能形成另一场合法准入。绑定、经过、贡献或提供者失效后旧 Judgment 返回 unavailable。判断前后均核当前授权和原经过，不把新一任经过接给旧绑定。

TA-6：关闭先拒新绑定和判断并使旧绑定失效，再排空已接纳的真实判断及授权读取。贡献者不响应停止时，不承诺有界关闭。正式 token 仍须确认持久结论及整批完成，forPass 本身不写结论或启动执行。

TA-7：ToolActionHistory.inspect 只投影传入的完整 CheckedPrefix，不执行 IO 或另取尾。scope、物理代与连续位置须一致。合法缺少调用为 notFound；已有调用但未整批完成为 pending；无首次路由为 none。必要来源缺失、未知所属版本、重复身份或关系冲突为 unavailable。投影不是授权，准入与 runtime 各自作最后判定。

TA-8：正式核验在日志 IO 前后检查当前 tool.submit；普通调用者不取得 session.log.coordinate。畸形输入或非正式 token 为 invalidInput。合法输入按 call_mismatch、arguments_changed、not_admitted、run_ended 次序判断。尝试换代不等于 Run 结束，不自行使原准入定位失效；新执行仍由 runtime 核当前尝试。核验依赖实际官方最终结论、原采用、完整模型批次及完成事实，不能只相信 observed 或摘要。
