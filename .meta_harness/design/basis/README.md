# 上游机制语义条目

这里保存上游组件实际提供什么、实际不提供什么的读数，以及在上游变动时会失败的探针。
条目只在上游换版本时失效，需求与实现的变化不改它。条目只说上游怎样，不约束本项目怎样用它。

## 条目形状

`basis/<upstream>/<entry-id>.md`。YAML 头存结构化字段，正文四节：读数、证据、探针断言什么、已知的误用。已知的误用没有内容时可以省略。

```yaml
---
id: async-control-not-bail
upstream: cordis
version: 4.1.0
kind: negative
symbols:
  - "events.ts: isBailed 只排除 null/false/undefined，Promise 本身算 bail 值"
  - "events.ts: bail 同步派发，遇首个 bail 值即返回，不 await 返回的 Promise"
lines:
  - "events.ts:13-15"
  - "events.ts:217-222"
probe: packages/assembly/kernel-basis/tests/async-control-not-bail.spec.ts
checked: 2026-09-22
---
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `id` | 是 | 稳定条目名，kebab-case 主谓宾 |
| `upstream` / `version` | 是 | 读的是哪个上游的哪个采用版本 |
| `kind` | 是 | `positive` 提供什么，`negative` 不提供什么 |
| `symbols` | 是 | 稳定的符号或语义位置，绑定靠它 |
| `lines` | 否 | 行号只作阅读便利。与 `symbols` 失配时不判失败，行号随上游任何编辑漂移 |
| `probe` | 是 | 一个在该语义消失时会失败的测试 |
| `checked` | 是 | 最后一次对着采用版本核对的日期 |

## 命名

条目名用 kebab-case 主谓宾，反直觉的否定事实直接命名，不包装成中性描述：
`async-control-not-bail`、`isolate-hides-instances-not-data`。
这类条目的价值在它推翻了什么。写成 `bail-return-value-semantics`，读者要读完正文才知道自己原来的理解错了。写成 `async-control-not-bail`，标题本身就是告警。

## 准入

进入前必须能回答：这条机制语义是否会被多次设计反复依赖，`symbols` 是什么，探针断言什么。

- 只在一次分析里用到的上游读数，留在那次分析的产物里，不建条目。
- 给不出会失败的探针时，条目登记为待核对主张：`probe: null`，并在正文写明缺口。它不能作为设计依据。「读过源码」不能代替可执行证据。
- 上游的应用策略、推荐用法、示例风格不进这里。上游约定不自动成为本项目约定。
- `version` 与 `checked` 取实际核对的对象版本与日期，不按创建当天填。
- 条目只留复核的最短路径。取证过程放工作树 `tmp/`。

## 和规则、探针的关系

使用这些机制的规则写在架构正文的[Cordis 集成约定](../../../docs/architecture/cordis-integration-conventions.md)里，机制事实以这里的条目为准。

探针是 `packages/assembly/kernel-basis/tests/` 下与条目同名的用例：`<条目 id>.spec.ts`。它们随该成员的测试运行，不读条目文件。

升级上游采用版本时，先跑全部探针。失败的条目就是变了的语义。其余条目只需更新 `version` 与 `checked`。没有探针的条目在升级时给不出任何信号，这也是它不能作为依据的原因。
