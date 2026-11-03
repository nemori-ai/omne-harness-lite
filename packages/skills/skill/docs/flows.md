# 关键流程

本文件用文本图源描述本包的关键流程与数据流：参与者、调用时序、数据来源与去向、失败分支与生命周期。前提：三个端口由集成方给出；步号是组页[「读取」](../../docs/architecture.md#读取)的步号。

## 流程

### 检查一个包

```text
调用方 ──inspect(locator, {expectedName?})──► inspection
  inspection ──snapshot(locator)──► source            失败 → 映射表 inspect 列
  inspection ──open(locator, digest, 'SKILL.md')──► source        只在快照列出它时；失败 → 映射表
  inspection ──open(locator, digest, '.omne/skill.json')──► source 只在快照列出它时；失败 → 映射表
  inspection ──parseSkillPackage({snapshot, control, expectedName})──► 契约
  调用方 ◄── SkillDefinition | rejected | source-unavailable | version-changed
```

### 读一页正文或资源

```text
调用方 ──read(access, scope, target, {basis?, range?, signal?})──► service
  service ──gate──► readCheck.check (2) ──► resolution.resolve (3)      1: 依据身份，不调端口
  service: 第 6 步 toPackagePath / isControlFile                        bad-path
  service ──pin──► [checkpoint] source.snapshot (7) [checkpoint]        5: unsupported；7: 摘要不等
  service ──verifiedBytes──► [checkpoint] source.open (10) [checkpoint] 9: resource-missing；10: version-changed
  service: 第 11 步 bodyOffsetOf（正文）+ sliceRange
  调用方 ◄── ReadResult{basis, part, mediaType?, content, range, total, complete}
```

`describe` 在 `gate` 之后组装 `SkillDescription` 返回，不进入 `pin`。`list` 在 `pin` 之后过滤控制文件返回。`export` 对快照的每个条目各走一次 `verifiedBytes`，任一失败即返回。

### 数据的来源与去向

| 数据 | 来自 | 去向 |
| --- | --- | --- |
| 包定位 `locator` | `resolution.resolve` 交来的 `SkillRef` | 只交给 `source`，不交给调用方 |
| 所钉摘要 `digest` | 依据的 `digest`，否则 `SkillRef.digest` | 与快照摘要比较；交给 `source.open`；写进结果的 `basis` |
| 声明投影 `declared` | `resolution.resolve` | `describe` 的结果 |
| 条目字节 | `source.open` | 与条目摘要比较后切页；`export` 原样交出 |

## 失败与生命周期

- 任一步失败，操作在该步结束，后面的端口不再被调用。失败对象是契约封闭集合的成员，没有内容字段。
- 取消：`signal` 在每次端口调用之前与之后各查一次。已中止答 `aborted`。一次已经发出的端口调用由端口自己跑完，本包不等它。
- 恢复：没有。每次调用都是独立的一次核验，上一次的结果不进入下一次。
- 资源释放：没有资源要释放。端口抛出的错误原样向上抛。
