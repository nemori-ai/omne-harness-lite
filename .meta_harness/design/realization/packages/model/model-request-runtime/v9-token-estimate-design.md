# Runtime 最终输入计量的估算政策接续

2026-09-28，candidate，待独立评审与采用；新增绑定0，没有本增量实际验收声明。继承 [v7公共施工面](v7-current-design.md) 与 [v8当前codec](v8-current-codec-design.md)，目标 `capability.model-request-runtime/v8`、`data.model-profile/v6`。messages6、response7、loop-extension6、directory5及runner5保持精确依赖，未改变快照形状，不重开七份版本。

RT8 S-74的最终计量由 [transport v10](../pi-ai-transport/v10-token-estimate-design.md) 兑现。runtime的 `PlanInput` 显式传递每次tokenMargin；B每次dispatch/dispatchAgain/续接重新规划完整当前输入，再写新锚点。public invokeModel与服务路径共用此门。配置非法沿malformed，构件不可用沿unavailable，缺限额/材料与超限分别保留具名原因。准确/估算超限元数据按basis联合完整透传，不把estimatedTokens命名actual，也不在runtime增加第二种估算。

MP6仅改变发送计量保证；core model-profile继续提供未改变的MP5值结构/纯判定供messages等精确消费者使用，不能把需要MP5 Schema的图静默换成MP6 ID。该保留是当前精确规范依赖，不是旧模型执行兼容。runtime直接按MP6 S-8/S-33及RT8发送语义采用；所有当前执行路径采用同一政策。

Margin由宿主显式配置并在本次计划捕获；运行中改配置只影响新计划。调用trace标明依据与余量，真实usage/cost仍来自响应。所有拒绝分支保留既有历史、pending/unknown写者及旧租借引用，不写新调用锚点、响应或终结来假装成功。估算容许误差不改变凭据、首内容、取消实际停止、SL3同批/认回、withRun和恢复保证。

验证：公开函数与服务对同一输入产生同类拒绝及basis字段；拒绝零send/新锚点；真实上游usage不同于估算仍原值保存；改margin/模型触发新plan而旧计划不被修改；root/plugin同实现；现行unknown/stop回归保持。首模型多轮demo在真实装配通过这些门后另作实际调用验收。Run G28、runner结论来源及另行核实的sentAt恢复缺口继续显式未闭合，本政策不将它们视为解决。
