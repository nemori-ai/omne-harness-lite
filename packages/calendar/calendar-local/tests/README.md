# tests

本目录拥有 calendar-local 的持续测试，责任边界见[仓库验证说明](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

公开入口用例、专题 `*.spec.ts` 和固定夹具。独立验收只由 acceptance 拥有者维护。

## 边界

persistence/boundaries 验证发布 participant、原操作查询和材料边界；supply-storage 验证材料保管、probe 和运行 journal；sources 验证受限 HTTP、CN/JP/US 获取与知识输入。runner、cordis、seeds 专题随公开入口验证初始化、独立 provider、关闭与离线导入。crash 用例在真实 SQL 提供者上观察进程故障。固定夹具、资格替身和目标介质各有范围，本域结果不证明外域采用或断电耐久。

## 维护

公开形状或必要行为变化时同步相关持续用例。运行 `pnpm --filter @omne-harness/calendar-local test`，具体 fast/slow 模式沿本成员 vitest 配置。本页是复跑导航，不记录本次通过数量。

## 本包事实

持续用例存在，最终独立验收尚未完成。真实系统资格、设置、通知、跨域接受与目标环境证据不由作者测试代替。
