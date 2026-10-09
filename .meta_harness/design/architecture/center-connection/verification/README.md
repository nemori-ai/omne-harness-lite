# 验证义务

本页约束未来真实提供者的验证，不表示已经执行或通过。采用行为见[设计](../design.md)，规范输入见[场景](scenarios.md)。

| 领域 | 必须覆盖的场景 | 输入与受阻边界 |
|---|---|---|
| center | 多轮自主断/重连count/since且service不撤、consumer不重跑、modelinflight继续；三种合法业务拒绝仍reachable；不能确认对端为unreachable | examples 1～4覆盖初始/转态/读拒绝/不在场；新增PF017同ID搬家/异ID识别和防冒充须现端口义务，中心身份未确定时不得保存副本；clock不可用前提单独覆盖 |

授权、来源、并发提交与外部作用使用真实组合；unknown不补成功。范围及前提不能用Schema、Mock或局部模型替代。单次执行结果留工作树tmp。
