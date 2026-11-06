# w4-mcp-cordis 关口评审 C 面原文

交回时刻 2026-11-06T14:44:34.914Z（会话记录），代理 `aaaf2fd4dd7606f84`。原样保存，裁定见 `mcp-cordis-r1.md`。

---

## w4-mcp-cordis 关口评审 C 面（设计与实践）：结论为非阻断

评审对象是 PR #1158，head `f5ead35f4`，基线 `8446c4588`。判据用了 ub-mode、`pstack:typescript-best-practices`、`docs/defensive-patterns.md` 与 layers-and-dependencies「方法依据与采用范围」，两个技能都已加载。范围是两个成员的 `src/` 与 `tests/`。本面只读，没有运行工具。

没有发现违反已定事项、IC 条款或闭包规格第 1–8 条和追加 1 的地方。下面各条是设计与实践上的改进。C-1 与已定的决定 4 有冲突，所以交给派发者。C-2、C-3、C-6 与 Skill 组已有的裁定（C-F2、C-F5）同类。为了同一波保持一致，建议同样处理。

### 逐条发现

**C-1　撤除函数丢掉了 `closeAll` 的确认范围报告（设计观察，归派发者 / 决定 4）**
- 位置：`packages/mcp/mcp-host-local/src/cordis.ts:307-312`；`docs/cordis.md:65` 写明「插件丢弃这份报告」。
- 问题：
  - 契约 `mcp-contract/src/services.ts:225-226` 规定 `closeAll` 的报告交给「持有本实例的宿主，在退出时」，而且只报告已经确认的范围。
  - MC-10 写明，进程 `stop()` 答 `root-only` 或 `unconfirmed` 时，报告带上这个范围。
  - 插件就是这里的宿主，但它把报告丢弃了，也没有转交给别人。所以进程树没有确认停止时，哪里都没有记录。
- 依据：DP-04「释放以可观察终态为准」，DP-07「外部输出不声称普遍可逆」，AGENTS「外部输出不能因 disposer 而声称可逆」。
- 改法：撤除函数仍然只做一步收口，不捕获异常，只是使用返回值：
  ```ts
  ctx.effect(() => async () => {
    const report = await services.connections.closeAll()
    for (const entry of report)
      if (entry.process === 'root-only' || entry.process === 'unconfirmed')
        ctx.logger('mcp').warn('process stop not confirmed', entry.ref, entry.process)
  }, 'mcp.closeAll')
  ```
  `AggregateError` 的路径不变，因为那时没有报告。决定 4 和闭包规格第 5 条写的是「内容只有一步」，写者照规格做了，所以这条不是写者的缺陷。由派发者决定改不改；不改的话，在 `docs/cordis.md` 的「未覆盖」里写明残留进程无人可见。

**C-2　`isPlainRecord` 与 `fieldsIssue` 不查原型，`in` 会读到原型链上的字段（非阻断，同 Skill C-F2 的裁定）**
- 位置：`mcp-host-local/src/cordis.ts:80-99`。
- 问题：
  - 判据的名字是 plain record，但 `isPlainRecord` 不查原型，对 `new Date()` 也答 true。按 typescript-best-practices，这是名不副实的类型守卫。
  - `fieldsIssue` 用 `Object.keys` 找多余字段，看不到 symbol 键；用 `field in record` 找缺少的字段，会读到原型链。
  - 反例：`Object.create(CONFIG)` 自己没有任何键，但五个字段都能从原型读到，所以 `validate` 接受它并交出一份副本。
  - 同一波的 Skill 组已经裁定，plain record 的判据是原型为 `Object.prototype` 或 `null`（`skill-host-local/src/cordis.ts:24-31`）。同一条规则在两个插件里有两种写法。
- 改法：
  - `isPlainRecord` 增加检查：`const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null`。
  - `fieldsIssue` 用 `Reflect.ownKeys(record)` 找多余字段（非字符串键也算多余），用 `Object.hasOwn(record, field)` 找缺少的字段。
  - 拒绝表加两行：`new Date()` 与 `Object.create(CONFIG)`，各断言确切的 `issues`。

**C-3　装载失败的用例只断言 `rejects.toBeDefined()`，任何原因的失败都能通过（非阻断，同 Skill C-F2 的后一半）**
- 位置：`mcp-host-local/tests/cordis-entry.spec.ts:587-591`。
- 问题：
  - 六行拒绝里，只有「多一个字段」那一行依赖 Schema 确实接上了插件。
  - 另外五行即使 Schema 不生效，装载也会失败，只是原因不同：
    - 缺 `maxActions`：`createMcp` 抛 `RangeError`（`mcp/src/config.ts:27-32`）。
    - `maxListingPages: '5'`：同样是 `RangeError`。
    - `clientInfo` 缺字段，或 `name` 不是文本：`checkOptions` 抛 `RangeError`（`options.ts:15-18`）。
    - `'config'`：`checkOptions` 解构 `options.clientInfo` 时抛 `TypeError`。
  - 所以 `docs/cordis.md` 写的「各交一条确切的 `issues`，插件加载失败」在装载这一层没有逐行验证。
- 依据：ub-mode「Test Behavior」，以及「断言契约要求的结果」。
- 改法：Cordis 4.0.4 导出 `ValidationError`（`lib/index.js:933`、`1829`），它的消息是 `invalid config:\n  - <message>`。用例改成：
  ```ts
  await expect(loadUntyped(ctx, config)).rejects.toThrow(ValidationError)
  await expect(loadUntyped(new Context(), config)).rejects.toThrow(message)
  ```
  这和 `RangeError` 的两条用例（`:594-604`）已经断言错误类的写法对称。

**C-4　数值字段按位置解构，与 `BOUNDS` 的次序隐式耦合；类型错误的消息没有点出是哪个字段（非阻断）**
- 位置：`mcp-host-local/src/cordis.ts:113-122`。
- 问题：
  - `const [maxListingPages, maxActions, …] = BOUNDS.map(name => value[name])` 用数组下标把值对应到名字。
  - 如果有人调整 `BOUNDS` 的次序，例如按字母排序，`maxListingPages` 与 `maxActions` 的值会悄悄互换。两个值都能通过 typeof 检查和范围检查，插件会带着错误的上界运行，没有任何报错。
  - 字段与值的对应只应该由名字决定（ub-mode「One decision lives in one place」）。
  - 另外，类型错误时消息一次列出全部四个字段，与缺字段、多字段的消息不一致（那两种都点名具体字段）。
- 改法：
  ```ts
  const bound = BOUNDS.find(name => typeof value[name] !== 'number')
  if (bound !== undefined) return issue(`${bound} must be a number`)
  const { maxListingPages, maxActions, instructionsByteLimit, probeTimeoutMs } = value
  // 保留现有的 typeof 链以收窄类型（四个变量此时是 unknown），但按名字取值
  ```
  这一步也可以只改成按名字解构，加上现有的 typeof 链，不再改别的。用例 `:570` 的消息要随之改成点名的形式。

**C-5　`McpPluginParts` / `McpPluginConfig` 把别处拥有的字段类型重写了一遍（非阻断）**
- 位置：`mcp-host-local/src/cordis.ts:51-78`。
- 问题：
  - `principalKey`、三个上界属于 `McpConfig`（`mcp-contract/src/services.ts:249-258`）。
  - `checkOutput`、`clock` 属于 `McpPorts`（`:229-243`）。
  - `clientInfo`、`probeTimeoutMs`、`fetch` 属于 `LocalTransportOptions`（`options.ts:3-10`）。
  - JSDoc 也已经注明了出处，但类型是手抄的。`FIELDS` 与 `CLIENT_INFO_FIELDS` 又是第二份字段名清单，和类型之间没有编译期联系。
- 依据：typescript-best-practices「Schema-derived types」，以及 ub-mode「One decision lives in one place」。
- 改法：
  ```ts
  export type McpPluginParts = Readonly<
    Pick<McpConfig<unknown>, 'principalKey'> &
    Pick<McpPorts<unknown, unknown>, 'checkOutput' | 'clock'> &
    Pick<LocalTransportOptions, 'fetch'>>
  export type McpPluginConfig = Readonly<
    Omit<McpConfig<unknown>, 'principalKey'> & Omit<LocalTransportOptions, 'fetch'>>
  const FIELD_SET: Record<keyof McpPluginConfig, true> = {
    maxListingPages: true, maxActions: true, instructionsByteLimit: true,
    probeTimeoutMs: true, clientInfo: true }
  const FIELDS = Object.keys(FIELD_SET)
  ```
  这样「函数进工厂参数、数据进配置」的切分可以直接从类型上看出来。上游增加或改名一个字段时，`FIELD_SET` 会编译失败，Schema 不会悄悄漏掉这个字段。在 `exactOptionalPropertyTypes` 下，`Pick` 保留可选性，`erasableSyntaxOnly` 也不受影响。

**C-6　定义成员的用例只装载了七个类中的两个（非阻断，同 Skill C-F5 的裁定）**
- 位置：`packages/mcp/mcp-cordis-contract/tests/cordis-entry.spec.ts:61-81`。
- 问题：
  - 只有 `UseEligibilityService` 与 `CredentialUseService` 在真实 `Context` 上装载过。
  - 另外五个类的构造函数 `super(ctx, X.provide)` 在本成员里没有被执行。
  - 反例：把 `ActionDiscoveryService` 的构造函数改成传 `ActionInvokerService.provide`，本成员的四条用例全部通过，因为静态的 `provide` 没有变。
  - `mcp-host-local` 的用例会跨成员抓到这个错误，但本成员单独做差分变异时，它会作为存活的变异体出现。
- 改法：仿照 Skill 组的修复，改成覆盖七个类的表格用例。每个类写一个最小的具体子类（方法体答一个固定值），装载后断言 `ctx.get(<键常量>)` 是这个子类的实例，`dispose()` 之后答 `undefined`。

**C-7　用例的两处卫生问题（非阻断，小）**
- `tests/cordis-entry.spec.ts:324-330`：`firstLanded` 每 10 ms 轮询一次，没有上限。落点从没被调用时，用例只能等 vitest 超时。
  - 改法：`scriptedLanding` 像 `called` 一样提供一个 `started: Promise<Landed>`，在第一次 `start` 时兑现，用例等这个 promise。
- `:497`：采用换代用例断言 `toContain('other')`。替换后的脚本只列出 `other`，所以应该断言 `toEqual(['other'])`。这样做不增加成本，而且能排除旧条目残留在清单里的情况。

### Testing Decisions 的判断（简报点名要看）

- **已经先写好的部分：** W4 MCP 规格的 Testing Decisions 先写了原则（判据、反例、变红验证，以及先变红再实现）、唯一的接缝，以及「不能声称的事」。「失败语义」表的每一行都有「怎样验证」。
- **没有逐条写反例的部分：**
  - 「每个转发方法都要在能区分它的路径上被调用」和「配置接受的一半」，是在 Skill 组评审之后才由闭包规格追加 1 补上的。
  - 每条用例在什么缺陷下变红，只存在于写者的 `tmp/w4-mcp-cordis/{logs,mut}/mutants*.json`（H1–H26、C1–C4）。
  - 提交 `d0714b7a5` 把源码和用例放在同一个提交里，所以不能从历史上判断是不是先写用例、再实现。
- **用例是否照它写：** 照了。变红记录里只有 H4 存活，其余都被杀死。
- **改法：** 把「缺陷 → 变红用例」的对照表收进 `docs/cordis.md` 的「验证义务」，或者收进 SPEC 的验证表，让它由成员持有，而不是只留在 tmp。

### 有意不列为发现的几处

- `credentialsOf` 里两条相同的 `return port.acquire(...)`（`src/cordis.ts:196-197`）：这是不加类型断言、按收窄后的 `purpose` 命中各自重载的正确写法。差分变异会把这个条件报成等价变异体，记为等价即可。要彻底去掉它，需要把契约的 `acquire` 改成泛型，而这属于停放清单里的「形状美化」。
- 四个端口适配器结构几乎相同：ub-mode 说「已经清楚而且局部的代码就留着」，而且每个端口缺席时的答复形状不同，不算同一个决定重复了两处。
- 用 `Reflect.apply` 绕过有类型的重载来装载非法配置：没有使用 `as`，注释说明了理由，可以接受。
- 三个服务子类与 `ctx.effect` 的写法：与 Skill 组和先例的形状一致，转发是完整的，`apply` 里也没有 `inject`。

### 未覆盖

- 本面没有运行任何工具：类型检查、lint、度量、用例都没有跑（属于 A 面）。没有重跑差分变异（属于 D 面）。写者的变红记录只读了汇总。
- H4（落点缺席时答 `facility-missing`）存活。原因是 `mcp/src/internal/build.ts:287-289` 把落点的三种失败都合成了 `landing-unavailable`，所以闭包规格第 5 条「`ProcessLanding.start` 缺席答 `fail('unknown')`」在这个接缝上观察不到。派发者已经认定它是等价变异体，这里只做记录。
- 写者是否先确认用例变红、再实现：无法从提交历史核实。
- 真实端口提供者、Streamable HTTP 上的插件旅程、进程树的停止范围、IC-6：沿用 `docs/cordis.md`「未覆盖」的现有说法，没有另外核对。
- C-5 的 `Pick`/`Omit` 写法没有在副本上编译验证，是按 TS 语义和 tsconfig（`exactOptionalPropertyTypes`、`erasableSyntaxOnly`）推断的。
