# 图像成员的持续验证资源

本目录保存从构建后的公开入口运行的观测脚本。它们不是单元测试，`pnpm --filter @omne-harness/image test` 不运行它们。

## 性质与覆盖

[budget-profile-smoke.mjs](budget-profile-smoke.mjs) 用推荐配置 `model-input-balanced` 驱动真实 sharp。它核对各场景的结果、声明、编码输出和 `heldReservation()`，并读取本进程 RSS。场景、读数和限制见[推荐配置](../docs/budget-profile.md#观测)。

## 前提与命令

先用 Node 26 构建本成员及其依赖，再在仓库根目录运行：

```bash
pnpm --filter "@omne-harness/image..." run build
node --expose-gc packages/execution/image/verification/budget-profile-smoke.mjs
```

脚本向标准输出写一份 JSON。全部场景符合预期且没有场景外异常时，退出码为 0。否则退出码为 1。

## 限制与维护

- 脚本是普通 JavaScript，不在本成员的类型检查范围内。oxlint 与格式检查覆盖它。
- 脚本中的配置数字是[推荐配置](../docs/budget-profile.md#六个维度)表格的副本。两处必须同时修改。脚本输出 JSON 中的 `profile` 字段是实际运行的值。
- RSS 读数不是内存上限保证。
