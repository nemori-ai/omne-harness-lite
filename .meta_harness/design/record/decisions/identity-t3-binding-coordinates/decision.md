# T3 公共调用、绑定与 CLI 收尾的限定采用

状态：设计补充已采用，产品实现及 M05 验收基线门尚未完成。

负责人 panqiwei 授权主会话继续架构整改。主会话在该委托内于 2026-10-04T22:48:24.061742+00:00 采用本补充。
BASE 为 `beef18017170eb70cae2c6bf3afb121b18a0139e`，精确输入见[inputs.json](inputs.json)。
本记录不表示负责人逐条亲审，也不将独立审阅当作接受权限。

依据为[原 D0 采用](../identity-integration-design/decision.md)、[已交付 T2](../identity-capabilities-delivery/decision.md)
及[架构判断来源](../../../../research/architecture-judgment-aids/research.md)。
新观察是 D0 未指定三个绑定的精确导出、拥有传输实例关闭后的误用类别及 Schema 新坐标。
本次补齐 QA 可执行冻结输入，不改变原业务算法、数据身份、EC2/HT2 协议或关闭顺序。

## 采用范围

采用[客户端集成补充](../../../architecture/identity-integration/client-integration.md)：

- CLS 工厂显式接收 storage，CG 工厂显式接收 state/transport；公共定义、工厂拥有类型与错误各归指定拥有者。
- 三个提供者各有独立与 managed 的 `./cordis` 绑定，使用正式 Service 和已交付 startAssemblyWork。缺依赖保持 PENDING。
- 新 HTTPS 拥有实例同步停止新请求，并等待先登记的完整调用；关闭后误用为具名拒绝，不冒充网络结果或调用者取消。原独立函数保持可用。
- CLI 共用 storage 工厂→CLS→transport→CG 的装配及逆序真实关闭。应用保留关闭报告，终端恢复依据 CG 实际结束，不能因 CLS 释放失败跳过恢复。
- EC2 Schema 迁到公共 EC 的 `./schema/v2`，CG 两 Schema 迁到公共 CG。原字节和身份保持，不升级客户端到 EC3。31 路由含 register/login，CLI 另加三个本地/体检动作。

原 D0 继续约束其余范围。不接受新终端政策、自动重试、隐式全局实例或无停机替换保证。
T3 的产品行为验收、T4 插件树与整个 R1 领域门仍开放。

## 审阅与前置门

独立 Choice、Expression 及 Schema/计数限定 Expression 均无本轮阻断。
审阅冻结候选及原回复保留于 inputs 所指任务证据。旧 EC2 formal README 漏登记（T3-E1）按实际文件收齐前提，
登记迁移归 N5/N6；不原地改写历史接受事件。机械 design-review 的未知不替代语义判断。

实际 BASE 的 CG root、Use、CLS 同步重入关闭均有有效反例。三项必须在迁移后修复并由 QA 复验，不能因旧实现已有而豁免。
早两次 unsafe-path 设施失败及 QA 更正原样保留，不引用其退出码为业务反例。

M05 仍须完成独立 QA 实际基线与冻结读回，才释放 T3-S1。随后 S1→S2→S3，完整 L3 后才作产品接受与合入。
