# 机制语义条目

这里保存内核与上游组件**实际提供什么、实际不提供什么**的读数，以及让这些读数
在上游变动时自己失效的 probe。

失效事件：上游换版本。与需求、契约、实现都无关——需求改了，这里一个字不动。

## 为什么它需要一个家

同一层知识正在被反复重新推导。三次相互独立的需求走查各自从源码重读 Cordis 内核，
12 条机制主张逐条重合，9 条「内核不提供」的负面清单三份完全相同。
重合本身说明这层知识稳定；反复重推说明它没有家。

代价不只是重复劳动。每次重推都可能读错一处，而读错的地方彼此不同，
错误便随各自的设计扩散出去，且没有任何机制让它们对质。

## 条目形状

`basis/<upstream>/<entry-id>.md`，YAML front-matter 存结构化字段，正文存读数与证据。

```yaml
---
id: async-control-not-bail
upstream: cordis
version: 4.0.2
kind: negative
symbols:
  - "events.ts: dispatch 的返回值判定"
  - "Context.prototype.bail"
lines:
  - "events.ts:165-175"
probe: packages/kernel-basis/tests/basis/async-control-not-bail.test.ts
checked: 2026-09-16
---
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `id` | 是 | 稳定条目名，kebab-case 主谓宾，见下 |
| `upstream` / `version` | 是 | 读的是哪个上游的哪个采用版本 |
| `kind` | 是 | `positive` 提供什么，`negative` 不提供什么 |
| `symbols` | 是 | 稳定的符号或语义位置，绑定靠它 |
| `lines` | 否 | 行号只作阅读便利；**与 symbols 失配时不判失败**，行号随上游任何编辑漂移 |
| `probe` | 是 | 一个在该语义消失时会失败的测试 |
| `checked` | 是 | 最后一次对着采用版本核对的日期 |

## 命名：否定事实照直写

条目名用 kebab-case 主谓宾，**反直觉的否定事实直接命名**，不要包装成中性描述：
`async-control-not-bail`、`inflight-not-child-of-session`、`isolate-hides-instances-not-data`。

理由是这类条目的价值全在它推翻了什么。写成 `bail-return-value-semantics`，
读者要读完正文才知道自己原来的理解是错的；写成 `async-control-not-bail`，
标题本身就是告警。设计者在落点表里扫一眼就能被拦下。

## 准入

进入前必须能回答：这条机制语义是否会被**多次设计**反复依赖，`symbols` 是什么，
probe 断言什么。

- 只在本次分析用到的上游读数，留在本次分析产物里，不建条目。
- 给不出会失败的 probe 时，条目登记为待核对主张（`probe: null` 并在正文写明缺口），
  **它不能作为设计依据**；不要用「读过源码」代替可执行证据。
- 上游的应用策略、推荐用法、示例风格不进这里。上游约定不自动成为本项目约定；
  本项目采用了什么归 [record/decisions/](../record/decisions/README.md)。

条目可以从 [research/](../../research/README.md#升格为-basis-条目) 的结论升格而来：那边拥有送出的时机，
本页拥有能不能进。升格条目的 `version` 与 `checked` 继承原结论最近一次核对的对象版本与日期，
不按升格当天填；取证过程留在原 topic，条目只留复核的最短路径。

## 怎样被消费

设计分析的机制读数从这里取，不在每次分析里重推。
[realization/](../realization/README.md) 的绑定表按 `id` 引用条目，
并记录 `alignment_checked`；当条目的 `checked` 晚于某条绑定的 `alignment_checked`，
该绑定进入待复核——这是上游变动传播到设计的唯一通路。

升级上游采用版本时，先跑全部 probe：失败的条目就是本次真正改变的语义，
其余条目只需更新 `version` 与 `checked`。没有 probe 的条目在升级时给不出任何信号，
这也是它不能作为依据的原因。

## 当前状态

已有 4 条条目，均来自账号与租户设计实际依赖的机制语义：
`isolate-hides-instances-not-data`、`async-control-not-bail`、
`plugin-body-reruns-on-provider-change`、`effect-disposal-concurrent-not-ordered`。

**四条的 `probe` 目前均为 `null`**，因此按本页规则它们是待核对主张，不得单独作为设计依据——
本项目尚无 Cordis 集成测试位置，补齐 owner 为 kernel 侧首个集成包。
手册正文与历次走查中的其余机制主张尚未迁入。

返回[设计链入口](../README.md)。
