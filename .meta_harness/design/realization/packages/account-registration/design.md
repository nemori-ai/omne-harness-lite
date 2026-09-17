# 账号注册编排提供者设计

- kind：`provider`（实现一份 composition 契约）
- 消费契约：`composition.account-registration` v1
- 源码位置：待建，`packages/account-registration/`
- 状态：设计完成，未实现

## 实现路径与来源

自建编排。它不拥有任何持久状态——账号记录归账号能力，租户与成员关系归租户治理。
本节点只拥有**次序**与**幂等规则**。

## 能力到 Cordis 的投影

| 契约条款 | 实现 | 落点 |
|---|---|---|
| 三步次序 | `register` 内顺序调用，**在单个受管单元内组合** | 服务条款 |
| S-1/S-2 激活单点提交 | `activate` 的调用位置 | 服务条款 |
| 幂等边界 | 以登录标识为键 | 服务条款 |
| S-3 终结结果集合 | 返回值类型为枚举，无「其他错误」 | 服务条款 |

## 依赖与重载：为什么不能天真 inject

本节点 `inject` 账号身份与租户治理两个能力。按 [[plugin-body-reruns-on-provider-change]]，
任一必需服务换提供者会**先卸载再重跑插件体**。

注册是跨三步的流程。若流程的中途状态活在插件体闭包里，重跑会丢掉它，
而已经产生的外部效果（账号记录、租户记录）不会回滚。

**解法不是禁止重跑，是让重跑安全**：

| 做法 | 结果 |
|---|---|
| 把中途状态放在闭包里 | 重跑丢状态，产生孤儿记录 |
| **持有幂等操作键（登录标识），每步各自幂等** | 重跑凭键认回已有结果，收敛到同一终态 |

三步的幂等性分别由被调能力保证：`createAccount` 以标识为幂等边界、
`createPersonalTenant` 以账号身份为幂等边界、`activate` 重复调用返回成功不产生第二次效果。
因此本节点的插件体**无跨重载需保留的状态**，可重复执行。

## 状态、并发与失败映射

```
register(identifier, credential):
  1. account := accountIdentity.createAccount(identifier, credential)
       identifier-taken      → 返回 identifier-taken
       credential-rejected   → 返回 credential-rejected
       存储不可用             → 返回 interrupted
  2. tenantGovernance.createPersonalTenant(account)        ← 幂等
       存储不可用             → 返回 interrupted（账号留在未激活态）
  3. accountIdentity.activate(account, 依据=个人租户已存在)  ← 唯一提交点
       存储不可用             → 返回 interrupted（账号留在未激活态）
  → 返回 registered
```

**每个 `interrupted` 分支都不做清理。**契约 S-5 的收敛定义是「不存在可用账号」，
不是「不存在任何记录」——未激活账号不是可用账号。清理需要判断「确实放弃了」，
而放弃不可观察；保留记录使同标识重试幂等。

## 成对的装载与撤除

本节点**不取得任何资源**，因此没有需要释放的 effect。
它只 provide 一个编排操作，其全部状态在被调能力中。

**在途注册**：本节点卸载时，正在进行的 `register` 调用若已完成第 1 步，
账号停留在未激活态——这与崩溃的效果相同，且已由形式模型的 `crash.cfg` 覆盖。
**不需要额外的在途状态管理**，这正是单点提交结构的收益。

**撤除不等于外部效应回滚**：已返回 `registered` 的回执不可收回。

## 事件

本节点不发布事件。「账号已激活」由账号能力发布，避免同一事实两处发布。

## 实施缺口与消费者影响

| 缺口 | 影响 |
|---|---|
| 契约 G-1 初始权益未确认 | `registered` 不承诺任何可用额度；调用方不得假设新账号可立即消费 |
| 契约 G-2 部署准入未确认 | `admission-denied` 保留在结果集合中但无触发路径 |
