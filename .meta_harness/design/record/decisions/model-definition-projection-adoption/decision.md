# D-082：完整窄定义、共享配置解释及无兼容迁移的技术采用

2026-09-27，主线在用户“Implement the plan”、按已接受 spec／realization 实施及主调度／验收职责授权内，技术采用 [pi-ai-transport/v4-definition-design.md](../../../realization/packages/model/pi-ai-transport/v4-definition-design.md)，精确 SHA256 `13f0bdfe97c885fd521da924b6c1d432577d1f669c22081ea5eafd147f61ceda`。依据是现有 [D-076](../model-runtime-delivery-adoption/decision.md) 已承担的完整模型能力、参数及配置解释责任；没有新增产品政策或新契约字段。

独立 architecture-reviewer 对 rev1 的 ND-AR1 迁移阻断经 rev2 补齐关闭，无新阻断；spec-reviewer 无表达阻断，ND-ER1 验收表的 maxOutputTokens 例外措辞已定向修正并复核。可恢复输入与主线汇总见 [评审记录](../../proposals/model-request-adaptation/review.md#2026-09-27-完整模型窄定义投影独立评审)。评审不代替本次技术采用，也不代替实现验收。

采用范围是该页完整定义、core ModelProfileContent 复用、逐 route 参数规则／提醒／缓存允许值、同一声明生成 Schema 和配置解释器、四个纯公开读取／构造面及固定 lease 的现有责任。注册→目录采用→显式撤旧仍分开，无跨 owner 原子发布、目录历史或新服务。

同时采用明确迁移：删除旧五字段 official/pilot 贡献集合及其模块初始化；静态 factory／plan 必须显式完整 definitions，缺失或旧形状零网络失败；`[]` 只表示无静态可规划模型并支撑动态宿主内部网络资源；37 ID 清单仅为目标。旧制品宿主 A 用原代码／值排空，新宿主 B 不接管旧对象，不回退 latest；没有独立并存装配时先排空再启动，无不中断承诺。源码、runtime 消费样例、双语 README、测试和独立制品必须同时迁移，ND-V9 保持必验。

本增量局部取代旧 v3 及初期实现中五字段窄定义／隐式两个 pilot 作为完整公开定义的不足；其余 v3 传输、资源、脱敏、observability、精确绑定、模态及停止义务保留。当前实现尚未按新投影迁移，历史 r2～r6 均沿自己的输入与范围读取，不自动成为新定义代际的认证。

完整模型事实 ND-G1、路由 TTL／布局 ND-G2、真实模态承载 ND-G3 和上游输出上限 G-22 均未因设计采用闭合。不准用未知值补 false／空限制／任意 pass，不准把教学 fixture 或空官方集合变成正式清单。可先在完整具名非官方 fixtures 上实现公共解释器和公开面；37 模型完整工件需逐项事实冻结，当前正式生产认证仍 0/37。人的总体交付签收尚未发生。
