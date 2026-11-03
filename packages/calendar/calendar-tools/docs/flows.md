# 关键流程

## 流程

每次 Tool 准备先经底层环境，再由 resolver 根据 CallAccess 解析当前可信上下文。输入按 action schema 校验，作者模块调用同名 CalendarQueries 操作。返回完整判别结果、错误、依据和分页位置，再交 Tool 编码与输出保管。模型不能借 resolve 触发供应、种子导入、发布或 Job。

完整业务流程见[Calendar 关键流程](../../calendar/docs/key-flows.md)。

## 失败与生命周期

resolver 抛错或返回不合法上下文时保留 provider_failure 或 environment_incoherent。查询错误和纯计算失败不压成空成功。编码超过 16 MiB 明确失败，不裁尾。停止贡献沿 Tool 公开协议撤自身 token；环境 release 归原宿主，不能因 disposer 宣称调用或外部效果撤回。
