# clock

- kind：`provider`
- 对象与设计修订：候选节点，2026-09-22 首稿。**不兑现任何契约条款**——它兑现的是 [offer-expiry 节点](../../core/offer-expiry/design.md#能力到-cordis-的投影)定下的时间源**形状** `Clock { now(): Instant | 'unavailable' }`（形状本身是 `data.offer-expiry` v1 [S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 的条款，provider 是 offer-expiry，不是本节点），以及 [S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 表里那一行「**`now` 不后退**」——契约把它列为装配给，offer-expiry 节点给了候选形状（单调钟锚定 + 存储高水位、回拨即 fail-closed），[D-026](../../../../record/decisions/infrastructure-persistence-choices/README.md) 把它的承接者定为本节点
- 源码位置：`packages/infra/clock`——**已建包（2026-09-22）**：`src/lease.ts`（常量、`clock_lease` 迁移）、`src/clock.ts`（`LeaseClock`：锚定、启动判定、续约、收回；时间源可注入）、`src/plugin.ts`（`clockPlugin`，`inject: ['storage']`，无 config）。第一层 `infra` 由 [D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 拍板（2026-09-23）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：一个 Cordis 插件、一条 fiber，`provide('clock')`（服务名沿用既有节点），**必需 inject `storage`**。它拥有：进程内的单调钟锚、存储里的一行高水位（自带一张表与迁移）、续约定时器。**不拥有**：`Instant` 的表示（归 offer-expiry，毫秒整数品牌类型）、任何消费者对 `'unavailable'` 的收场（AI 映射为 `storage-unavailable`，OG 映射为 `unavailable`，各归各）。采用版本：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）。高水位是**写在前的租约**——offer-expiry 候选形状里「已读到的最大 `now`」那一句改成「先落盘上界、再返回不超过它的值」，反证与对比表在 [design.md](design.md#高水位为什么是写在前的租约不是写在后的节流)

## 分层状态

- 语义接受范围：**无契约条款归本节点。**`data.offer-expiry` v1 全部条款已被 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md) 接受，其中 S-16 的形状与 S-17「`now` 不后退」那一行是本节点**承接**的对象，provider 仍是 offer-expiry 节点；本节点作为承接者的选型被 D-026 接受。到此为止，不提升下面三层
- 可实施范围：本节点声称兑现 S-17 五行里的两行——「`now` 与 `expiresAt` 同源可比」的**一半**（只 provide 一个实例；另一半「消费者不得另用 `Date.now()`」是 offer-expiry 的 lint SC-OE-3）与「`now` 不后退」的**全部**（进程内单调、跨重启不后退、回拨 fail-closed）；逐条见 [design.md「能力到 Cordis 的投影」](design.md#能力到-cordis-的投影)。**不兑现**：与真实时间的偏差上界（本节点只承诺不后退，不承诺准）、跨进程的单调（[投影 Q-8](../../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)，两个进程各自锚定墙钟）、消费者侧「`'unavailable'` 时各操作失败」（各消费者节点）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) 为**空表**——本节点不是契约 provider，S-17 那一行在契约 verification 里也没有可绑的形式任务；证据义务（回拨、重启后租约、写失败、装卸）登记在 [verification.md](verification.md)，包内测试覆盖的已标「已通过」
- 实际验证：2026-09-22 包内 8 条测试通过（进程内单调、回拨 ⇒ `start()` 抛出且实例闩住、崩溃后快速重启追上前 `'unavailable'`、干净撤除不用等、续约写失败 ⇒ 越过租约即 `'unavailable'`、撤除后 `'unavailable'`、插件 provide／撤除、缺迁移 ⇒ `StorageDefect` 启动失败）；见 [verification.md「实际执行」](verification.md#实际执行)

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| `now()` 怎么算、高水位为什么写在前、回拨怎么判、续约写失败怎么收场、装卸怎么配对 | [实现设计](design.md) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（当前为空） |
| 回拨、重启、写失败三条义务与还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
