---
id: isolate-hides-instances-not-data
upstream: cordis
version: 4.0.4
kind: negative
symbols:
  - "reflect.ts: 服务解析沿 fiber 链向上，父的 isolate 标签不同即抛错不再上溯"
  - "reflect.ts: 同标签重复 provide 直接抛错"
  - "context.ts: ctx.isolate(name, label)，同 label 的两次调用合流"
lines:
  - "reflect.ts:154-166"
  - "reflect.ts:289-290"
  - "context.ts:115-125"
probe: packages.0.0.1.legacy/core/kernel-basis/tests/basis/isolate-hides-instances-not-data.test.ts
checked: 2026-09-22
---

# `isolate` 隔离服务实例的可见性，不隔离数据

## 读数

`ctx.isolate(name, label)` 让同名服务在不同标签下并存两份**实现**。它改变的是
「解析这个服务名时看到哪个实例」，与实例内部持有什么数据无关。

**想当然的理解**：为每个租户开一个 isolate 标签，就得到了租户隔离。

**实际**：一个服务实例内部握着跨租户的数据句柄时，隔离多少次都无效——
调用方拿到的是"属于本标签的那个实例"，而那个实例照样能读写任意租户的数据。
租户判定只有一个正当位置：数据访问层的显式身份校验。

两者在什么情形下分叉：**需要的是同一套实现作用在不同数据上**时。
这时 isolate 给不出任何保护，却带来实例数按租户数增长、租户增删伴随服务装卸的代价。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `reflect.ts` 服务解析 | 解析沿 fiber 链向上，父的 isolate 标签一旦不同就抛错、不再上溯 | 在子 isolate 中解析父标签下的服务，观察抛错而非回退 |
| `reflect.ts` provide | 同标签重复 provide 直接抛错——没有「子上下文默认遮蔽父服务」这回事 | 同标签下 provide 两次 |
| `context.ts` isolate | 同 label 的两次 `isolate()` 调用合流到同一标签 | 两处以相同 label 调用，观察得到同一实例 |

隔离的判据因此是**定制实现还是定制数据**：要并存两份不同实现，`isolate()` 是唯一途径；
要同一实现处理不同数据，它帮不上忙。

上游 DSH 在 Cordis 之上另有 `dsh-scope` 等包，其自述不是沙箱也不是权限边界；
那属于以 agent 为键的上层 scope，不能算到 Cordis 原生 `isolate` 头上。

## probe 断言什么

probe 在 `packages.0.0.1.legacy/core/kernel-basis` 里，对 4.0.4 通过（2026-09-22）：

1. 两个 `ctx.isolate('store')` 标签下各 provide 一个服务实例，两实例共享同一个 `Map`；
   标签 A 下的消费者解析到的是 A 的实例（标签生效），但经它写入再读出的数据对 B 同样可见——隔离不及于数据。
   若上游某个版本使这次读取失败，语义变了，本条目失效。
2. 同标签重复 provide 抛 `service "…" has been registered`；同一 `label` 的两次 `isolate` 合流，
   一边 provide 另一边可解析。

## 已知的误用

**为租户开 isolate 标签。**后果有三层，一层比一层难发现：

1. 不提供隔离（本条读数）；
2. 实例数按租户数增长，租户增删伴随服务装卸，与「完全动态系统」目标相悖；
3. **它使「组织上下文造成的差异」多出一类**——实例本身不同。
   如果需求把上下文效用限定为若干项（本项目的 PF-001 正是如此），这一条会当场失守，
   且失守方式不是报错，是多了一种没人枚举过的差异。
