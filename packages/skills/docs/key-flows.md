# Skill组内逻辑责任流程

状态：工程设计草案。流程中的服务与端口都是候选，尚非 workspace 成员，见[组入口](../README.md#成员与依赖)。流程只说明本组服务与端口怎样协作，不能因流程落位认为已采用。服务含义与失败种类见[工程设计](architecture.md)。端口的实现方见[领域交接设计](../../../docs/domains/skills/architecture.md#端口与实现方)。

## F-SK02 分层发现与不可用解释

对应 J-SK02；INV-SK02、INV-SK03、INV-SK04。

在会话与 Agent 集成中，运行方在装配、确认当前采用、为执行建立新挂接及必需提供者变化时，取得当前选入、治理及依赖事实。独立 Skill 读取在每次读取时核验当前访问资格，不要求存在 attempt。

`SkillCatalog` 经 `SkillResolution.adopted` 取得采用集合，经 `RequirementFacts` 取得必需工具名是否在场，再用 `evaluateAvailability` 与 `orderOverview` 求出有序概览。全部必需项满足才投影为可用。引用常驻决定是否直接呈现概览。搜索按说明找已知身份，常驻条目同样可查。

发现已知不可用身份时，呈现同名替换件及安全原因。从未取得的身份不显示。仅必需工具不足时的正文读取结果由[组内读取](#组内读取)与 Q-SK08 单列，搜索投影不替它裁定。调用替换件按 dummy 逻辑执行保留原调用、不可用结果和消费进度，不启动真实原脚本，恢复不重调。提供者回来后仍复核完整条件。端口无法给出现行判断时，返回 `unknown` 或 `source-unavailable`，不能以空集合表示「无方法」。

## 组内读取

本节是 F-SK03 中 Skill 内部的部分，对应 J-SK03。跨领域的消费者承接见[领域流程 F-SK03](../../../docs/domains/skills/key-flows.md#f-sk03-指定读取与工具消费者采用)。

```mermaid
sequenceDiagram
  participant C as 调用方
  participant A as SkillAccess
  participant E as SkillReadCheck
  participant V as SkillResolution
  participant S as PackageSource
  participant F as RequirementFacts
  C->>A: read(access, scope, target, { basis?, byteRange? })
  opt 带材料依据
    alt 依据的能力标识不等于目标能力标识
      A-->>C: not-available-to-you（内部 bad-basis）
    end
  end
  A->>E: check(access, scope, 能力标识)
  E-->>A: granted，或 refused，或 unknown
  alt refused
    A-->>C: not-available-to-you
  else unknown
    A-->>C: unknown
  end
  A->>V: resolve(access, scope, 能力标识, { basis? })
  V-->>A: adopted(SkillRef)，或 known-unavailable，或 basis-not-lawful，或 none，或 unknown
  alt none
    A-->>C: not-available-to-you
  else known-unavailable
    A-->>C: unavailable-stand-in 及安全原因
  else basis-not-lawful
    A-->>C: basis-unavailable
  else unknown
    A-->>C: unknown
  end
  A->>A: 所钉内容摘要：有 basis 取 basis，否则取 SkillRef。没有摘要时返回 unsupported
  A->>A: toPackagePath 校验目标，不合法时返回 bad-path
  A->>S: snapshot(SkillRef 的 locator)
  S-->>A: 包快照，或 package-not-found，或 unavailable
  alt 快照的内容摘要不等于所钉内容摘要
    A-->>C: basis-unavailable
  else 目标路径不在快照条目里
    A-->>C: resource-missing
  end
  A->>S: open(locator, 所钉内容摘要, 包内路径)
  S-->>A: 字节，或 entry-not-found、bytes-mismatch、outside-package、unavailable
  A->>A: 算出字节的内容摘要，与快照中的条目内容摘要比较
  alt 不符
    A-->>C: version-changed，不交新内容
  end
  A->>A: 按请求的字节范围截取
  alt 目标是正文
    A->>F: present(access, scope, 必需工具名)
    F-->>A: 在场的名字，或 无法判定
    alt 无法判定
      A-->>C: unknown
    else 有必需工具缺席
      A-->>C: undecided（等待 Q-SK08）
    end
  end
  A-->>C: 内容、材料依据、实际字节范围、总长与 complete
```

图中每个 `alt` 分支都在返回后结束本次操作。端口失败按[工程设计「端口」](architecture.md#端口)的映射表转换：`package-not-found` 带材料依据时为 `basis-unavailable`，不带时为 `source-unavailable`。`entry-not-found` 为 `resource-missing`。`bytes-mismatch` 为 `version-changed`。`outside-package` 照原样。`unavailable` 为 `source-unavailable`。

1. 调用方可以不带材料依据，这时 `SkillAccess` 读当时的合法版本。调用方也可以带上此前结果给出的材料依据，这时读取固定该版本。材料依据只含能力标识、资产版本与内容摘要，不含包定位。
2. 带材料依据时，`SkillAccess` 先核对依据的能力标识等于目标能力标识。不等时对外返回 `not-available-to-you`，不披露差异原因。
3. `SkillAccess` 每一步都现场核验，不用缓存代替。任一端口无法判定时返回 `unknown`。
4. 先核验读取，再解析对应。对无权主体，「无权」与「身份不存在」都返回 `not-available-to-you`。
5. 只有 `SkillResolution` 答 `known-unavailable` 时，才返回 `unavailable-stand-in`。替换件由 Skill 用 `resolve` 交来的最后合法 name、说明与原因组装。
6. 带材料依据时，`SkillResolution` 核对依据中的资产版本是否合法，并当场给出包定位。不合法时 `SkillAccess` 返回 `basis-unavailable`。
7. 先取快照并比较包快照的内容摘要，再查条目，再读字节并按条目内容摘要核对。所以一次读取只对应一份包快照。
8. 只有正文字节核对通过后，才进入 Q-SK08 判断。第一波只核对必需工具名。资源读取不进入这一判断。
9. 成功结果交出后归调用方。`SkillAccess` 不保留副本，不记「已加载」状态，也不把 `SkillRef` 或包定位交给调用方。

`list` 走同一条核验与解析路径，再取快照并比较包快照的内容摘要。只有内容摘要相符后，`list` 才返回快照中的资源条目，不进入 Q-SK08 判断。`describe` 只走核验与解析，再用 `resolve` 交来的声明投影求缺项。它不读包字节。

## F-SK04 分类设置与秘密供给

对应 J-SK04；INV-SK02、INV-SK07、INV-SK08、INV-SK19。

资产拥有者按声明类别和合法来源求值，取用适配把偏好/绑定交给获准正文消费者；桥接把脚本所需获准值交对应脚本及受控适配，落点/身份不进入模型或普通呈现。治理值交治理判断，不由正文改写。类别非法、必需值缺失、撤权或用途不匹配时拒绝依赖使用。替换实现不继承旧实现专有配值或秘密，诊断只报安全原因。
