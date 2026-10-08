# 已准入会话的本机求值输入

本文约束公开子入口 `./admitted` 的提供者行为。公开形状见 `src/admitted-types.ts`。原根读取器、发布及 registry 入口继续按其[现行实现映射](../../../.meta_harness/design/realization/packages/assets/evaluation-input-store/README.md)维护，本文不取代这些范围。

## 可信构造与作用域

createAdmittedEvaluationInputSource接收实际租户AtomicStorage、固定SessionScope、实际SessionTenancy、显式部署条目及诊断端口。当前授权单元和原创建成员观察由可信拥有者提供。普通客户端不能提供这些函数、签发权限或调用配方捕获。应用只向普通runtime借出CurrentEvaluationInputs读面。公开入口不得重新导出为普通runtime服务。

withAuthorizedUnit须核当前成员有效性和该内部操作的调用权限，并保持原授权顺序直到同一个租户StorageUnit结束。它只调用一次读取回调，传入原Storage所属单元，返回该回调的原结果。来源不能吞掉回调缺陷并返回成功。跨存储单元、跳过回调、重复回调及替换原结果均为程序缺陷。此端口不把远端治理查询嵌入租户事务。

readCreationStanding只读取本Session原创建的持久S-26观察。其effective和role属于配方数据，不能证明当前权限，也不能镜像成治理中心的组织真相。缺少原观察时拒绝捕获，不猜角色。来源的采用资格由真实授权拥有者和消费者装配核实，函数存在或捕获成功不能替代资格。

## 捕获与读取

捕获先核固定Session和租户，再核实际归属。来源不支持workspace时返回unavailable，不能补空workspace。来源在当前授权的同租户单元中读取完整合法资产输入，并保存原根定义、原创建角色及显式会话配值。相同Session的原语义认回，异语义返回conflict；后续角色观察不能覆盖原创建角色。

每次读取独立核当前授权，并在其原单元读取原配方和同一发布快照。读取不能以captured effective绕过当前拒绝。缺失、非法、不一致或不可读的必要来源返回unavailable，不能拼接不同发布版本或补默认资产、配值、角色和时限。返回值由来源独立持有，后续发布不改变原快照。

非法输入返回invalidInput。合法的跨Session或跨租户读取返回unavailable，并且不调用授权或原创建观察端口。跨作用域捕获返回invalidInput。SessionTenancy缺失或不符拒绝读取和捕获。

声明的来源、存储或正文暂不可用返回unavailable并报告不含秘密的诊断。程序缺陷保留原异常，不能降级成业务拒绝。提交结果未知时，调用者须认回同一持久配方；本来源不自动重试，也不把未知当未执行。

## 关闭与组合义务

close同步拒绝新的读取和捕获，等待已登记的原工作结束。它不关闭借入的Storage、治理、归属或授权拥有者。reader.close与来源close关闭同一准入。可信宿主须在来源排空后再关闭借入资源。

组合验证须覆盖实际持久配方、当前拒绝、原角色不覆盖、作用域拒绝零端口调用、同存储单元、授权缺陷、原结果一致性及关闭排空。受控授权端口测试只验证接口反例，不能证明正式治理运输、宿主权限、模型发出或掉电恢复。
