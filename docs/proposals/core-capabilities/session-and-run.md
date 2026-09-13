# Session、输入、Run 与状态恢复（候选）

本页依赖[共同契约](shared-contracts.md)，与既有 live-agent／附着 v1 组合。
Session、输入与 Run 的逻辑 owner 不随活体实例变化；工具执行及 HITL 继续拥有
各自事实。首版一次 Run 的驱动占位独占，后台工具可独立继续。

## 长期会话与历史

**SR-01**：Session 保存 SessionRef、不可变 tenant/owner/initiator、原 DefinitionRef
及选用版本、来源关系、生命周期、标题/手动标志、pin、模型选择、历史水位和
控制修订。create 只接受当前获准且可用定义，相同操作重试返回原 Session。
list 支持获准范围内按发起者类型、来源、状态、时间、定义和日程引用过滤；
分页与排序使用系统确认事实，发起者不是 owner 或授权主体的替身。

**SR-02**：生命周期 open → archived → open 或 open/archived → deleted；
deleted 不可恢复，身份不复用。rename/pin 条件更新；人工标题锁定后，迟到自动
标题只能作建议，不覆盖。archive/delete 在仍有非终态 Run 或未安全收口责任时
返回 busy 和有权披露的原因，不能隐式 cancel；用户先控制原工作。
成功归档封闭输入/激活并将未取批队列项结算为 closed_by_archive，删除为
closed_by_delete。恢复不重新入队，重新检查原定义和当前资格，不换成别的定义。
归档可受权读历史；逻辑删除只保留治理允许的墓碑/审计，不承诺物理擦除。

**SR-03**：历史保留原始已受理输入及编辑/取批/运行结果的事实关系，模型输入
视图只包含已取批的有效内容和明确历史切点，不读取当前队列全文。可变目录、
控制状态、模态集合和查询索引分别有 owner 与水位；投影缺失可重建，不制造
空历史、无模态或未占用的结论。摘要是引用原切点的新事实，不能覆盖原件。
历史审计能保留旧输入版本，普通模型上下文不得使用已撤回／未取批版本。

## 输入队列

**SR-04**：队列项具有 inputId、内容引用与 revision、受理序号、当前排序位置、
kind=text/command、状态 queued/held/taken/withdrawn/closed，保留原受理和修改
关系。容量按已配置项目数/字节上限在受理时检查，满时拒绝；禁止替换旧项腾空间。
附件必须在同一受理中取得有效引用占用；上传完成不意味着输入受理成功。

enqueue 的到达行为由本次选择/用户偏好求值得到 queue 或 interrupt_then_run，
实际值入账。queue 不修改在途请求；plain supplementary text 不充当 HITL
answer。读取设置失败时明确失败而不随机中断。接受成功须在内容、身份、队列
位置及整体意图耐久保存之后；重复操作查原结果，不创建额外消息。

**SR-05**：edit/reorder/withdraw 使用期望 itemRevision 和 queueRevision；
只对未取批项成立，多端冲突返回当前修订。编辑可替换文本块；媒体不可变，
需要增删附件时作为明确内容修订并更新引用，已取批内容不可编辑。调序给出
明确的有序成员集合／目标位置，不能以过期全列表覆盖新加入项；服务端在当前
队列下判定并返回统一结果。withdraw 不取消其他输入或 Run。

**SR-06**：takeBatch 在同一短裁决与耐久提交中固定队首连续合格 text 项的
身份、修订、内容和顺序，遇 command 停止；不存在活动驱动占位、队列非 hold、
Session open、权限／定义／模型可用方可建立新 Run。队首失权明确阻塞或结算
拒绝，不悄悄跳过不合格成员；不得临时扩充已确认批次。相同取批重试认回原 Run。
消息边界原样保留，合批不把多条原文改写为摘要。后到输入进入下一批。

**SR-07**：有序 command 声明默认位置、让行规则及是否清除等待文本。命令
受理固定其清除目标集合，只包含当时仍等待的文本；重试不扩张。让行给后到
文本只能到声明的有限次数／截止序号，用户显式调序覆盖原自动位置，禁止
持续新输入导致无限饿死。command 不是任意脚本或跨项成功依赖。独立失败
结算且无未知效果后可继续下一项；unknown 和 hold 不可冒充可继续。
即时 interrupt/cancel/force_stop 不排到目标工作后面执行。

队首 command 由 `takeCommand` 在同一队列/Session 门下领取：核对确切定义、
参数修订、当前资格和期望 queueRevision，将该项 taken、分配唯一命令执行
身份和驱动占位，一起耐久提交。命令处理者只消费该身份，效果使用同一
operation 去重；成功/拒绝/失败/unknown 及后果关联耐久结算，确认安全后
释放占位再处理后续项。崩溃后查询原命令操作，不重建一次新执行。它与
text 取批互斥，不把命令文本交模型猜执行；异步效果沿 CC-05 保留责任。

“立即清除等待文本”是即时控制，在受理时固定并结算目标项，不等待轮到
队首；通过 slash/keyboard 进入时也相同。有序命令若声明在执行阶段清除，
只清除受理固定集合中届时仍未取批的项，已消费项明确 excluded_taken，
不追溯撤销执行。声明必须区分这两个时点，不能仅用含糊 clear 布尔值。
领取命令不免除其实际效果提交时的当前执行权检查；force_stop 已撤销原
epoch 时，迟到 clear 等命令不得继续修改队列，安全停止回执覆盖这条通道。

## Run、Step 与执行权

**SR-08**：Run 有 RunRef、固定输入批次／触发依据、modelSelection、定义和
预算依据、执行 epoch、驱动位置、阻塞集合及状态。状态为 preparing、running、
waiting、interrupted、stopping、completed、failed、cancelled；completed/failed/cancelled
为逻辑终态。活动驱动占位由 `(SessionRef,RunRef,epoch)` 精确持有；waiting
也占位，防止普通排队输入越过待答工作。一个 Run 可多次激活不同 AgentRef，
但新 epoch 必须使旧执行者失去继续提交权。

Step 是一次已绑定模型请求及返回工具批次的工作单元，或具名辅助工作；
每个请求重试使用新的 attempt，但不改变 Step；后一轮模型决策产生新 Step。
驱动位置只可在耐久输入批次、模型结果/未知处理、工具接纳/结果关联和等待
结算等安全边界推进，不序列化调用栈。Run 的模型固定到本次 Run，后续用户
选择保存在 Session 供下一 Run 使用，不在 Step 之间静默替换。

**SR-09**：驱动仅在有效 Run epoch、live-agent 工作许可、当前业务资格、没有
全 Run/Session 控制阻塞，且所选 continuation 的本地前提满足时取得下一个
Step。其他独立人类请求仍 pending 不阻止已答请求的唯一接续；按耐久就绪
顺序串行获得同一 Session 驱动，占位不能复制。没有就绪接续时等待，不
产生无意义的模型轮询。tool-returned 记录须匹配原 call/attempt；LLM 返回
工具建议不是已执行工具。并发工具结果保留实际完成顺序和模型呈现顺序的
分别记录，不用完成顺序重写模型建议的关联。Run 可在确认独立后台责任后
完成；晚到结果继续归原 Step，后续感知为新的输入／上下文事实。

continuation 结束不等于整个 Run 完成。普通 completed 仅在所有本 Run 接续
已结算、没有 pending 阻塞请求、没有未处理就绪接续，且剩余后台责任均已
确认独立持有时成立。q1 接续完成而 q2 未答时，Run 回到 waiting 并保留 q2；
不得利用普通终态清理取消尚待答的独立请求。显式 cancel/force_stop 或
不可恢复失败才沿其具名终止政策关闭剩余请求，并保留原因及已完成接续。

## 控制及后台差异

**SR-10**：控制请求有 operationId、精确 RunRef、观察 epoch、范围和实际
结果。旧目标自然结束返回 ended；Session 当前换成新 Run 返回 stale_target，
不重定向。受理、施加、物理停止、清理与外部效果状态分别表达；跨端重复
点击查询同一事实。控制权限不自动给正文读权。

interrupt 封闭目标新的 Step，终止该 Run 的在途模型观察并请求取消原 Run
所有未结算自有工具（含后台）。逐个取得真实停止/未知及清理结果；安全
收口后状态 interrupted，保留 Session、部分历史和恢复位置。resume 只对
匹配 interrupted 或有可解除阻塞的 waiting 生效，复核当前资格并取得新 epoch，
不能清除仍待人类答复的阻塞，不自动重试已中断工具。cancel 形成 cancelled
终态，沿相同自有调用范围收口，不能被恢复或迟到结果重新启动。

**SR-11**：interrupt_then_run 先耐久记录新 input、当时精确 Run 和复合意图，
再封闭旧驱动。旧 Run 的可转后台前台工具尝试转后台，失败则中断；不可转
后台工具中断，已后台工具保持执行。只有各项已确认由独立执行 owner 承担，
或停止且安全结算后，才能释放旧驱动占位。旧 Run 记录 interrupted 和
`supersededByInput`，保留接续与工具归因；不会自动恢复。

新输入和其他 queued 项仍按确认顺序由 takeBatch 处理，不获得优先通道。
旧 Run 自然结束则正常排队；已换成另一 Run 时不打断它，新输入仍已受理。
任何一项停止/交接未知时，复合意图显示 pending/unknown，不能确认完整成功，
原责任继续阻止新驱动。尚待批准的工具未执行，不可 detach；原调用结算
cancelled_before_execution，相关审批 superseded。独立问题保留原 Run 的
中断阻塞，不能被新输入误消费。重试不再次中断后来的 Run，也不恢复新输入的旧版本。
用户日后对旧 interrupted Run 显式 resume 仅在 Session 没有活动驱动时可受理，
并核对中间历史/旧逻辑目标是否仍可合法接续；不相容返回 superseded，不换工作。

**SR-12**：force_stop 立即撤销目标 epoch 的继续执行／结果提交权，尽力停止
已受控执行体，记录物理停止、隔离、残留与外部效果未知。旧结果只可作为
隔离证据，不修改有效 Run 结果。后续队列等安全停止/隔离依据确定后才准入。
Session 范围强停还将队列置 hold；仅用户显式 continueQueue 或撤回解除其
对应状态，不因为清理完成自动启动下一 Run。单 Run 强停不隐含全会话 hold。
受理强停后 Run 进入 stopping，并持有不可由 resume 清除的终止意图。只有
全部原执行者确认停止，或已建立覆盖迟到启动及结果提交的有效隔离后，才
进入 cancelled(reason=force_stopped) 并释放驱动占位。unknown 不等于安全停止；
不能证实隔离时保留 stopping 和原责任。隔离后仍可能存在的外部效果、费用
和清理责任独立记录，不能用 cancelled 表示它们已经回滚。继续队列只解除
hold，不越过 stopping 占位，也不恢复被强停的 Run。
结构化后代、脱离委托和 handoff 的传播交给 PF-004 专属关系，不从后台工具
策略推导子 Agent 权限或终止规则。

## 状态贡献与恢复

**SR-13**：可替换状态贡献注册 stateKey、Schema/version、owner、kind=authoritative/
projection、初始化/升级及撤回政策。authoritative 值只能经所属操作条件更新；
projection 由确定性 fold、输入类型版本和 watermark 重建，不允许旁路写入。
同作用域同 key 冲突拒绝；缺少解析器或不支持数据版本时该能力 unavailable，
不返回默认空值。卸载撤回运行贡献，不删除需保留的耐久状态；重新装载先校验
当前权限和兼容性，不激活旧句柄。持久数据版本迁移须保留原件／显式依据。

**SR-14**：恢复先校验日志前缀、schema/reducer 版本、定义/配置/组件和执行环境
能力，再从原合法位置重建。恢复兼容证据包含所需契约版本、实现协议、媒体
可达性及外部工作原引用，不仅比较 OS 名称。已开始但无明确结局的调用向原
执行 owner 询问；原背景工作仍存活则重新订阅同 call，不能重复派发。无法
确认的模型请求/工具外部效果记 unknown 并阻塞依赖决定，历史读取仍可可用。
已删除 Session、cancelled Run 和关闭的 HITL 不复活，writer/Run 旧 epoch 失效。

本版不承诺任意执行栈热迁移、任意 OS 间无转换恢复、工具外部效果自动回滚或
未受理离线草稿保存。实际支持环境由实现验收提供；语义允许未来独立部署，
所需精确身份、耐久意图、当前权限与失败协议不依赖进程内对象传输。
