# pi-ai-transport 当前代际精确采用增补

2026-09-28，candidate，待主线采用；没有新增证据绑定或本增补的成功发送验收。

本页承接 [v8 统一公开面](v8-input-limits-design.md) 全部实现与验证义务，仅将其目标契约坐标改为 `data.model-profile/v5`、`capability.model-request-runtime/v7`，关联当前 messages6/response7/loop-extension6。这些后继撤销旧格式运行兼容义务，字段结构及 S-74 最终输入门不变；v8 关于“仍按旧契约兑现却删除旧 codec”的采用冲突因此由精确后继关闭，不能靠实现自行豁免旧承诺。

八家声明、共用 reader/configuration、注册/lease、plan/send/read、根和 Cordis plugin 使用同一当前代际；无旧执行入口、旧模型特例或降版旁路。现行规范确有引用的旧 Schema 资源由各数据 owner 保留原字节，仅用于固定依赖解析，不恢复旧模型请求支持；不因历史规格归档而分发旧 codec。

完整定义与纯建档可独立验证；S-74 的实际计量实现仍是成功发送前置。`plan.ts` 在完成最终 messages/tools/参数/缓存映射并生成唯一 serialized 后、签发计划前执行计量；`http.ts` 发送该同一串。字节可精确计量，token 仍须有模型/路由依据；字符系数、上次 usage 和有限样本不能冒充可靠上界。缺依据必须如实报告未交付，不能永久 unavailable 冒成功实现，也不能绕门保持 demo 发送。

采用后沿 v7 IL-V1～8 与 v8 IL-V9 的当前格式验收，并核 root/plugin 是同一实现。模型 caps 明确属于项目供给，未知上游事实保持 unknown，显式缓存 TTL 不补默认。包 README/README_ZH、当前 runtime 与 demo 消费者同步迁移；37 份声明通过与逐模型实际认证分别计数。旧用户数据不得静默改写、清空或自动升级。

无新增 Cordis 边界、存储或后台任务；原装卸、引用归属、取消实际停止、凭据与观测义务保持。实现者技术选项在上述责任内选择，不新增计量平台或扩大工具执行范围。
