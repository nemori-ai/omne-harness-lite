# 插件树与真实宿主迁移接缝的限定采用

状态：补充设计已采用，产品实现、M05 及完整 T4 接受尚未完成。

负责人 panqiwei 授权主会话继续架构整改、逐增量验证和合入。主会话在该委托内于
2026-10-05T02:23:30.581106+00:00 采用本补充，BASE 为 `cdd05d1050dc9d7857f7eb3569d834ae4291c4d5`。
这不表示负责人逐条亲审，也不把审阅意见作为接受权限。
精确 [宿主集成](../../../architecture/identity-integration/host-integration.md) r2 及只改状态的最终正文，
见 [inputs.json](inputs.json)。

依据是[原 D0 采用](../identity-integration-design/decision.md)、
[架构判断来源](../../../../research/architecture-judgment-aids/research.md)和
[本次机制观察](../../evidence/2026-10-05-probe-host-error-observation/README.md)。
BASE 的 boot.ts 仍拥有具名原始错误分类和实际 fiber 观察；D0 安全树错误不能直接替代这两项能力。
服务端根也仍通过插件文件引入 Context，独立工厂需要精确坐标。

## 采用范围和理由

- 宿主用同一 AssemblyLifetime 的委派端口观察原 OwnedWork.ready，只私有保存原异常。
  loader 的安全错误和 boot 等待真实失败收场分别保留，不增加关闭拥有者。
- ./cordis 的 inspectPluginTree 返回已创建实际行 fiber 的只读快照。
  旧手写 manifest/observer 接口由数据树、模块解析故障入口及 treeCreated 接续，保留前缀和撤除观察。
- SQL 独立 StorageSqlConfig/openStorage 保持；JSON-only PluginConfig 与具名资源服务分开。
  原 guard 类、私有附着及实际同一对象保持。公共结果类型只在 core/storage 拥有。
- entry/ops 纯工厂公开 setup/close，明确同步止准入、部分 setup、订阅和真实在途责任。
  四个绑定委派同一业务实现。业务先登记再调可重入依赖，关闭不遗失已交出的工作。
- 公共事件/载荷归 core/EC，模块增补只在 ./cordis。
  宿主路径只读准备先于政策校验，实际 boot 再持久创建并重验；print 不创建资源。

这些补充只落实原 T4 责任，不改租户授权、身份、原事务边界、路由、数据格式或升级保护。
不提供热更新、第三配置层、任意并发加载或 Session 产品能力。
原 D0 精确历史输入和 T2/T3 接受不改写。新补充与原树协议共同约束后续实现。

## 独立判断和证据边界

identity_d0_choice 的 Choice、identity_d0_expression 的 Expression 与差量复核、
remediation_plan_review 的 Plan 均无本轮阻断。Expression H-E1 已修正为原失败阶段 migration，
startup=migrate 配置值不变。r2 另补 HostTreeData、返回和解析器类型坐标，经限定差量复核一致。
原稿、报告、机械输出和处置保留于任务证据，未将早期拼写改写成一次无发现。

真实错误观察探针通过，保留 setup/close 双失败和未完成关闭的交错。
首次探针清理误调用不存在的 Context.dispose 已保留，纠正后运行通过。
该探针不是正式 loader/host 或工厂验收，不证明任意并发进展。
make design-review 实际扫描109个旧坐标，报告142项 finding/undetermined；
它没有覆盖本候选新接口，exit0不能用于关闭这些旧项，原责任仍由N5/N6及相关增量维护。

## 后续门

独立 QA 在精确 BASE 冻结实际宿主、入口、SQL、部署与跨 T2/T3 驱动，并运行原行为基线。
主会话读回冻结原件后才释放 T4-S1。随后单写者按 S1→S2→S3 实施。
真正的错误竞争、快照、工厂早停、通知重入、资源条件依赖、打印无副作用、升级和维护，
须在正式产品与 SQLite/TLS/Unix/CLI 组合中验证，再经完整独立 L3 接受和合入。
T5、R2/R3、N5～N8 及原45秒冷恢复原因责任均未由此关闭。
