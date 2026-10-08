# 验证义务

本页约束未来真实提供者的验证，不表示已经执行或通过。采用行为见[设计](../design.md)，规范输入见[场景](scenarios.md)。

| 领域 | 必须覆盖的场景 | 输入与受阻边界 |
|---|---|---|
| MCP | snapshot+stand-in且失败不覆；not_fetched≠emptyfetched；workspace同名目标不偷tenant凭据；sent断线不重发；未配OAuth保留期清扫；桥替换先结异常中断、不迁不重发且对照localtool | 续期不扰人是产品义务但custodian写回尚未采用，须仍标受阻而非当前provider通过。examples1～8 holding/provenance、stdioenv、refresh分支、normalize/excluded/stand-in、所有结果映射、failure/requestSent、OAuth两阶段/清扫、通知与撤除保留为义务 |

授权、来源、并发提交与外部作用使用真实组合；unknown不补成功。范围及前提不能用Schema、Mock或局部模型替代。单次执行结果留工作树tmp。
