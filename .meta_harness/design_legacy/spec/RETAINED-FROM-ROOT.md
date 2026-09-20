# 从承载仓库根 `spec/` 取回了什么

2026-09-20 做过一次逐文件比对：根 `spec/` 是本目录的**迁移来源**，迁移当年没做完，
之后两边各自又动过。这份记录比对结论，**免得下一个人重做一遍**。

> **取回来的东西只是「可能有用」，所以暂时留着。**
> **不是必须被用到的，也不代表一定就有价值。**
> 读完判断用不上就删，这是合理的结论。

## 取回了一项

| 取回 | 放在 | 为什么 |
|---|---|---|
| `capabilities/session-run/` | [同名目录](capabilities/session-run/RETAINED.md) | **本目录唯一没有的那份**。`QueueControl` 编码了队列取批、会话级 hold、强停与安全释放，而它的继任者（`session` v1、`run` v1）**只有契约、没有形式模型**，这些性质没人接手 |

## 比对是怎么做的

**按文件内容的指纹比，不按路径比。**两边的目录形状不一样——本目录把形式模型放在
`v<n>/formal/`，根 `spec/` 平铺在 `v<n>/` 下；版本号也对不上，本目录的 `v1` 装的
往往是根 `spec/` 最新版本的模型。**只看路径会得出「根 spec 更新」的错误结论。**

按内容比之后：根 `spec/` 有 21 个不同内容的 `.tla`，本目录有 **28 个**；
只在根 `spec/` 出现的 5 个里，4 个是本目录已有更新版的旧版本。

## 没取回什么，以及为什么

| 没取 | 为什么 |
|---|---|
| `run-driver/v2`、`session-run-agent-lifecycles/v1`、`tools/v2` 的模型与配置 | **是旧版本**。本目录已有同名模型的更新版——`ToolCallMC` 多了 `QuiescenceSafe` 断言，`ToolCall.cfg` 多了 `CHECK_DEADLOCK FALSE`，都是本目录这边新 |
| `live-agent/evidence/`、`agent-session-binding/evidence/`（三十余份 TLC 日志与快照） | 证据说的是「**那一次、那一版模型、那套工具链**跑出了什么」。对应的模型本目录都有更新版，**旧证据对新版本不成立**；留着反而容易被当成「这条性质已经验过」 |
| `archive/ddd-models/` | 按 DDD 战术分类切分的建模尝试。项目明确[不按 DDD 战术分类强制切分系统](../../../AGENTS.md)，这是已经不走的路线 |
| `catalog.json`、`frozen.json`、`formal-tasks.json` | 旧体系的登记。[新的规格容器](../../design/spec/README.md)另起一套身份、路径与冻结方式，**搬过来就是第二份权威** |
| `AGENTS.md`、`CLAUDE.md` | 根 `spec/` 的局部约定，随那个目录本身走 |

## 怎么找回没取的部分

这次比对之前，根 `spec/` 的完整内容在本仓库历史里。要找回某一份：

```sh
git log --oneline -- spec/capabilities/live-agent/evidence   # 定位提交
git show <sha>:spec/capabilities/live-agent/evidence/v1/model-runs.json
```

**历史里有，不等于将来有人会去翻。**所以判断「可能还用得上」的东西才取回到工作区，
其余留在历史里是有意的取舍，不是遗漏。
