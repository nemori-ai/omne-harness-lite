# Model Cordis 对象关系

精确类与方法由 [公开接口](public-api.md)维护；本页解释职责，不重复类型。

| 对象 | 拥有与限制 |
| --- | --- |
| 业务操作的抽象 Service | 唯一 provide 键和操作形状；具体提供者实现业务 |
| ModelInstancesService | 实例贡献的登记状态、token、查询及条件撤除；不拥有原调用的持久事实 |
| ModelConvertersService | 固定转换贡献、取得租约及退役保活；不接管消息准入 |
| Publication authority | 核当前主体、实例及发布资格；字符串相等不替代授权 |
| ModelConverterAuthority | 在登记的同一不可让出动作中核系统来源、当前权限和调用 fiber；登记后不补核 |
| caller fiber 的 effect | 绑定贡献释放；晚到释放不得移除后继贡献 |

Service 身份由本包唯一导出决定，结构相同的另一个类不能替代它。普通查询和受信贡献分开，类型可见不授予发布权。详细登记及撤除顺序见 [SPEC](../SPEC.md)。
