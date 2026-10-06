# 候选模块承诺与迁移输入

状态：待接受草稿。本文不是模块现行接口；原已接受公开入口及精确旧源继续有效。接受和开始建设后，将对应候选正文**移动**到下列真实成员，不保留第二份现行源。
未建立新workspace成员；候选不会参与产品构建，也没有模板采用标识。

| 草稿 | 接口／行为未来拥有者 | 依据与切换 |
|---|---|---|
| [session-runtime](session-runtime/SPEC.md) | core/session-runtime公开类型与SPEC | 新会话／受理／Run治理、内部事务端口、函数消费；service-contract 1.0.0 |
| [session-log](session-log/SPEC.md) | core/session-log公开类型与SPEC | 精确SL3有效行为＋显式StorageUnit参加；破坏性切换所有消费者 |
| [model-message-projection](model-message-projection/SPEC.md) | core/model-message-projection公开函数与SPEC | PF-009／010、用户线性及缓存要求；module 1.0.0 |
| [agent-loop](agent-loop/SPEC.md) | core/agent-loop公开函数与SPEC | PF-012纯方程、拓展／原调用接口；module 1.0.0 |
| [model-runtime迁移](model-runtime-migration.md) | core/model-request-runtime接口／SPEC及其provider | RT12与实际十五操作切换；不复制完整既有契约，只补改变范围 |

公开形状在候选中用闭合参数／结果表表达；实际TS直接导出现有identity／message／call-account等类型，不造同名string别名或Cordis runtime数据契约。
各结果表中的closed failures是公开失败值，未知异常仍抛给责任拥有者；不catch-all为unavailable。外部未知写结果有独立unknownCommit结果。
运行时校验覆盖外部未知值、租户与来源资格、配置semantic要求；TypeScript readonly或brand不能代替它。

## 操作的共用规则

这些规则与各操作表、SR／SLN／MP／AL行为一起构成承诺；不要求实施者填未写明的默认值。

| 项目 | 本批共用规则及局部覆盖 |
|---|---|
| 输入和授权 | 身份、Session和原调用作用域显式。Access只证明可信来源，使用点仍核实当前资格；读也重新授权，拒绝不泄露受保护对象是否存在。纯计算只接收已经授权、校验并固定的输入，不代为取得读权。内部端口不向普通消费者开放。 |
| 前置条件 | 各操作表及行为条款限定合法状态；无法证明准入时拒绝或unavailable，不以缺数据放行。纯函数的缺源与非法输入分别返回unavailable／invalidInput，不返回部分成功。 |
| 提交与原子性 | 公共写只有真实存储提交才发生；内部staged结果不是提交。通知在提交后，失败不撤销已提交事实。纯判断／投影无外部提交；CacheOwner增量状态在独占调用成功返回时更新，失败保留旧有效视图或显式要求冷建。 |
| 返回和失败 | 每个操作只返回其表中的闭合结果。表外未知异常交责任拥有者记录、保留义务并抛出，不能吞成普通成功。持久写回执丢失返回unknownCommit或由可信读查明，不假定未提交。 |
| 幂等 | OperationKey的作用域为tenant＋可信提交主体＋操作名＋Session；创建时无Session，使用前三项。语义摘要绑定版本化规范化后的业务输入和主体，不含短期权限观测代际／连接句柄。相同身份与语义认回原事实；同身份异语义拒绝。重复仍重新授权。原call/result身份及重放由其原能力规则拥有，认回不授权再次执行外部效果。 |
| 事件 | 本批公共操作只产生已提交事实通知，不提供可否决控制事件。纯函数不发事件。通知失败可观察且不改事实；消费者依据持久事实补漏／去重。Cordis绑定的类型、通知派发模式及错误归属见系统装配正文，不由核心函数依赖Context。 |
| 缺席 | 身份／权限／必需来源不可核实时fail closed；不存在的公开读按表返回，隐私性拒绝先于存在性查询。无Agent／丢通知仍由协调扫描恢复；无缓存走冷建，不跳过消息。没有执行结果不制造失败结果。 |
| 在途 | Session拥有待处理和治理责任，原调用能力拥有实际执行与结算，缓存owner仅拥有可丢派生状态。撤除先撤准入再排空／持久交接；原义务未交接则不报告close完成。旧投影视图供固定原请求使用，不伪称最新。 |
| 装配和协议 | StorageUnit实例、当前授权顺序、唯一执行权、原call归因、generation与ACK语义是边界承诺。单机用真实同实例原子单元和明确端口实现；未来跨节点须提供等价协议证据，不能仅用本地装配名义保证。配置数量／时限由显式策略提供，不新设产品默认值。 |

Session通知只携带显式tenant/session、已提交事实位置和SourceToken，不携带完整日志或凭据。通知监听者查事实时仍按自己的可信资格授权。

提供者的资源／SQL schema／迁移由实际成员旁ADR／migration拥有；这些草稿不预建包内design目录。初始生产provider构建时必须满足build/typecheck/test、公开root/./cordis、真实SPEC和有效验证资源，再判断模板采用。
