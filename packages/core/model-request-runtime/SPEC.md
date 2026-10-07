# 模型请求运行时公共定义

根入口拥有十五操作公共类型、原发起窄协议、日志 codec 与纯策略函数；`./cordis` 拥有 ModelRuntime Service 定义。实际提供者与私有 construction 归 model/model-request-runtime-local。
原十五操作的完整耐久行为仍沿精确未迁旧源；接口搬动不替代其恢复、保管、ACK 与费用义务。本文件拥有迁入的 S-60 函数行为及下述日志／发起增量。F0 完整交付验收尚未完成。
[迁移范围](../../../.meta_harness/design/architecture/pilots/n4-ownership.md#模型请求运行时)保留其他精确旧源和模型义务。

## 显式输入与失败

计算只读显式输入，不读取账号、环境、时钟或其他外部状态，不调用模型，不发送事件。
函数不调度等待，不产生随机数。调用方给出 uniformSample，承担样本来源的责任。
输入不得被修改，结果由函数拥有。非法形状/值返回 invalidInput/malformed，不补默认政策。

n 为严格正整数，factor 为有限且不小于 1 的数。base/max 为有限非负 TD3 Duration。
uniformSample 为有限数，满足 0 ≤ u < 1。未知 kind/jitter、缺项或额外字段均非法。
Duration 与 JsonNumber 使用公开精确值语义，不能先转成毫秒浮点数再计算。

## 算法

以同一时长单位计算。B 根据 kind 取 base、base × n 或 base × factor^(n−1)。
D = min(max, B)。none 返回 D，full 返回 u × D，half 返回 D/2 + u × D/2。

对于 decorrelated，previousDelay 必须是有限非负时长。第一次重试明确给 previousDelay = base。
lo = min(base, max)，hi = min(max, max(lo, previousDelay × factor))。
返回 lo + u × (hi − lo)。不得改用其他 jitter 的 D 来替代这个区间。

函数不进行舍入或离散化。实际计时器的精度与等待方式由消费者决定。
u = 0 取下界。上界在非退化区间不被取到，退化区间返回唯一值。

## 验证与消费者

迁入的精确向量和非法输入用例验证算法、边界、冻结结果与输入不变。
默认重试组件通过此公共入口消费，策略配置仍由运行时拥有。
根入口和纯实现不加载 Cordis。Service 定义仅在 `./cordis`。

## 日志拥有者与原件

模型事实使用 Session Log 的显式 fact 封装：owner=model-request-runtime，version=mrr/3，value 为 category 与原 value。category 仅 record 或 response。Message 使用 messages 拥有者的 version=9 消息封装，不复制一个模型专用 Message 正文格式。

codec 接受合法的其他拥有者消息键；消息身份、日志 shell 和原回复关联仍须验证。任一 dedupeKey 或 readKey 声明 mrr 命名空间时，必须符合模型拥有的完整键约束，不能借通用消息形状绕过模型事实校验。旧匿名 model wrapper 不再作为当前有效封装读取。

attempt 开始由 Session 事实拥有者记录，不是模型消息。事件不得转换为 SystemReminderMessage。响应原件与持久回复按原完整关联校验；投影只能生成派生视图，不能改原 ModelResponse 或用可读子集冒充原完整回复。

`inspectModelMessageEntry` 只校验单条消息的正文、shell 与拥有者键，成本与该条目的大小成正比。它不读取或认证历史，不证明 tool return、compaction 或 assistant 的原关联成立。调用者必须另核完整历史关联；生产投影用其一次线性索引履行该义务。`inspectModelLogEntry` 与准备写入入口仍要求完整合法的 messagePrefix，不能用此窄入口放行写入。

## 原发起窄协议

OriginalIssueParticipant 暂存原 dispatched 事实和唯一执行 claim，必须参加调用者的同一 StorageUnit，不独立提交、不先发送模型请求。ticket 与 claim 仅由实际原拥有者签发；复制形状或取得 ticket 都不授予当前权限。

stageOriginalIn 核同存储实例、完整固定 source、原消费位置、call／dispatch 身份、Session shell、当前授权和栅栏。原 dispatched 与唯一 claim 全提交或全回滚。重复只认回原完整等值证明，不授予第二次发起权；异原位置或正文冲突明确拒绝。

当前授权必须核本次原调用捕获的主体及其当前资格。另一并发调用的主体不能替代它；同账户、同租户的另一登录也不能替代已撤销的原登录。缺少原主体来源时拒绝发起，不从会话的可变当前主体取得替代资格。

consumeOriginal 必须等待外层提交完成，并在同一存储范围重新核当前授权。只准原执行代际消费一次；并发消费不能启动两次。回滚、unknown、撤权或原批次未确认均不返回 launch。提交未知时保留原身份与完整批次，认回也不能将只读证明转成第二个启动权。

dispatched 表示原发起锚点，不表示收到模型内容。opened 继续由模型实际执行拥有者在首个内容到达后、发布 FirstContent 之前记录，并携 firstTokenAt。参加协议不得提前伪造 opened、首 token 或实际发送完成。

本协议不负责 Session 的完整 Run 调度，也不替代原模型恢复续发守卫、实际 HTTP drain、完整结果保管与 acknowledge。原 claim 的本地操作结束不证明外部模型执行或远端事务已经停止。
