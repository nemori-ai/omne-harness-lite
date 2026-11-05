# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

本包有五个内部模块与一个根入口：

| 模块 | 职责 | 持有的状态 |
| --- | --- | --- |
| `index.ts` | 根入口，只转导工厂与两个资源类型 | 无 |
| `resources.ts` | 资源类型 `TiktokenRanks`、`TiktokenResources` | 无 |
| `tokenizer.ts` | 初始化核对、构造引擎、段验证与连接 | 每个 tokenizer 持有普通文本计数闭包与特殊 token 名集合 |
| `ordinary-counter.ts` | 固定引擎形状适配、预切分、精确 BPE 计数 | 初始化快照；每次调用独立的正则、邻接节点与候选堆 |
| `digest.ts` | 资源的规范 JSON 与 SHA-256 摘要 | 无 |
| `engine-version.ts` | 读取实际安装的 js-tiktoken 版本 | 模块级缓存，每个进程读取一次 |

依赖方向：`tokenizer.ts` 依赖 `digest.ts`、`engine-version.ts`、`ordinary-counter.ts` 与 `resources.ts`。`digest.ts` 只依赖 `resources.ts` 的类型与 `node:crypto`。外部依赖只有 model-contract（只用类型）、operation-result 与 js-tiktoken 的 `js-tiktoken/lite` 入口。发布代码不导入 `js-tiktoken` 的根入口或任何 `ranks` 子入口，所以本包不带任何词表。

## 关键机制与理由

**资源只在初始化时核对。** 三项核对的定义见 [SPEC“初始化”](../SPEC.md#初始化)。核对放在初始化中，`count` 因此是纯计算，不受资源变化影响。代价：每次初始化都要对整份词表算一次 SHA-256。o200k 的规范 JSON 约 2.3 MB，摘要在毫秒级完成。家族成员应复用 tokenizer，不应每次计数都初始化。

**规范 JSON 自己写出。** `@omne-harness/json-text` 的 `writeJsonText` 保持键的原有顺序，没有排序后的规范形式，所以 `digest.ts` 自己写出。资源只含字符串、非负整数与对象，对这些值，写法与 RFC 8785（JCS）相同。数不是非负安全整数时抛出 `ResourceShapeError`，初始化把它转为 `unavailable`。如果以后 json-text 提供规范 JSON，应改用它，并核对摘要不变。

**版本从引擎自己的清单读取。** js-tiktoken 的 `exports` 不导出 `package.json`。本包用 `createRequire` 解析 `js-tiktoken/lite`，从该文件所在目录向上找 `name` 为 `js-tiktoken` 的 `package.json`，最多向上 4 层。解析用的就是本模块加载的同一个包，所以读到的是实际加载的版本，而不是仓库目录中的声明。只有“文件不存在”时继续向上找，其他读取错误原样抛出。

**普通文本保持固定引擎的精确结果。** `ordinary-counter.ts` 的计数在未修改的 js-tiktoken 1.0.21 正常返回时等于其 `encode(text, [], []).length`。特殊 token 字样始终是普通文本。空文本先返回 0，非空计数才编译 `ug` 正则。迭代沿用 `matchAll`，保留未匹配间隙与零宽匹配的行为。

**只在一个位置适配未声明的运行时成员。** 原引擎构造完成后，`snapshotPinnedEngine` 核对 `patStr`、`rankMap` 及其键和值的类型。它们没有出现在该依赖的公开声明中。形状不符时抛出明确的固定依赖不兼容错误。其他内部函数消费已核对的快照。词表仍只由原引擎解析一次，家族资源与三个初始化核对不变。

**有限 rank 使用局部合并。** 每个 UTF-8 字节开始时对应一个双向链节点。候选堆按 rank 升序，再按原左字节偏移升序排序。候选保存两端节点及其版本。取出候选时，先核对节点存活、相邻关系与版本。合并保留左节点，撤去右节点，只更新左右两条相关边。节点的起点不变，因此偏移顺序等于原算法从左向右扫描的顺序。

初始候选与原算法的可合并相邻对相同。每次都选相同的最小 rank 与最左位置；合并只改变相邻边，局部更新后候选再次对应。这给出相同终态的归纳依据。整片段命中词表时先返回 1，不要求中间合并存在。单字节缺 rank 仍计 1，多字节终态只计有 rank 的片段。

长度为 n 的片段至多合并 n−1 次，候选插入次数至多 3(n−1)。调度时间为 O(n log n)，空间为 O(n)。M 是实际词表的最大 token 字节数，超过 M 的查询直接返回缺项，键构造总成本为 O(nM)。空字节键的长度为 0。该界不覆盖正则执行。计数不构造最终 token 数组，也不重造旧引擎展开数组时的宿主参数或栈容量上限。资源构造、正则配置与固定依赖形状的语义错误仍保留；这不承诺无限宿主容量。每次计数独立分配节点与候选，没有跨调用缓存或统计接口。计数仍是同步计算，不能据此声称事件循环不被阻塞。

**非有限 rank 保留原引擎路径。** 只要解析后的任一 rank 是 NaN 或正负 Infinity，普通文本就交给原 `encode(text, [], [])`。这条兼容路径没有上述性能保证。NaN 下的原扫描不能用全序堆替代；例如词表的候选次序会影响后续能否继续合并。

**相邻文本段先合并。** BPE 的预切分与合并跨越段的边界，分段计数之和可能大于合并后的计数。例如 o200k 中 `hel` 与 `lo` 各 1 个 token，`hello` 也只有 1 个。特殊 token 段把文本分成独立的部分。

**非良构 Unicode 返回 `invalid`。** `TextEncoder` 会把孤立的代理码元替换为 U+FFFD。契约不允许静默替换，所以本包在编码前用 `isWellFormed()` 检查。

## 来源与采用

调度算法由本包独立实现，源码与构建版本由仓库提交标识。未修改的 js-tiktoken 1.0.21 负责资源解析，并提供差分 oracle 与异常词表兼容路径。家族 `implementation.digest` 仍标识原 npm tarball，不覆盖本包算法代码。

固定依赖的 npm `gitHead` 是 `4c8b748e07992c00386f3180af5c574b27b65139`。包元数据声明 MIT；该修订的[上游许可证](https://github.com/dqbd/tiktoken/blob/4c8b748e07992c00386f3180af5c574b27b65139/LICENSE)载明 Copyright (c) 2022 OpenAI, Shantanu Jain。发布目录没有附带 LICENSE 文件，许可核对使用该固定源的正文。本包不复制依赖的词表或完整编码实现。

## 验证与维护

机制与验证的对应见 [SPEC“组合与验证”](../SPEC.md#组合与验证)。

- 改变规范 JSON 的写法会使所有家族成员的摘要失效。须先修订 SPEC，并同步全部家族成员。
- 升级 js-tiktoken 时，核对 `encode` 的参数语义、`Tiktoken` 构造函数的秩数据形状与 `package.json` 的位置是否改变；重新核对私有运行时形状、最左最小 rank 语义、异常 rank 行为和差分测试。
