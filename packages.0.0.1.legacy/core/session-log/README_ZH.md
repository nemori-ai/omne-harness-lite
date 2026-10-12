# session-log

[English](README.md)

会话日志、物理 backing 所有权与协调访问契约。完整解码前缀及物理 owner 代确定共享日志边界，读取引用不授予访问权限。

## 公开入口

根入口导出公共类型与独立函数，`./cordis` 承载集成绑定。跨包消费使用对应公开导出。

- [根入口](src/index.ts)
- [Cordis](src/cordis.ts)

类型之外的已迁行为归 [SPEC.md](SPEC.md)。

`checkSourceToken`复制并校验固定日志坐标，`sourceTokenEquals`比较其租户、会话、日志代际及精确尾号。
两者不授予访问权，也不证明来源当前可用。日志代际与物理owner代际分别维护。

模板标识记录结构采用，不代表完整业务或生命周期验收通过。

## 开发

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/session-log run build
pnpm --filter @omne-harness-lite/session-log run typecheck
pnpm --filter @omne-harness-lite/session-log run test
```
