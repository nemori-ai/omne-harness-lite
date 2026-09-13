# 工具定义、装配、调用与过程披露（候选）

依赖[共同契约](shared-contracts.md)、[授权](tenant-and-authorization.md)、
[HITL](human-decisions.md)及[Run 控制](session-and-run.md)。本页继续发展已有
[工具候选](../tool-system/v1/README.md)，采用 D-006 来源边界，不导入 jobs/PTC。

## 定义与模型表面

**TL-01**：工具贡献有原定义/版本、toolKey、不可变命令表、实现制品/版本和
configuration revision。每条命令有稳定 commandKey、输入/输出 JSON Schema、
权限声明、效果/取消/后台声明、必需 skill 和环境能力。输入先通过具体命令
完整校验再解析 Action；未知 command 或多余/非法参数不得落到默认 handler。
实现只收到校验后冻结参数，不能在授权后再次读取可变原输入改变效果。

多命令工具默认模型投影一个顶层条目 `{command:string,params:object}`；
`help` 为保留元命令，提供获准摘要和具体命令定义，不执行业务效果。完整
命令 Schema 从同一定义派生；可选择一个顶层类型联合投影，但不能为每个
命令增加顶层槽位来声称符合 PF-024。一次调用只选择一条命令；批量、管道
和 shell 字符串不因 CLI 类比自动纳入协议。

**TL-02**：工具别名只在一次模型请求的 manifest 内有效；manifest 绑定精确
定义/命令集合、声明解析器、实现 generation、配置/环境和 skill 内容，记录
模型实际得到的 Schema 与提示材料。返回别名通过原 manifest 解析，不查
“当前同名工具”直接执行。服务端 manifest 和 dependency evidence 不能由
模型参数伪造；读取 help/skill 不产生人类批准。

## 发现、装载与声明注册

**TL-03**：discover 返回获准可披露候选摘要、版本、用途、所需 skill 和
available/requestable/unavailable 及原因。目录缺失/落后/故障必须如实说明，
不是成功空列表。load 解析当前 tenant、definition、权益、精确版本、实际
执行能力和必需 skill，再准备贡献；定义 Schema 存在不等于实现就绪。

**TL-04**：装载自动消费 AU-03 权限声明，取得匹配声明解析器和动作索引；
工具业务入口与有效声明作为同一发布单位准备、校验和发布。身份冲突、未知
词汇、解析失败、重复键或依赖不全阻止该入口发布，不能发布工具后异步补
审批规则。声明注册身份包含原 tool/command/version、贡献 generation、tenant
和作用域；只有原注册 owner 可撤除，旧 disposer 不撤掉后来同名贡献。

可替换解析器作为受管能力，其被选中的精确绑定加入发布单位；声明索引是
定义的派生结果，不另存一份需手工维护的用户授权。每次调用重新求值当前
配置/授权，登记时 allow 不作执行凭证。程序化、后台和插件验证消费者走
同一动作门，按声明的消费类型提交可核实证据，不伪造模型 manifest。

**TL-05**：必需 skill 可以位于工具级和命令级；解析后绑定精确版本/摘要、
必需核心正文和实际资源位置。同一请求相同内容去重，但保留每个使用关系。
正文必须实际进入产生调用的请求，不能用“过去读过”或任意即时摘要代替；
超出窗口时缩小命令集合或拒绝装配。资源按需取得，路径对应真实宿主／沙盒，
读取脚本不自动执行。不存在/不可读/版本冲突时相关命令不可调用。

## 动态变化与在途绑定

**TL-06**：贡献状态 preparing → published → draining → released，失败保留
资源和诊断；条目变更、准入和 acquireUse 使用共同撤销屏障。更新先准备新
发布单位，失败保留旧选择；成功后新请求绑定新代，旧 manifest 的未准入
调用返回 stale_binding。待批动作不持有无限期运行资源；对应绑定撤回时
关闭或取代旧待办，不能把批准搬到新实现。

已经准入的调用持有原实现及必要依赖闭包，排空前不得释放。需要共存的旧
generation 在独立运行所有者／解析范围保留；无法共存的排他环境返回 busy，
或消费已授权的停止/维护操作，不能强杀无关调用。计划卸载先关新准入并
排空，然后 Cordis dispose；突发依赖丢失则新调用 unavailable，原调用
failure/unknown，不在新同名提供者上无声恢复。skill 撤回撤掉派生入口和
指引；它不是撤销已执行外部效果。

## 独立调用与实际执行

**TL-07**：调用有不可变 Action、来源 Step、callId、状态、绑定和原始 caller。
状态为 proposed、waiting_approval、admitted、executing、settled；settled
结果区分 succeeded、failed、denied_before_execution、cancelled_before_execution、
interrupted、unknown。admitted 与真正执行/物理停止分别可见，unknown 不是
成功或“肯定没执行”；之后核实只追加 resolution，不重写原未知观察。

proposed 耐久登记后解析当前门；deny 直接结算，ask 按 HD 建请求，allow
在联合提交中取得预算预留、精确使用和执行许可，再建立 attempt。工具
参数和权限在该次实际开始点都已确定。所有工具从实际启动时由独立执行
owner 拥有，Run 只持有前台等待与控制关系；非后台工具也不能无主启动。

**TL-08**：执行提供者承诺 `start(attempt,permit,binding)`、`inspect(attempt)`、
`requestStop(attempt)` 和按能力提供 `detach(attempt)`／`subscribe`。start
以同一 attemptId 耐久或可恢复接纳，重复返回原执行身份；没有接纳证据
不能先产生外部效果。接纳响应丢失时 inspect 原 attempt，不用新 ID 重发。
提供者无法兑现去重／核实或安全取消的行为时，不可声明相应能力。

外部服务自身不支持幂等时，执行提供者只保证本地 dispatch 不因恢复重发；
网络断点可能造成结果未知，保留实际暴露。一个外部调用可能发生，不能
为了得出确定结果盲目重试。显式新尝试重新过当前授权、预算和重试政策，
其收费与副作用各自记录；一次人类批准不自动覆盖不同 attempt。

**TL-09**：单次 stop 指向原 call/attempt，封闭其新步骤并请求底层停止；
受理、真实停止、清理和外部结果分开返回。不影响其他调用。终态与 stop
竞争时返回真实先后，不能把已完成成功改写成中断；控制后晚到结果按
原执行 epoch 作为合法结果或隔离证据处理。被明确中断的调用不会因
resume Session 自动重试。清理权随原 owner 保留，不因普通 grant 撤销丢失。

## 前后台关系

**TL-10**：执行状态与 foreground/background 关系正交。后台声明包含可脱离
形态、独立 owner、必要资源和重连协议；只有不再依赖 Agent 临时资源且
原 call/attempt 可观察／控制／结算时，detach 才确认 background。
转换只改变关系，不创建新调用、不重启实际工作。重复 detach 返回现状；
完成与 detach 竞争按原实际结果回答；未支持、已停止和暂不可用具名反馈。

自动转换使用声明阈值、配置上限和 Run 剩余执行预算共同得到有效阈值；
三者及计时来源记录到调用，阈值必须在预算截止前留出已声明的收口空间，
否则启动前不承诺自动转换。使用单调执行时长，HITL 等待不计为工具执行；
状态恢复不得把已过阈值时长清零。单次手动/自动转换失败保持原关系并
报告原因，预算到期走停止；只有 interrupt_then_run 明确要求转换失败
后中断，不能把此复合政策扩成所有手动转换的默认。

**TL-11**：Agent 重建根据 Session／Run 的 call 引用向独立执行 owner
inspect 和 subscribe，重连同一 attempt、原结果与费用。工具 host 自身
故障时的持续执行保证由其声明决定；未支持的 host 丢失标 unknown/lost，
不声称无限生存。后台完成可在无 Agent 时保存结果和待交付引用，后续
运行按权限感知。Run 普通 interrupt/cancel 包括其后台调用，复合打断
按 SR-11 保留；后台不免除人类审批、预算或租户约束。

## 帧、披露和结果

**TL-12**：原始帧由执行 owner 分配单调序号，关联 call/attempt、kind、内容
与来源，可是执行观察或工具显式产生的中间材料；不是模型未提供的推理。
终态结果与帧分开，进度 100% 不代表成功。工具无帧时如实返回 unsupported
或 empty，不虚构内部步骤。frame limits 按条数、字节和保留期限配置，
溢出、裁剪和数据丢失有明确 gap 区间，不静默假装完整。

披露读面按当前授权、敏感内容策略和 cursor 过滤／订阅；每个订阅者独立
游标，不竞争单消费 cursor。实时帧可以非耐久，但返回保留水位和缺口，
重连不承诺已裁剪片段。终态、调用引用及可供历史取得的结果须耐久。
Session 保存结果或经过选择的内容引用，模型装配只消费明确选择的投影，
不得把用户展开所有帧等同于向模型注入全量输出。

**TL-13**：框架扩展点区分纯观察、受限准备和执行守卫；观察失败不能撤销
已提交结果，声明解析/守卫缺失不能默认许可。未知输出 Schema 或内部
插件异常如实结算，保留失败阶段。包级 fork 可保留有价值的 DSL/路由/
冻结机制，但上游 waterfall、PTC、in-memory jobs 或 Session audit pair
不能直接承担上述目标承诺。
