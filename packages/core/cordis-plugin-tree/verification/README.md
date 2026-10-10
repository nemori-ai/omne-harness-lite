# 插件树机制与有限模型

本模型核对固定 owner 换代停止、固定行退出停止，以及动态能力变化不停止宿主和原作者。
它把 owner 限定为 original、other、absent 三个值。除这些变化外，没有其他失败原因。
它不建模 Cordis 调度、真实工具、日志提交、租户授权或未知关闭责任，也不证明它们正确。
实际装配证据归所属成员的真实组合测试。

在仓库根运行：

```sh
tlc -config packages/core/cordis-plugin-tree/verification/models/DynamicDependencies.cfg packages/core/cordis-plugin-tree/verification/models/DynamicDependencies.tla
```

[负控配置](models/DynamicDependencies-negative.cfg) 将动态变化错误地升级为整代停止，必须使 NoDynamicStop 失败。
[包行为承诺](../SPEC.md) 与公开类型是权威；此模型仅提供上述有限前提下的验证。
运行原件放本任务的 tmp 证据目录，不把一次运行状态写成永久兑现结论。

## 静态准备与真实装配

[协议](../SPEC.md)要求所有输入拒绝先于apply。[成员测试](../tests/)保留两层来源、稳定id、整份replace、provider替换、disable和insert的正反例；重复、悬空、非法JSON、module、export、配置或声明完整拒绝。可选依赖缺席允许，实际提供者后置拒绝；安全描述与错误不能泄漏配置诱饵。

加载测试须观察同tick双load仅首个取得控制且不干扰首个，句柄先于apply，启动期间dispose，登记、OwnedWork.ready、ACTIVE及静态服务可见分开。setup拒绝立即交付ready，而closed仍保前缀真实收场；两个setup或close失败不可互相覆盖。逆序必须等待真实完成，重复dispose同一观察，30秒只是应用停止诊断，不能成为本包释放许可。

[治理宿主](../../../../apps/tenancy-host/verification/README.md)另验八职责、等价替代、两面真实服务、升级确认前后、私有guard及运行资源缺席或错代。通用loader测试不能替代SQLite、TLS、Unix和实际维护组合。有限loaded前缀、确认、开闸和释放模型只在明确前提内有效；破坏关闭顺序的负控须命中提前释放性质，不能以解析错误或超时充当反例。

## 固定树机制与连续性目标

当前固定owner变化导致整代退出的模型属于[机制回归](../README_ZH.md#当前支持与架构偏离)，不证明符合目标。loader及实际装配须另验局部必需或可选依赖换代时，无关能力继续运行；更新失败不取得推进资格，已接纳工作保留原责任或完成交接。文档切换未运行或实现这些目标场景。
