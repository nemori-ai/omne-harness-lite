# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：两个公开入口的导出（含 `summarizeTelemetry`）与构建产物的依赖闭包
- [release.spec.ts](release.spec.ts)：同步释放通知、回滚、迟到 end 与空输出关闭
- [runtime.spec.ts](runtime.spec.ts)：准入、记录形状、出口故障、有界队列、内容保护、段、派生与关闭
- [file-outlet.spec.ts](file-outlet.spec.ts)：Pino 同步 destination 写的真实文件
- [disabled.spec.ts](disabled.spec.ts)：禁用实现
- [log-bridge.spec.ts](log-bridge.spec.ts)：日志桥的四个状态（引导、就绪、直写、关闭后）
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：两个插件在真实 Context 上的提供与兜底关闭
- [summary.spec.ts](summary.spec.ts)：离线聚合的分组、分位数、未结束段、坏行与筛选
- [summary-cli.spec.ts](summary-cli.spec.ts)：命令行的输入、输出格式与退出码
- [support.ts](support.ts)：测试用的运行时、时钟、定义与 scope
- [fixtures/](fixtures/index.md)：测试固定输入
