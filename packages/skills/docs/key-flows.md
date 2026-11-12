# Skill组内逻辑责任流程

状态：已由 [技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6704668621) 接受。`PackageInspection`、`SkillCatalog`、`SkillAccess` 与目录来源 `DirectorySource` 都已有成员实现（已由 [技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/1119#issuecomment-6704668621) 接受）。成员状态见[组入口](../README.md#成员与依赖)。流程只说明本组服务与端口怎样协作，不能因流程落位认为已采用。服务含义与失败种类见[工程设计](architecture.md)。图中只有本组的步骤，本组以外的参与者都合并成「调用方」。

## 组内检查

本节是 F-SK01 中 Skill 内部的部分，对应 J-SK01。跨领域交接见[领域流程 F-SK01](../../../docs/domains/skills/key-flows.md#f-sk01-合法来源定义校验与候选交接)。

```mermaid
sequenceDiagram
  participant C as 调用方
  participant I as PackageInspection
  participant S as SkillPackageSource
  C->>I: inspect(locator, { expectedName? })
  I->>S: snapshot(locator)
  S-->>I: Skill 包快照（含包根目录名），或 来源失败
  alt package-not-found、entry-not-found、bytes-mismatch 或 unavailable（快照不对单个条目作答，答 entry-not-found 或 bytes-mismatch 的来源不守端口契约）
    I-->>C: source-unavailable
  else entry-unreadable（非常规文件，或无法解析、成环的链接）
    I-->>C: 拒绝 malformed，检查到此结束
  else outside-package（包内链接解析后落在包根之外）
    I-->>C: 拒绝 outside-package，检查到此结束
  end
  loop 控制文件 SKILL.md 与 .omne/skill.json
    I->>S: open(locator, 快照的内容摘要, 包内路径)
    S-->>I: 字节，或 来源失败
    I->>I: 按条目内容摘要核对字节
  end
  alt entry-not-found 或 unavailable
    I-->>C: source-unavailable
  else bytes-mismatch，或核对不符
    I-->>C: version-changed
  end
  I->>I: 解析与校验。带 expectedName 时，头部能读出的 name 须等于它。name 与包根目录名不同时不拒绝，带兼容提示
  alt 不合格
    I-->>C: 拒绝原因，按包格式规则的次序
  end
  I-->>C: SkillDefinition：清单、声明与Skill 包快照，有软偏离时另带兼容提示，不含正文
```

1. `inspect` 的结果集合封闭：`SkillDefinition`、一个拒绝原因、`source-unavailable` 或 `version-changed`。规则见[工程设计「检查与发现」](architecture.md#检查与发现)。
2. 只有调用方给出 `expectedName`、头部能读出 name、且 name 不等于它时，才拒绝为 `name-mismatch`。name 与包根目录名不同时不拒绝，带兼容提示 `name-differs-from-root`。头部的 YAML 与逐行读取都读不出 name 时，不判 `name-mismatch`，头部的问题判为 `malformed`。另外三种软偏离（逐行读出头部、说明超过 1024 个字符、`metadata` 不是文本映射）也接受并带兼容提示，见[工程设计「包格式规则」](architecture.md#包格式规则)。
3. `inspect` 不交正文。正文只经 `SkillAccess.read` 取得，`read` 现场核验读取权。
4. `snapshot` 或 `open` 答 `outside-package` 时，`inspect` 拒绝为 `outside-package`。`snapshot` 或 `open` 答 `entry-unreadable` 时，`inspect` 拒绝为 `malformed`。`snapshot` 答这两种时没有快照可判，检查以对应的原因结束，不按拒绝次序判其余原因。图中省略 `open` 的 `outside-package` 与 `entry-unreadable` 两支。快照阶段的 `bytes-mismatch` 是 `source-unavailable`。读控制文件时 `open` 答 `bytes-mismatch`，或核对不符，是 `version-changed`。

## F-SK02 分层发现与不可用解释

对应 J-SK02；INV-SK02、INV-SK03、INV-SK04。

```mermaid
sequenceDiagram
  participant C as 调用方
  participant K as SkillCatalog
  participant V as SkillResolution
  participant E as SkillReadCheck
  C->>K: summaries(access, scope, capabilities?) 或 search(access, scope, query)
  alt capabilities 为空
    K-->>C: 空列表，不调用任何端口
  end
  K->>V: adopted(access, scope)
  V-->>K: 当前合法集合中每个身份的 adopted 或 known-unavailable（可以为空），或 无法判定
  alt 无法判定
    K-->>C: unknown，不返回空集合
  end
  K->>K: 按 capabilities 过滤，或按查询匹配 name 与说明，只留下匹配的身份
  loop 留下的每个身份
    K->>E: check(access, scope, 能力标识)
    E-->>K: granted，或 refused，或 unknown
  end
  alt 留下的身份中任一个 unknown
    K-->>C: unknown，不返回空集合
  end
  K->>K: 去掉 refused 的身份，不披露它存在
  K-->>C: 摘要条目：能力标识、name、说明。adopted 的身份带依赖声明，known-unavailable 的身份带替换件原因
```

1. `SkillCatalog` 只在 `SkillResolution.adopted` 给出的当前合法集合里取身份。集合为空时返回空列表，这不是失败。调用方给出 `capabilities` 时，只交其中属于当前合法集合的身份。其余不交，也不说明原因。给出空的 `capabilities` 时，直接返回空列表，不调用任何端口。
2. 先过滤与匹配，再对留下的每个身份经 `SkillReadCheck` 核验。答 `refused` 的身份不进入结果，不披露它存在。留下的身份中任一个答 `unknown` 时，整次操作返回 `unknown`，不把未知压成空。请求之外或查询不匹配的身份不核验，它们的 `unknown` 不使整次操作返回 `unknown`。
3. 答 `adopted` 的身份带依赖声明。答 `known-unavailable` 的身份保留，并带替换件原因。从未取得的身份不出现。依赖在不在场、一份 Skill 此刻能不能用，由调用方判定。
4. `search` 按 name 与说明匹配当前合法集合中的身份，只对匹配的身份核验读取权，返回该主体可读的身份的同样摘要条目。匹配规则见成员规格[目录的匹配规则](../skill-contract/SPEC.md#catalog-search)。
5. 本组不按常驻筛选，条目顺序不承载含义。排序、集合修订与呈现归调用方。
6. 端口无法给出现行判断时，返回 `unknown`，不能以空集合表示「无方法」。

## 组内读取

本节是 F-SK03 中 Skill 内部的部分，对应 J-SK03。跨领域交接见[领域流程 F-SK03](../../../docs/domains/skills/key-flows.md#f-sk03-指定读取与工具消费者采用)。

```mermaid
sequenceDiagram
  participant C as 调用方
  participant A as SkillAccess
  participant E as SkillReadCheck
  participant V as SkillResolution
  participant S as SkillPackageSource
  C->>A: read(access, scope, target, { basis?, range?, signal? })
  opt 带Skill 材料依据
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
  V-->>A: known-unavailable，或 adopted(SkillRef)，或 basis-not-lawful，或 none，或 unknown
  alt known-unavailable（先判，与是否带依据无关）
    A-->>C: unavailable-stand-in 及安全原因
  else basis-not-lawful（身份 adopted，依据版本不合法）
    A-->>C: basis-unavailable
  else none
    A-->>C: not-available-to-you
  else unknown
    A-->>C: unknown
  end
  alt 引用不指向所请求的身份，或带依据时与依据的来源层、资产版本、内容摘要不一致
    A-->>C: unknown，当作端口没有作答，不调用来源
  end
  alt 不带依据，SkillRef 没有内容摘要（资产正文缺 package.digest）
    A-->>C: unsupported
  end
  A->>A: 所钉内容摘要：有 basis 取 basis，否则取 SkillRef
  A->>A: toPackagePath 校验目标，不合法时返回 bad-path
  A->>S: snapshot(SkillRef 的 locator)
  S-->>A: Skill 包快照，或 package-not-found、unavailable、entry-unreadable、outside-package
  alt entry-unreadable（非常规文件，或无法解析、成环的链接），或 entry-not-found、bytes-mismatch（来源不守端口契约）
    A-->>C: source-unavailable
  else outside-package（包内链接解析后落在包根之外）
    A-->>C: outside-package
  else 快照的内容摘要不等于所钉内容摘要，带Skill 材料依据
    A-->>C: basis-unavailable
  else 快照的内容摘要不等于所钉内容摘要，不带Skill 材料依据
    A-->>C: adopted-material-changed
  else 目标路径不在快照条目里
    A-->>C: resource-missing
  end
  A->>S: open(locator, 所钉内容摘要, 包内路径)
  S-->>A: 字节，或 entry-not-found、bytes-mismatch、outside-package、unavailable
  alt signal 已中止（每次调用端口之前与每次端口返回之后都检查，包括 check 与 resolve，图中只画这一处）
    A-->>C: aborted，不交部分内容
  end
  A->>A: 算出字节的内容摘要，与快照中的条目内容摘要比较
  alt 不符
    A-->>C: version-changed，不交新内容
  end
  A->>A: 按请求的字节范围截取
  A-->>C: 内容、Skill 材料依据、包内路径、媒体类型、实际字节范围、总长与 complete
```

图中每个 `alt` 分支都在返回后结束本次操作。端口失败按[工程设计「端口」](architecture.md#端口)的映射表转换：`package-not-found` 带Skill 材料依据时为 `basis-unavailable`，不带时为 `source-unavailable`。`open` 的 `entry-not-found` 为 `resource-missing`。`open` 的 `bytes-mismatch` 为 `version-changed`。`outside-package` 照原样。`unavailable` 为 `source-unavailable`。`snapshot` 的 `entry-unreadable` 为 `source-unavailable`，`open` 的 `entry-unreadable` 也是（防御性的映射）。`snapshot` 不对单个条目作答，它答 `entry-not-found` 或 `bytes-mismatch` 时来源不守端口契约，也为 `source-unavailable`。`read`、`list` 与 `export` 在每次调用端口之前与每次端口返回之后各检查一次 `signal`，四个端口 `check`、`resolve`、`snapshot`、`open` 都在内。调用方中止时，操作答 `aborted`，不再调用端口，也不交部分内容。中止的响应时间受端口时间限制：每次端口调用都会结束时，操作才答复。`read` 的字节范围起点或长度为负数或非整数时，`read` 在调用任何端口之前抛出 `TypeError`，图中省略。读正文时，所钉材料的 `SKILL.md` 没有合法的头部定界，则正文起点不明，`read` 答 `source-unavailable`，不交内容，图中省略，见[工程设计「读取」](architecture.md#读取)第 11 步。

1. 调用方可以不带Skill 材料依据，这时 `SkillAccess` 读当时的合法版本。调用方也可以带上此前结果给出的Skill 材料依据，这时读取固定该版本。Skill 材料依据含能力标识、来源层、资产版本与内容摘要，不含包定位。工作区来源的Skill 材料依据可以不带资产版本。
2. 带Skill 材料依据时，`SkillAccess` 先核对依据的能力标识等于目标能力标识。不等时对外返回 `not-available-to-you`，不披露差异原因。
3. `SkillAccess` 每一步都现场核验，不用缓存代替。任一端口无法判定时返回 `unknown`。
4. 先核验读取，再解析对应。对无权主体，「无权」与「身份不存在」都返回 `not-available-to-you`。
5. 只有 `SkillResolution` 答 `known-unavailable` 时，才返回 `unavailable-stand-in`。`resolve` 先判 `known-unavailable`，再判 `adopted`，所以带不带Skill 材料依据，替换件都相同。替换件由 Skill 用 `resolve` 交来的最后合法 name、说明与原因组装。
6. 带Skill 材料依据时，`SkillResolution` 核对依据所指的材料是否合法，并当场给出包定位。只有身份 `adopted` 且依据的版本不合法时，`resolve` 才答 `basis-not-lawful`，`SkillAccess` 返回 `basis-unavailable`。
7. 资产正文缺 `package.digest` 时，不带依据的 `SkillRef` 没有内容摘要，`read` 与 `list` 返回 `unsupported`。带依据时，端口带回依据的内容摘要，这一步总是通过，来源在引用的定位处没有包时返回 `basis-unavailable`。
8. 先取快照并比较Skill 包快照的内容摘要，再查条目，再读字节并按条目内容摘要核对。所以一次读取只对应一份Skill 包快照。快照不符时，带Skill 材料依据报 `basis-unavailable`，不带Skill 材料依据报 `adopted-material-changed`。
9. 读取不判定依赖在不在场，也不判定脚本有没有所需的设施。正文与资源走同一条路径。
10. 成功结果交出后归调用方。`SkillAccess` 不保留副本，不记「已加载」状态，也不把 `SkillRef` 或包定位交给调用方。

`list` 走同一条核验与解析路径，再取快照并比较Skill 包快照的内容摘要。只有内容摘要相符后，`list` 才返回快照中的资源条目。`describe` 只走核验与解析，再交出 `resolve` 交来的声明投影中的依赖、脚本与设置声明。`describe` 带Skill 材料依据、`resolve` 答 `adopted` 时，结果的Skill 材料依据就是调用方交来的依据，也就是依据所指的材料，见[工程设计「读取」](architecture.md#读取)第 5 步。它不读包字节，也不交设置值。不带依据且资产正文缺 `package.digest` 时，`describe` 照常交出声明，结果不带Skill 材料依据，并标明「没有可读的包」。带依据时，`describe` 交出依据所指的材料，不标「没有可读的包」。

## 组内导出

本节对应 J-SK05 中 Skill 一侧的部分：交出包字节，供调用方物化。脚本怎样执行不在本组。

```mermaid
sequenceDiagram
  participant C as 调用方
  participant A as SkillAccess
  participant E as SkillReadCheck
  participant V as SkillResolution
  participant S as SkillPackageSource
  C->>A: describe(access, scope, 能力标识)
  A-->>C: 脚本声明、设置声明、依赖声明、Skill 材料依据
  C->>A: export(access, scope, 能力标识, Skill 材料依据)
  A->>A: 依据的能力标识须等于目标能力标识，否则 not-available-to-you
  A->>E: check(access, scope, 能力标识)
  E-->>A: granted，或 refused，或 unknown
  A->>V: resolve(access, scope, 能力标识, { basis })
  V-->>A: known-unavailable，或 adopted(SkillRef)，或 basis-not-lawful，或 none，或 unknown
  A->>A: 所钉材料是依据本身，内容摘要取依据的
  A->>S: snapshot(SkillRef 的 locator)
  S-->>A: Skill 包快照，或 package-not-found 等来源失败
  alt 快照的内容摘要不等于依据中的内容摘要
    A-->>C: basis-unavailable
  end
  loop 快照中的每个条目，包括控制文件
    A->>S: open(locator, 依据中的内容摘要, 包内路径)
    S-->>A: 字节，或 来源失败
    A->>A: 按条目内容摘要核对字节
  end
  alt 任一条目不符
    A-->>C: version-changed，不交部分包
  end
  A-->>C: 全部条目（包内路径、媒体类型、大小、内容摘要、字节）、Skill 包快照的内容摘要与Skill 材料依据
```

1. `export` 必须带Skill 材料依据。调用方先从 `describe` 取得它。
2. 核验、解析与端口失败的映射同[组内读取](#组内读取)。`SkillReadCheck` 与 `SkillResolution` 的拒绝分支与读取相同，图中省略。`export` 总带依据，所以不答 `unsupported`：端口对带依据的引用总带回依据的内容摘要。
3. 每个条目都按快照中的条目内容摘要核对。任一条目不符时不交部分包。
4. 物化的落点、之后的使用与脚本执行都不归本组。脚本身份是能力标识加入口的包内路径，见[工程设计「Q-SK04」](architecture.md#q-sk04-脚本桥接的发起控制和原结果协议)。
