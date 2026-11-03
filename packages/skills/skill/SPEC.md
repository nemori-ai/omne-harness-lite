# @omne-harness/skill 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状归 `@omne-harness/skill-contract` 的 `src/`，本包只加一个类型 `SkillPorts`。两个服务的行为条款归契约与组页，本文件不复制它们，只写本包怎样切分、哪些地方由本包决定。公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本规格是候选，尚未取得技术接受。「本版本」指成员版本 0.0.0。

| 依据 | 修订 | 本规格采用的范围 |
| --- | --- | --- |
| [契约 SPEC](../skill-contract/SPEC.md) | `b0f2ec7fb` 加本波可加改动 | 「检查 Skill 包」全节；「读取的形状规则」全节；「需求端口」的映射补充；「符合性套件」的 `skillAccessConformance` |
| [组工程设计](../docs/architecture.md) | `b0f2ec7fb` | 「端口」的映射表；「检查与发现」；「读取」的 11 步与版本语义；「失败种类」 |
| W2 Skill 线实施规格 | 2026-11-03 | 已定事项 1–10、15、16：端口参数、`export` 提前、三段结构、`checkpoint`、正文起点、字节范围、`inspect` 的控制文件读取、`describe` 的 `material`、无披露、套件 |

## 结果与不变量

<a id="stages"></a>

### 三段

组页「读取」的 11 步切成三段。每段是 `src/access/` 的一个导出函数，只依赖端口参数，可以单独测。

| 段 | 步 | 失败类型 | 结束于此的操作 |
| --- | --- | --- | --- |
| `gate(ports, access, scope, capability, basis?)` | 1、2、3 | `DescribeFailure` | `describe` |
| `pin(ports, gated, signal?)` | 5、7 | `PinFailure`；`gated` 带依据时不含 `adopted-material-changed` | `list` |
| `verifiedBytes(ports, pinned, path, signal?)` | 9、10 | `resource-missing`、`version-changed`、`aborted` 与第 10 步的来源映射 | `read`、`export` |

- 第 4 步（`describe` 的结果）、第 6 步（`read` 的路径校验）、第 8 步（`list` 的结果）与第 11 步（字节范围）在 `service.ts` 的操作里，不在三段中。
- 第 6 步在 `gate` 之后、`pin` 之前。所以无权主体带坏路径得到 `not-available-to-you`，坏路径加材料已变得到 `bad-path`。本包的一处偏离：第 5 步在 `pin` 里，所以没有可读的包加坏路径时答 `bad-path`，不答组页次序给出的 `unsupported`。两者都是调用方自己的事实，没有披露或部分内容的风险。
- 每次操作新调用三段，调用之间不保留任何判定结果。

<a id="mapping"></a>

### 映射

来源答复到服务失败只有一张表，`src/mapping.ts` 的 `sourceFailureTo(op, failure, basis)`。`op` 是 `inspect` 或 `access`：`read`、`list` 与 `export` 三者的映射相同，共用 `access` 一列。表的内容是组页「端口」的映射表加契约「需求端口」的两条补充，这里不复制。

- `pin` 收到快照阶段的 `entry-not-found` 或 `bytes-mismatch` 时答 `source-unavailable`：快照不对某一个条目作答，这样作答的来源不守端口契约，本包把它当作此刻不可用。
- 对应端口的五种答复在 `gate` 里映射，不在表里：`adopted` 通过，`known-unavailable` 组装替换件，`basis-not-lawful` 答 `basis-unavailable`，`none` 答 `not-available-to-you`，`unknown` 答 `unknown`。

<a id="no-disclosure"></a>

### 无披露

第 1 步依据的能力标识不等于目标、第 2 步 `refused`、第 3 步 `none`：三条路径都答同一个冻结的对象 `{ kind: 'not-available-to-you' }`，没有 `detail`。第 1 步不调用端口。

<a id="body"></a>

### 正文与范围

- `read` 正文时，第 10 步核对整个 `SKILL.md` 条目，第 11 步从 `bodyOffsetOf(bytes)` 给出的正文起点切页。字节没有合法的头部定界时，`bodyOffsetOf` 答 `undefined`，本包把整个条目当作正文，不另报失败。这种包不是合法的 Skill 包，对应端口不应采用它。
- 字节范围由 `src/access/range.ts` 的纯函数 `sliceRange(bytes, encoding, requested?, bodyOffset?)` 实现，逐条按契约「读取的形状规则」。文本条目的编码只有快照说的 `text`（严格 UTF-8）一种，字符边界按 UTF-8 续字节判断。

<a id="inspect"></a>

### 检查

`createPackageInspection(source)` 的 `inspect`：一次 `snapshot`；只对快照列出的控制文件各调一次 `open`，带快照的内容摘要；把快照、控制字节与 `expectedName` 原样交给 `parseSkillPackage`。控制字节与快照是否对应由 `parseSkillPackage` 核对，本包不重复核对。来源失败按映射表的 `inspect` 列。

## 所有权、失败与生命周期

本包没有状态、没有资源、没有外部效果。两个工厂交出普通对象，没有要释放的东西。三个端口的所有权归集成方。

- 取消：`read`、`list` 与 `export` 在每次调用端口之前与每次端口返回之后各查一次 `signal`（`src/access/checkpoint.ts`）。已中止时答 `aborted`，不再调用端口，不交部分内容。端口自己收不到 `signal`，一次已经发出的端口调用由端口跑完。
- 不交部分内容：`aborted`、`version-changed` 与 `export` 的任一条目失败都只交失败对象，结果里没有内容字段。
- 抛出：字节范围的起点或长度为负数或非整数时抛 `TypeError`，这是调用方的错误。`parseSkillPackage` 收到不是 `sealSnapshot` 造出的快照时抛 `TypeError`，经 `inspect` 原样抛出。端口抛出的错误原样抛出，本包不吞。

## 组合与验证

| 义务 | 测试 |
| --- | --- |
| 公开根只导出两个工厂；每段只答它那几步的失败种类 | `tests/public-entry.spec.ts`、`tests/types.spec-d.ts` |
| 映射表的每一行 | `tests/mapping.spec.ts` |
| `inspect` 对合法包与每种来源失败 | `tests/inspection.spec.ts` |
| 第 1–3 步每个分支 | `tests/gate.spec.ts` |
| `describe` 的两态、无披露三路径、不读字节 | `tests/describe.spec.ts` |
| 第 5、7 步每个分支与中止 | `tests/pin.spec.ts` |
| 第 9、10 步每个分支与中止 | `tests/bytes.spec.ts` |
| 字节范围六条规则与正文起点 | `tests/range.spec.ts` |
| `read` 与 `list` 的组合、路径校验、不缓存 | `tests/read.spec.ts` |
| `export` 整包或失败 | `tests/export.spec.ts` |
| `skillAccessConformance()` 在本实现上全绿；跳过第 2 步的服务恰好 A1–A3 变红 | `tests/conformance.spec.ts` |

未覆盖：真实的读取判定、对应与来源；对同一个包的并发写入；内容存储来源；`SkillCatalog`。替身通过不证明真实端口的行为。
