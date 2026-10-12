# 日程与作业协作设计候选

本页保存尚待技术采用的设计，不表示实现、产品接受或阶段承诺。完整必要行为见[schedule/schedule SPEC](../../../packages/schedule/schedule/SPEC.md)，产品范围见[产品正文](../../../.meta_harness/design/product/schedules-and-jobs/design.md)。

## F-SJ05 专属执行、成果与目标结算

对应 J-SJ06/J-SJ07，INV-SJ02/12–INV-SJ15/19/21。租户执行先通过启动准入，Session 拥有者建立专属会话并可靠承接输入，装配绑定 CurrentJob/目标检查。装配失败不确认开始；实际执行才有开始事件。进度、候选成果、问题分别归原 Job，检查固定目标并记录达成依据；普通回复/工具返回/Run终态不足。机械执行走已定义功能，无会话/模型，实际结果才结算。恢复先查原会话、调用和消费位置，不新增工作；停止/失败不被完成检查抵消。
