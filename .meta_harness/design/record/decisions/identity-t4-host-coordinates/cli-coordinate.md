# CLI 打印调用坐标确认

2026-10-05T02:45:15.191386+00:00，主会话在同一整改委托内确认QA请求的精确命令坐标：
`tenancy-host serve [--plugins <file>] [--print-plugins]`，两个选项可交换且各至多一次。
成功打印安全DTO数组JSON加换行、返回原EXIT.ok，不等待shutdownSignal。
参数错误仍EXIT.usage，静态准备失败仍EXIT.failed并沿[诊断映射](diagnostics.md)。

这是原D0新增两个flags在BASE既有serve命令中的落点，不新增子命令或退出码。
精确正文归[宿主集成](../../../architecture/identity-integration/host-integration.md)，
采用正文SHA-256为 `c2cb91a2cfb6ff049ae257e990e92c71161e6b3102ee2736c5b608dc1affafe7`。
产品命令尚未实现，QA将据此冻结真实子进程驱动。
