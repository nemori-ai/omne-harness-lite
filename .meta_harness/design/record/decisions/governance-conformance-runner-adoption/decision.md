# D057 · 由测试消费者提供符合性运行器

2026-09-26，主线依据[三候选比较](../../proposals/governance-production-mechanisms/conformance-runner-boundary.md)与独立architecture-reviewer的只读评审，采用A。原Vitest运行时依赖来自已接受提供者设计，本决定限定取代该依赖绑定，不把旧实现误写成违约；D055/D056及规范冻结快照不改。

core/storage保留./conformance与判据所有权，实际测试消费者传入Vitest describe/it/expect及生命周期函数。两个suite仅type import Vitest，依赖移入devDependencies；不设置运行时或全局回退。普通Storage根公开面不含runner类型，业务代码与状态迁移不变。测试声明仍需消费者自备Vitest开发依赖。

采用不等于验证完成：必须跑原符合性、独立普通/测试消费者的skipLibCheck:false声明检查，重打host/CLI并检查完整依赖清单、重新验证实际制品；若独立声明无法成立，停止该实现路径回方案比较。最终fable初轮意见与后续处置分别留证，不能改写旧制品/旧QA结论。
