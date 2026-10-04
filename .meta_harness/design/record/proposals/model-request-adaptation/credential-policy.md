# OpenRouter 凭据脱敏的共有构件选择

2026-09-27。只接续本包与 [D-090](../../decisions/model-headers-v5-adoption/decision.md)、[D-091](../../decisions/model-transport-response-resource-adoption/decision.md) 已有范围，解决 RT5 G-6 的具体提供者政策。产品不泄密要求、参数化策略及独立公开闭包保持，组织/租户档案无权削弱部署政策。原始 body/附件、完整响应必需事实和跨包生产出值仍有自己的门。

## 三条实现路径

| 候选 | 保护位置与可承担范围 | 最强论证与成本 |
| --- | --- | --- |
| A：可信部署规则与成熟无回溯引擎 | 一份明确规则/字母表经选定 RE2 类引擎复用，两个 provider 共同引用，仍需专用 JSON/header 投影 | 表达力与成熟实现有价值；必须选定具体依赖、规则语法/Unicode/资源行为，不能把 JS 开放正则当替身，数据投影仍须实施 |
| B：共享有限扫描纯构件 | 两类有限描述、已知全值和窗口在原输入求命中区间并集；专用 text/header/JSON 投影，两端共同配置快照 | 当前三形态可直接表达、复杂度可分析，无新 native/WASM 依赖；语法变化须演进构件，扫描及键碰撞/精确数值需实际负控和资源测量 |
| C：各 adapter 独立投影，由装配统一配置与验收 | provider 自己持匹配器和投影，共用同一明确配置版本，由联合测试检查输出 | 修改半径局部且可随各 adapter 单独变化；同一政策多处实现增加漂移，公开函数与 runtime 的取消/错误路径也须逐一对齐。类型相容不证明共享语义 |

推荐 B，只采用已经可精确表达的纯构件范围；原始 body 的词法字节/附件 IO 不在本次源切片中。策略不是独立 plugin/service，不引全局政策指针；构造时校验、复制和冻结显式配置，活动请求仍用自己的快照。精确机制归 [v5-redaction-design rev2](../../../realization/packages/model/model-request-runtime/v5-redaction-design.md)，SHA `843b6101c7ff4f50cf8f4bd755a2617688e935cb0fdb9843cba97b4b90b1c6c2`。

独立安全/架构初评发现 R5R-AR1：合法短凭据 true/false/null 在错误 JSON literal 中旁路。rev2改为对所有非字符串 scalar 的精确 token 扫描，命中后整体变为标记字符串，未命中原值保留；独立复评在本次范围内无剩余阻断。反斜杠 nsecret1 的字节反例也明确写前失败，不能修补未命中字节或输出中间候选，但该字节构件仍待附件 owner 实现和真实验证。

独立复评明确可限定采用显式政策构造、纯text/header/可脱敏raw-error JSON投影，不能递归改完整ModelResponse的必需身份、状态、费用。G4=503仍是真契约碰撞：准入允许该凭据，实际HTTP503却必须保留。不得拒绝该凭据、改真实状态或自造豁免来消掉反例；它阻断相应必需输出与完整S-20签收。跨包接线、公共返回前处理与raw.body提供者/资源政策尚未验。

选择归 [D-093](../../decisions/model-credential-policy-adoption/decision.md)。改票条件是有限描述不能承接新增已确认形态/编码，资源实测不符设计界，或联合接线无法保留同次政策；届时比较 A/B/C，不偷偷放开正则或各包暗填默认。作者演练和只读评审不是源码、TLS、附件或生产认证。
