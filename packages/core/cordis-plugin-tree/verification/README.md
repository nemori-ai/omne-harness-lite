# 插件树动态依赖的有限模型

本模型核对固定 owner 换代停止、固定行退出停止，以及动态能力变化不停止宿主和原作者。
它把 owner 限定为 original、other、absent 三个值。除这些变化外，没有其他失败原因。
它不建模 Cordis 调度、真实工具、日志提交、租户授权或未知关闭责任，也不证明它们正确。
实际装配证据归所属成员的真实组合测试。

在仓库根运行：

```sh
tlc -config packages/core/cordis-plugin-tree/verification/DynamicDependencies.cfg packages/core/cordis-plugin-tree/verification/DynamicDependencies.tla
```

[负控配置](DynamicDependencies-negative.cfg) 将动态变化错误地升级为整代停止，必须使 NoDynamicStop 失败。
[包行为承诺](../SPEC.md) 与公开类型是权威；此模型仅提供上述有限前提下的验证。
运行原件放本任务的 tmp 证据目录，不把一次运行状态写成永久兑现结论。
