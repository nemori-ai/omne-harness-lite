# D-095：RT5/MR5来源定界与共享政策接线的技术采用

2026-09-28，主调度沿用户Implement the plan、主调度与验收、先闭合最小真实链的授权，采用[model-request-runtime接线rev3](../../../realization/packages/model/model-request-runtime/v6-credential-path-design.md)（SHA256 `aa38b6fc0c6a70ef6c9db59d8eb84459c47a7ff7ec1a27269bd7e18f3b8f663b`）及[pi-ai-transport接线rev3](../../../realization/packages/model/pi-ai-transport/v6-credential-path-design.md)（SHA256 `1ada7f2b28edb6c8876c9860921f43249fde467fcfa0682ea002584e52480fce`）。接续[D090](../model-headers-v5-adoption/decision.md)、[D091](../model-transport-response-resource-adoption/decision.md)、[D093](../model-credential-policy-adoption/decision.md)及其[共享政策提案](../../proposals/model-request-adaptation/credential-policy.md)；不采用未接受的RT6模态候选，不修改冻结规范。

用户已裁决“采用按来源定界”：凭据内容与上游raw/error回显必须脱敏；独立取得的真实状态、身份、费用仅巧合同值时保真。原owner拥有RT5S20/MR5S21凭据判定。公共调用改为显式完整CredentialRedactionConfig，删除旧任意redact/minimum-only口，复用同一已验证纯text/headers/json构件，不新增matcher包、服务或默认策略。直接send在连接/排队前同样校验与冻结。上游frame字符串不因为协议位置而获得独立验证身份资格，沿原text处理。

采用单一SendResult.rawHeaders向invoke和MR5完整响应交事实，旧TransportFailure.headers删除。S58交出之前可选留存失败沿原S54；S58交出合法自有不可变且经同次政策处理的H后，invoke固定持有原值，不重开留存窗口或二次headers处理。已持有H后错误体处理失败保留独立HTTP/in-band状态与来源、省略不安全副本、固定本地阶段诊断，不reject Promise擦H、不报成connect。无独立失败来源的必需处理故障沿既有local事实和首内容分类，不当正常end。纯bind发送前处理缺陷不造sentAt或ModelResponse；实际停止与取消依原终局竞争。只捕获声明的处理阶段，不catch-all其他owner异常。

原architecture-reviewer `/root/m1_g4_codec_boundary_review` 对来源owner、已有RT5/MR5委托和共享政策投影的有限读数无架构阻断，并指出directsend门和上游字符串身份不能按字段位置豁免；均由本稿落实。原表达rev1被spec-reviewer `/root/p4_modality_expression_review` 指出CP-ER1（已持有H后的处理defect出口遗漏）及CP-ER2（directsend配置门）；rev2关闭主反例但留下CP-ER1-R1接收窗口歧义，rev3定向复核确认均闭合，最终两SHA一致、没有剩余表达阻断。上述是root据实际会话保存的归因摘要，不冒充逐字原评审文件；复核未运行源码或验收。rev2/3是在已有架构与原契约上的阶段映射精化，没有新能力边界、对象、业务状态或规范版本。

新增bindings0。此次采用释放两节点实际source/双语README/受影响消费者实施，不能提升CP-V/PH-V、实际TLS、socket/reader/回调收口或M1验证状态。完整业务reply/tool凭据回显与原文归约、raw.body附件、所有观测出口、G29-P/H、十三操作和37认证仍由既有owner接续，未冒称完整S20。

取代范围仅为明确迁移到该调用配置与头事实面、在本批新建的消费者；历史opaque对象/在途旧lease沿原值排空。D093纯构件、D094显式codec及冻结规范其余承诺不变；不为旧redact字段保留兼容fallback。
