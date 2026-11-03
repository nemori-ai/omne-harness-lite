# tests

本目录拥有 calendar-tools 的持续测试，责任边界见[仓库验证说明](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

公开入口用例、专题 `*.spec.ts` 和固定夹具。独立验收只由 acceptance 拥有者维护。

## 边界

public-entry/cordis-entry 核对独立入口；environment.spec.ts 验证每次可信上下文和基础环境释放；author.spec.ts 通过真实公开 Tool 作者接口检查四动作、完整输出、托管和当前资格读回。受控夹具不证明最终 Tool 宿主已接线。

## 维护

公开形状或必要行为变化时同步相关持续用例。运行 `pnpm --filter @omne-harness/calendar-tools test`，具体 fast/slow 模式沿本成员 vitest 配置。本页是复跑导航，不记录本次通过数量。

## 本包事实

持续用例存在，最终独立验收尚未完成。真实系统资格、设置、通知、跨域接受与目标环境证据不由作者测试代替。
