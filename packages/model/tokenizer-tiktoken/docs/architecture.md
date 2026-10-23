# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

本包有四个内部模块与一个根入口：

| 模块 | 职责 | 持有的状态 |
| --- | --- | --- |
| `index.ts` | 根入口，只转导工厂与两个资源类型 | 无 |
| `resources.ts` | 资源类型 `TiktokenRanks`、`TiktokenResources` | 无 |
| `tokenizer.ts` | 初始化核对、构造引擎、`count` | 每个 tokenizer 持有一个 js-tiktoken 引擎与特殊 token 名集合 |
| `digest.ts` | 资源的规范 JSON 与 SHA-256 摘要 | 无 |
| `engine-version.ts` | 读取实际安装的 js-tiktoken 版本 | 模块级缓存，每个进程读取一次 |

依赖方向：`tokenizer.ts` 依赖 `digest.ts`、`engine-version.ts` 与 `resources.ts`。`digest.ts` 只依赖 `resources.ts` 的类型与 `node:crypto`。外部依赖只有 model-contract（只用类型）、operation-result 与 js-tiktoken 的 `js-tiktoken/lite` 入口。发布代码不导入 `js-tiktoken` 的根入口或任何 `ranks` 子入口，所以本包不带任何词表。

## 关键机制与理由

**资源只在初始化时核对。** 三项核对的定义见 [SPEC“初始化”](../SPEC.md#初始化)。核对放在初始化中，`count` 因此是纯计算，不受资源变化影响。代价：每次初始化都要对整份词表算一次 SHA-256。o200k 的规范 JSON 约 2.3 MB，摘要在毫秒级完成。家族成员应复用 tokenizer，不应每次计数都初始化。

**规范 JSON 自己写出。** `@omne-harness/json-text` 的 `writeJsonText` 保持键的原有顺序，没有排序后的规范形式，所以 `digest.ts` 自己写出。资源只含字符串、非负整数与对象，对这些值，写法与 RFC 8785（JCS）相同。数不是非负安全整数时抛出 `ResourceShapeError`，初始化把它转为 `unavailable`。如果以后 json-text 提供规范 JSON，应改用它，并核对摘要不变。

**版本从引擎自己的清单读取。** js-tiktoken 的 `exports` 不导出 `package.json`。本包用 `createRequire` 解析 `js-tiktoken/lite`，从该文件所在目录向上找 `name` 为 `js-tiktoken` 的 `package.json`，最多向上 4 层。解析用的就是本模块加载的同一个包，所以读到的是实际加载的版本，而不是仓库目录中的声明。只有“文件不存在”时继续向上找，其他读取错误原样抛出。

**文本按普通文本编码。** 本包调用 `encode(text, [], [])`：没有允许的特殊 token，也没有禁止的特殊 token。js-tiktoken 的默认值会对文本中的特殊 token 字样抛出错误，`'all'` 会把字样激活为特殊 token。两者都不符合契约。

**相邻文本段先合并。** BPE 的预切分与合并跨越段的边界，分段计数之和可能大于合并后的计数。例如 o200k 中 `hel` 与 `lo` 各 1 个 token，`hello` 也只有 1 个。特殊 token 段把文本分成独立的部分。

**非良构 Unicode 返回 `invalid`。** `TextEncoder` 会把孤立的代理码元替换为 U+FFFD。契约不允许静默替换，所以本包在编码前用 `isWellFormed()` 检查。

## 验证与维护

机制与验证的对应见 [SPEC“组合与验证”](../SPEC.md#组合与验证)。

- 改变规范 JSON 的写法会使所有家族成员的摘要失效。须先修订 SPEC，并同步全部家族成员。
- 升级 js-tiktoken 时，核对 `encode` 的参数语义、`Tiktoken` 构造函数的秩数据形状与 `package.json` 的位置是否改变。
