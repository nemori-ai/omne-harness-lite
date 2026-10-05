# 插件树与真实治理宿主的限定产品接受

状态：R1-T4产品候选已技术接受，合入及身份领域整体完成分别另验。

负责人panqiwei在本会话授权实施整改、逐增量验收并合入。主会话于 2026-10-05T08:38:19.671482+00:00 在该委托内接受 `bca26b3043d9502dd829a9d91994d44cc04917a1`，BASE 为 `cdd05d1050dc9d7857f7eb3569d834ae4291c4d5`。这不表示负责人已亲自逐条审阅或系统验收完成。

依据为[身份集成设计采用](../identity-integration-design/decision.md)、[宿主坐标采用](../identity-t4-host-coordinates/decision.md)、[D-114](../cordis-integration-conventions/decision.md)及[D-115](../actual-architecture-and-thin-spec/decision.md)。来源研究为 [architecture-judgment-aids](../../../../research/architecture-judgment-aids/research.md)。实际输入、原失败及有限范围见[运行证据](../../evidence/2026-10-05-tests-plugin-tree-tenancy-host/README.md)。

## 接受内容

- 通用插件树纯根拥有两层可序列化配置、稳定行id和来源。Cordis绑定先prepare全部引用/配置，再取得资源和load，错误保留原私有cause并公开安全投影。加载句柄先登记，拥有状态/关闭的回调不会在同步重入时漏记责任。
- 真实tenancy-host以发行树和可选运维文件装配八职责；只装配入口选择提供者。借用资源与每行资源通过正式具名服务注入，继续复用assembly-lifecycle。具名错误及普通Error沿BASE分类，停止请求、真实closed、fiber和外部资源释放分开观察。
- entry/ops具有公共定义、独立工厂和限定Cordis绑定；类型化四事件、Maintenance和ServingNotice归core。SQL管理绑定配置仅含JSON，旧Config句柄和手写ManifestEntry删除，实际源码/测试/例子/CLI/部署消费者改接。
- CLI支持可选`--plugins`和`--print-plugins`，各出现一次且任意顺序。非法参数64，配置/插件错误1，安全打印0并不创建运行资源。打印和正常启动消费同一prepare/政策。
- 保持原业务、租户、精确同提交、凭据/Schema/数据身份和失败优先级。没有采用OG3未实现业务、扩大同提交例外或保留兼容别名。236原导出全部有去向，结构替代5项，原路由能力没有删减。

## 接受依据与发现处置

独立52项冻结QA为50 Pass和2 Pass with issues，1273所选测试通过/19原跳过；130能力观察及真实SQLite/TLS/Unix/CLI/制品、231原导出外部类型和六根四层闭包通过。实际19产品tarball，冻结报告18的计数另附勘误。独立实施审阅及最终补审没有剩余产品阻断。根逐行核对资源、guard、租户、同提交和失败热点；直接任务隔离硬线已通过。

SQL void-dispose缺陷及制品生产依赖缺失修复后独立复验；原失败没有删除。有限形式实际47 TLC、4 Alloy进程/7逻辑配置及7机制控制，旧Entry包装分类问题按原轨迹限定纠正，不冒称包装器通过或无条件证明。bca相对4123仅接受坐标投影，产品输入相同；干净QA实际使用bca。

6679项工作树外原件和源码bundle逐项读回。此前测试槽包装器和全局home违反任务流程，原调用保留，没有追认；最终直接调度满足本轮证据边界，不表述为全程遵守计划。

## 保留责任与影响

本次不接受身份整个领域、模型域、完整部署或终端产品。R1-T5必须按最新主线重新汇总能力/不变量/消费者和关键未知，范围内缺口不因本次局部接受关闭。A5原45秒冷恢复因果、EIS5000、完整W6、PG及完整终端矩阵继续原责任。

66存量IC偏离、其他静态unknown和64旧映射分别归R2/R3及N5/N6，不靠记录理由关闭。当前迁移的是模块集成承诺及实际消费者，未迁业务规格/模型承诺继续有效，整份旧规格没有自动退役。研发品味归因指导待N7-T6补充。

合入和保全完成后才关闭T4整项，再从最新main进入R1-T5。N1～N4及T1～T3源码、证据、接受范围和活动预览保持。
