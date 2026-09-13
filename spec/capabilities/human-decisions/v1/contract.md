# 耐久人类请求与决定 v1

本契约身份为 `capability.human-decisions`，版本 1。规范依赖：[共享数据 CD](../../../data/core-work/v1/contract.md)、[共同准入 CC](../../../compositions/core-work-coordination/v1/contract.md)。

正文跨能力条款引用：[SR v1](../../session-run/v1/contract.md)。

## 请求与合法作答

**HD-01**：请求由相应系统或 Agent 能力创建，具有不复用 requestId、tenant、
来源 Session／Run／调用或独立 WorkRef、kind、不可变内容版本、合法作答者规则、
状态和后果策略。kind 区分 question、agent_approval、system_approval、
specialized_consent、provisional_decision。来源及权限不能由自由文本推导。
question 和 agent_approval 的合法作答者固定为 Session.owner；创建请求不能
配置成管理员或其他成员。管理员的治理关闭权不包含代答权；该限制在 answer
处再次强制验证。专属同意和系统批准仍按具体动作的合法授予主体裁决。
问题说明为何问、答案会影响什么；批准说明真实动作／对象／影响、缺少的授权、
拒绝后去向及可选决定；系统审批内容从冻结 Action 派生。

**HD-02**：状态 pending → answered／cancelled／superseded，后果交付状态独立为
not_ready／pending_delivery／applied／failed／unknown。首个合法答复决定唯一
outcome；comment 对批准请求只记录评论，保持 pending，不占用首次决定。
含糊自由文本不转成 approve/reject；question 的非空/选项/多问项完整性按请求
Schema 校验，错误答案明确拒绝。请求身份、内容版本及 current revision 必须
匹配，迟到／重复答案返回当前真实结果，不改动其他请求。

**HD-03**：创建阻塞请求时，耐久提交 Action／request 和来源工作等待关系后才
呈现；相同调用与同一动作不能因通知重试创建多个待办。等待绑定一个精确
continuationId／动作位置；该位置禁止继续，但不把同一逻辑 Run 的独立请求
合成全部答完的屏障。没有合法就绪接续时 Run 进入 waiting_human，停止普通
模型／工具驱动，仍接受获准答复、精确控制和普通排队输入。回答 q1 使 q1
对应接续就绪，q2 仍 pending 也不妨碍 q1 获得串行驱动占位；同一 Session
同时仍只有一个执行驱动。人类请求不设数量上限，不以工具批次上限变相限制。
尚未准入的受控动作不执行；同批已准入工作按其所有权继续收口并记录，不回滚
已发生效果。系统不为等待自动设置答案或超时，热宽限到期只能释放运行资源。

需要返回模型上下文时，将原未完成调用表示为具名 deferred receipt（含原
request/call 引用），与终态工具结果区分；接续上下文加入已答事实和未答清单，
不伪造 q2 的答案或成功结果。只有依赖该答案/许可的动作受其等待约束，不能
要求所有待答请求归零才处理 q1。request、continuation 与依赖动作关系由
系统权威记录，模型只能提出后续动作，仍经当前工具门。

**HD-04**：等待、请求、动作参数及已发生事实在独立耐久 owner 下存续。Agent
回收只撤除本地等待器／订阅，不能取消请求；重建从同一 requestId 与等待位置
恢复。cancel、force_stop、工作终态清理或明确取代在共同提交内关闭对应阻塞
请求／继续权，迟到答案和恢复不得复活。普通 interrupt 保留 question 和
agent_approval 待答事实，但设置全 Run 人工中断阻塞；后来答复不能自行清除
该阻塞，须显式 resume。随工具取消的 system_approval 同时 cancelled；没有
实际启动的待批工具不能声称转后台成功。interrupt_then_run 对旧 Run 的此类
工具请求标 superseded，结算 cancelled_before_execution；独立问题保留在原
interrupted Run，答复不驱动新 Run，恢复仍受 SR-11 的合法接续检查。

**HD-05**：answer 先认证当前作答者，核对请求特定资格、组织及实际工作状态，
再原子提交唯一决定和待交付后果。会话 owner 不当然有权代设备 owner、外部
账号主体或组织管理者授予专属权限。专用同意经其专属能力结算，普通批准接口
不能伪造它。请求 pool 只转交这个操作，不自行生成授权事实。

## 批准与执行接续

**HD-06**：system_approval 的 approve 产生仅该 Action 可消费的一次性决定，
不是新的持久 grant。实际执行前再次核对当前规则、原精确绑定、待执行位置及
决定；在共同准入中将该决定标记被原调用消费并记录许可。重复答复、后果重放、
实例重建均不能形成第二次消费或另一个调用。执行结果未知时沿原 attempt 查询，
不能重用批准创建重试 attempt；再次实际尝试须有明确重试政策与新的准入。

approve 后权限变硬拒绝或专属资格丢失，记录 approved_but_not_admitted 及原因，
动作不执行；授权仍可申请但原请求不再适用时关闭旧后果并建立新请求。声明／
实现／参数／资源／环境范围变化不静默替换 Action，原请求 superseded 后重新
解析和判定。已合法批准的历史保留，不改写成人类拒绝。

**HD-07**：reject 结算该调用为 denied_before_execution，产生可信工具结果／
原因，解除它对应的人类等待，允许同一 Run 在没有其他阻塞且仍有执行权时从
该结果继续。此处“其他阻塞”仅指该 continuation 的前提和全 Run／Session
控制阻塞，不含其它独立请求仍 pending。它不授予执行原动作或自动重试权限，
也不必取消整个 Session。
模式从 standard 改为 unattended 不猜测人类拒绝；按新规则使请求失去可执行
后果并显式关闭／取代，保留设置变化原因。已有充分 grant 或改回 standard
也不自动把 pending 请求标 answered；有权用户可以关闭旧请求后重新请求准入。

**HD-08**：决定与对应工作在同一协调域时，决定结果和唯一 continuation 意图
共同提交；不共域时沿 CC-05，以 requestId/outcomeVersion 为目标去重身份。
continuation 只解除本请求对应位置的阻塞，多个请求独立并按耐久就绪顺序
获得驱动；不越过作用于整个 Run／Session 的 interrupt、hold、
终态、当前租户资格或预算门。目标暂不可达显示 pending_delivery，不要求用户
重复回答。当前端被关闭或通知丢失时可重新投影并重试同一后果。

## 统一决策池

**HD-09**：pool.list/get 是按当前身份获准范围聚合的索引，引用原请求，不拥有
第二份决定。每项包含来源、可自足的必要内容、真实状态、可选动作、当前可答性
和已知后果。可答性区分 available、unreachable、not_placed、unknown；pending
不等于此刻能够提交。跨 tenant 条目保留显式上下文，各项读取／答复独立授权。
首版不离线代收决定；不可达时明确拒绝该次提交而保留请求，不能凭 UI 缓存答复。

会话和池里的 answer 使用同一操作；并发批准/拒绝只保留首个合法结果。通知是
同 requestId 的投递，不创建新待办；送达／已读／重发／呈现窗口到期均不改变
决定。列表失效、已关闭项和迟到更新根据原权威水位修正，不无限显示悬空可答项。
筛选可按状态、kind、tenant、Session 和创建顺序；分页游标固定查询水位，不
跨权限变化泄漏旧内容。未获准 tenant 不能通过计数或错误泄漏存在性。

## 合格暂行确认

**HD-10**：只有领域能力显式注册并经验证的 `ProvisionalContract` 可以延后确认，
它必须定义暂行承载、禁止效果、完全撤销函数、依赖登记与回传策略，并绑定
版本和实际执行提供者。注册审批需求不自动获得此资格；不支持完整撤销的发送、
付款等效果仍走事前门，补偿不等于撤销。资格失效后禁止新的暂行执行。

**HD-11**：领域 staging 先过当前暂行准入，生成耐久且受遏制的产物及对应决定
请求；请求拥有独立 WorkRef 和稳定 owner，允许原 Run 继续／完成。不可逆外部
可见效果在 finalize 前被实际提供者阻止。领域原子保存产物/request 关联或沿
可核实交接保留责任，不能形成无主暂行产物。产物依赖是显式无环图，使用暂行
父项产生的后代也必须暂行或在正常门被拦截，不能以“读已成功”绕过关系登记。

**HD-12**：approve 先记录唯一决定，finalize 复核当前资格并只在所有暂行前置
已正式生效时生效；子项先获批准仍保持 staged_waiting_dependencies。reject
立即封闭该产物及其暂行后代新使用，按依赖逆序调用领域完整撤销，结果逐项记录；
撤销失败保留 revoke_failed 与隔离和重试责任，不标已完全撤销。后代已批准但
尚未正式生效不能越过父拒绝；不改写后代历史答案，后果记录 dependency_revoked。
并发 finalize/reject 由领域共同屏障排序；尚有未决依赖不得抢先 finalize。

回传策略必须在产生时声明为只改变产物、下次运行可感知、一次接续或显式补偿
流程；后果交付按原工作权限和去重运行。暂行决定呈现窗口只影响界面位置，
无超时默认决定。本版交付资格与治理协议；具体动作目录及实际完整撤销证据由
各领域逐项登记，未登记动作不得声称支持先做后批。
