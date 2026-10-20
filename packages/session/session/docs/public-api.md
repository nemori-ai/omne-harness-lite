# Session 通用实现的构造入口

当前根入口为空，以下是迁入本包的候选构造形状，尚未实现。操作接口、提供者端口和行为由 [纯契约](../../session-contract/README.md) 拥有。本包不接收 Cordis Context。

## 参数与依赖

Configuration 是工厂的静态参数；Dependencies 是外部注入的能力集合。租户、会话、原工作身份和每次操作输入继续显式传入公开操作，不从装配树推导。

```ts
import type { SessionIdentityBridge, SessionEvidenceBridge, SessionClock, SessionIdleInput, SessionContextInput, SessionTransactionPort, SessionNotifier, SessionService } from '@omne-harness/session-contract'

export type SessionConfiguration = Readonly<{
  maximumPageBytes: number; maximumPendingPage: number; reconciliationDelayMs: number
}>
export type SessionDependencies<P> = Readonly<{
  identity: SessionIdentityBridge<P>; evidence: SessionEvidenceBridge
  clock: SessionClock; idle: SessionIdleInput<P>; context: SessionContextInput<P>
  transactions: SessionTransactionPort<P>
  notifier: Readonly<{ current(): SessionNotifier | null }>
}>
export declare function createSessionService<P>(
  dependencies: SessionDependencies<P>, configuration: SessionConfiguration,
): SessionService<P>
```

## 行为与失败

工厂必须兑现 [公共行为](../../session-contract/SPEC.md)。依赖不可用、换代和恢复不能以空实现或默认成功隐藏。构造配置不授予业务资格，释放本域资源不取消独立 Model/Tool 工作。
