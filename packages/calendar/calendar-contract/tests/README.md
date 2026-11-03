# tests

本目录拥有 calendar-contract 的持续测试，责任边界见[仓库验证说明](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

公开入口用例、专题 `*.spec.ts` 和固定夹具。独立验收只由 acceptance 拥有者维护。

## 边界

公开入口、日期与计算 schema，以及 queries.spec.ts、supply.spec.ts 验证严格输入、分页、判别结果、上下文和供应协议。纯定义测试不启动数据库、网络、Cordis 或授权服务。

## 维护

公开形状或必要行为变化时同步相关持续用例。运行 `pnpm --filter @omne-harness/calendar-contract test`，具体 fast/slow 模式沿本成员 vitest 配置。本页是复跑导航，不记录本次通过数量。

## 本包事实

持续用例存在，最终独立验收尚未完成。真实系统资格、设置、通知、跨域接受与目标环境证据不由作者测试代替。
