---
id: effect-disposal-concurrent-not-ordered
upstream: cordis
version: 4.0.2
kind: negative
symbols:
  - "fiber.ts: 同一 effect 内的 disposer 逆序释放"
  - "utils.ts: fiber 卸载时各 effect 按逆注册序取出"
  - "fiber.ts: 取出后由 Promise.all 并发驱动，异常只写日志不上抛"
  - "fiber.ts: UNLOADING 或已 dispose 后再建 effect 抛 CordisError('INACTIVE_EFFECT')"
lines:
  - "fiber.ts:431"
  - "utils.ts:27-31"
  - "fiber.ts:675-686"
  - "fiber.ts:351-353"
probe: null
checked: 2026-09-17
---

# effect 之间的释放是并发的，逆序只约束取出

## 读数

两件事容易被合起来误读：

1. **同一个 effect 内部**，多个 disposer 逆序释放——这是真的有序；
2. **fiber 卸载时**，各 effect 按逆注册序**取出**，但随即交给 `Promise.all` **并发驱动**。

所以「逆序」只约束**取出顺序**，不约束**完成顺序**。要「先排空队列再关闭后端」这类次序，
必须自己在**一个** effect 内组合次序与结算，不能靠注册两个 effect 再指望它们逆序完成。

**第二个容易漏的事实**：并发驱动时**异常只写日志，不上抛**。
一个 disposer 失败不会中止卸载，也不会让调用方知道。

第三：fiber 进入 UNLOADING 或已 dispose 后再创建 effect 会抛 `INACTIVE_EFFECT`。
卸载过程中想「顺手再注册一个清理」是行不通的。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `fiber.ts` 单 effect 内 | disposer 逆序释放 | 一个 effect 注册多个 disposer，观察释放顺序 |
| `utils.ts` + `fiber.ts` 卸载 | 逆注册序取出，`Promise.all` 并发驱动 | 注册两个耗时不同的 effect，观察后者未必先完成 |
| `fiber.ts` 异常处理 | 异常只写日志不上抛 | 令一个 disposer 抛错，观察卸载照常完成且调用方无感 |

## probe 断言什么

**当前为 null，本条目是待核对主张。**

可写的 probe：注册两个 effect，其 disposer 分别延时 50ms 与 0ms 后记录时间戳；
卸载 fiber 后断言两者**重叠**（并发）而非串行。若上游改为顺序 await，断言失败，
本条目失效。

## 已知的误用

**把需要持久的状态放进 effect。**effect 是**内存生命周期**：卸载即释放。
任何要在插件重启后依然成立的事实都不能只存在于 effect 中。

本项目的一个具体例子：登录态的**撤销**若实现为 effect 的释放，
则插件重启后撤销记录消失，「退出登录后不得再访问」的安全性质在重启后失守——
而这不会有任何报错。撤销必须是持久记录。

**依赖 effect 之间的清理顺序。**注册顺序 A、B 后期待 B 先于 A 完成，
在并发驱动下不成立。需要次序就合并到一个 effect 内。

**指望卸载失败会被报告。**异常只记日志，上层拿不到。
若某项释放的失败必须被感知，要在 disposer 内部自行上报，不能依赖卸载流程传播。
