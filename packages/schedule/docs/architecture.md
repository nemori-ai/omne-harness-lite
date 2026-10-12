# 日程与作业工程关系候选

本组只具名一个文档成员 [schedule/schedule](../schedule/README.md)，不创建额外协调服务或统一组 SPEC。

## 成员分解与依赖

成员公开行为见 [SPEC](../schedule/SPEC.md)，精确状态、提交、恢复和资源条件见[内部设计](../schedule/docs/internals.md)。领域角色和跨领域事实归[领域责任](../../../docs/domains/schedules-and-jobs/README.md)，本组不重复成员机制。

## 协作与验证责任

技术采用由成员及相邻原拥有者共同承接；后续事项见[成员技术采用](../schedule/docs/internals.md#后续技术采用)。组合性质按成员 SPEC 的具名义务分配，不因处于同组就假定共同提交或生命周期一致。

## 本组工程分解与公开依赖

成员持有完整 Schedule 定义、候选处置、Job 接受/控制与整体结算。日历通过公开接口提供版本知识，Session/入站承接专属作业会话与输入，执行/目标检查提供实际动作及成果事实，通知承接本次事件的给定交付义务；资产/权限/工作区保持各自采用和资格权威。依赖方向从协调者指向公开能力，不从工具投影反定包数。 本组只具名一个文档成员，不创建额外服务、统一 SPEC 或源码依赖。具体公开形状及提供者尚待采用。

## 机制与流程导航

- [事实拥有者与消费者](../../../docs/domains/schedules-and-jobs/architecture.md#事实拥有者与消费者)。
- [必要身份与分别成立的状态](../schedule/docs/internals.md#必要身份与分别成立的状态)。
- [完整定义保存与日期组合](../schedule/docs/internals.md#完整定义保存与日期组合)。
- [最终校验、受理与耐久责任](../schedule/docs/internals.md#最终校验受理与耐久责任)。
- [补跑、重叠及控制顺序](../schedule/docs/internals.md#补跑重叠及控制顺序)。
- [执行、成果及原工作接续](../schedule/docs/internals.md#执行成果及原工作接续)。
- [通知交接与整份结算](../schedule/docs/internals.md#通知交接与整份结算)。
- [提供者、生命周期及验证](../schedule/docs/internals.md#提供者生命周期及验证)。
- [F-SJ01 保存、预览与后续控制](../schedule/docs/key-flows.md#f-sj01-保存预览与后续控制)。
- [F-SJ02 最终日期校验到可靠接受](../schedule/docs/key-flows.md#f-sj02-最终日期校验到可靠接受)。
- [F-SJ03 恢复区间与有界补跑](../schedule/docs/key-flows.md#f-sj03-恢复区间与有界补跑)。
- [F-SJ04 同安排重叠、排队与替换](../schedule/docs/key-flows.md#f-sj04-同安排重叠排队与替换)。
- [F-SJ05 专属执行、成果与目标结算](../../../docs/domains/schedules-and-jobs/key-flows.md#f-sj05-专属执行成果与目标结算)。
- [F-SJ06 实际事件、通知承接与整份工作](../schedule/docs/key-flows.md#f-sj06-实际事件通知承接与整份工作)。
- [F-SJ07 单次取消与启动、终结竞争](../schedule/docs/key-flows.md#f-sj07-单次取消与启动终结竞争)。
- [F-SJ08 只读观察与提供者换代恢复](../schedule/docs/key-flows.md#f-sj08-只读观察与提供者换代恢复)。
