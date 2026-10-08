# 本地模型档案目录提供者

共用操作、资格、判定先后、提交与凭据问法归[公共承诺](../../core/model-profile-directory/SPEC.md)；本页只约束实际提供者的机制。

storage/clock/memberships必需注入；检查存储并合法装入清单后才发布管理/读服务，初始化失败不发布。close停准入并排空原事务，装配等排空后释放所借存储/凭据组件，不由 effect 释放并发推断顺序。档案主键行锁下完整读改写；配置历史、清单状态和行共同事务；列表同快照。合规时标不可得（包括时钟倒退）unavailable零写/回滚，不伪造+1ms。当前格式拒绝不兼容旧行，不沿旧v4候选增添升级产品。

本机取值在目录实际同一StorageUnit读取/锁tenant绑定，把当前CredentialRef交对应replica reader核同来源；不是先读绑定后另事务按tenant读任意副本。错/无副本credentialUnavailable，存储/密钥不可读unavailable，无租户绑定且official才factory。`./tx-reads`仅可信CCL/本机取值参与者，ref不流向公开目录读面/日志；工厂凭据和诊断资源走当前具名服务，运行资源通过具名服务注入，不放序列化配置。SQL后端、密钥和bootstrap生命周期沿各自owner，不新造保管业务。


取值reader只暂取body；唯有该次外层atomic成功并真实返回后才交出。退出/提交失败不交body；absent仅在共同单元正常终结后映射credentialUnavailable。已声明StorageUnavailable穿过单元并待真实终结后映射unavailable；StorageDefect与未知异常不吞成普通业务拒绝。参与方异常与收口归[凭据保管提供者](../../infra/credential-custodian-local/SPEC.md)，目录不以已经读到明文冒充提交成功。
