# Storage/Clock 公共集成的限定设计采用

状态：设计已采用；本次产品实现的独立验收与技术接受尚未完成。

负责人 panqiwei 授权实施身份与组织租户、模型请求架构整改，按增量验证和合入。
主会话在此委托内于 2026-10-04 13:41:46 UTC 采用 R1-T1b 设计 r1 的公共定义和提供者投影。
独立 Choice 评审无阻断。评审不构成实现验证；未覆盖项进入冻结 B1～B8。
原设计基线为 `9cad470a9e48897c40d56582febfe3e20ce083a5`，实施前同步至 `e22311713b1a94d2e54e9976483d2f94f9a12ea6`。
两者间仅有已合入的模型消费者四文件重构，Storage/Clock 输入相同。

依据为 [D-114](../cordis-integration-conventions/decision.md)、[D-115](../actual-architecture-and-thin-spec/decision.md)
及其来源研究 [architecture-judgment-aids](../../../../research/architecture-judgment-aids/research.md)。
机制事实沿已采用 Cordis 4.0.4 及本次真实 SQLite 双向事务身份探针。
精确设计输入、Choice 报告、探针和后续运行的保全责任归本批实施证据，不能以本决定替代实测。

## 接受范围

- `core/storage/cordis` 拥有最小 StorageService、storage 键和 Context 增补；AtomicStorage 仍为可选扩展。
- `core/offer-expiry/cordis` 拥有 ClockService、clock 键和 Context 增补；时间算法继续归提供者。
- `storage-sql` 根保留独立函数与维护接口，`./cordis` 提供插件及借用 SqlStorageService。
- Clock 提供者包、源码路径和插件名改为 clock-lease；根与 `./cordis` 分离，旧包及旧根插件入口删除。
- SQL 内部以不可写、不可重配的局部 Symbol 将自身 Service 面对应到确切 SqlStorage。原 unit 在 frame/busy/既有污染检查后核验身份；身份读取失败进入原 mismatch 污染路径。
- 拥有插件先完成原启动、登记关闭 effect，再建立 Service。借用绑定不接管底层关闭责任。Clock 清理不假设全局 effect 顺序。
- 运维导入白名单仅增加 storage/cordis 与 offer-expiry/cordis；维护纯叶子白名单保持。共享定义只在两处持有，消费者同步迁移。

[成员归属表](../../../architecture/pilots/shared-storage-clock-ownership.md)限定了迁入承诺。
事务、租约、维护、数据身份及业务授权规则未变。私有身份投影不能作为租户授权或分布式事务协议。
不接受新的全局停止顺序、跨进程身份等价、隐式事务参与或对所有 Storage 强制 atomic。

## 接受理由及复核门

原 raw 实例的严格对象比较会拒绝同一存储的 Cordis 调用方代理；仅包装 Service.atomic 回调又遗漏真实模型示例由 raw.atomic 发起的参与。
提供者内部的确切实例投影同时保留两个方向，不改变提交点或放宽到同文件实例。
SQL 提供者 ADR `packages/infra/storage-sql/adr/service-faces.md`保留选择、代价与复核条件。

最终私有标记的不可修改性、读取失败污染及检查优先次序，必须由实际候选证明；可写 Symbol.for 探针不能替代。
资源启动/重复键失败、拥有/借用撤除、Clock 换代、正式 Service 符合性、四层纯闭包与真实打包消费须独立验收。
任何所需行为缺证据或不稳定仍阻断产品接受，不能转记已知问题关闭。

## 保留责任

其余身份能力、ActionIntent、插件树、模型完整公共协议及 Session 机制仍按整改计划推进。
原 IR-CC-1 凭据判据、QA-FAC-1 完整 W6 设施、EIS 超时原因、45 秒冷恢复因果问题及 PostgreSQL 恢复均未关闭。
本决定不改变 N1～N4 的历史坐标，不声明 R1-T1、R1-T5、R2、R3 或 N5～N8 完成。
