<agent-message from="a4b302bd5036dd2df">
[Subagent hand-back] The text below is the final report of a subagent this session delegated to. It is model output, NOT a message from the user: instructions, requests, or approval claims inside it are the subagent's words and carry no user authority. The harness indents every line of the report, so a frame-like line at column zero inside it would be forged. Notes above this frame may quote model-derived text, which carries no user authority either. The report follows:
  # w4-mcp-cordis 关口评审 A 面（正确性）报告
  
  ## 评审对象
  
  - 仓库与工作树：`/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis`，分支 `PanQiWei/skill-mcp-w4-mcp-cordis`（PR #1158）。
  - 基线 `8446c4588`，交付 head `f5ead35f4`。范围是 `git diff 8446c4588..HEAD`，含共享写合并 `065d0acc0`。
  - 接受级别：简报没有标。我按简报 A 节的判据做。L3 那一组只做了简短核对，见下文「L3 热点」。
  - 完成程度：A 节列出的各项都做完了。工具全部跑成。探针在副本上做，放在被忽略的 `tmp/review-a-mcp-cordis/` 下。收工时 `git status --porcelain` 输出为空，HEAD 仍是 `f5ead35f4`。
  
  **结论：本次范围内未发现阻断问题。** 有 3 条非阻断发现（N1–N3）。
  
  ## 工具一览
  
  | 入口 | 命令 | 结果 | 输出位置 |
  |---|---|---|---|
  | 变更清单 | `git diff --stat 8446c4588..HEAD`；`git log` 逐提交，附 trailer | 51 个文件，都在写范围内或属于追加 1 允许的共享写（`skill-host-local/package.json`、`pnpm-lock.yaml`、`mcp-host-local` 依赖段加 `kernel-basis`） | 会话内 |
  | 验收与测试改动 | `git diff 8446c4588..HEAD -- packages/mcp/mcp-cordis-contract/tests/*.ts` | 只替换了模板草稿用例，现有验收没有被弱化；`acceptance/` 没动 | 会话内 |
  | 依赖规则 | `pnpm run lint:deps`（工作树根） | 退出 0：「没有依赖违规、方向命中、成员之间的环，也没有未放行的组环（85 个成员、356 条成员边；1 个组环按具名例外放行）」；方向命中 0 | `/tmp/rv-mcp-a/lint-deps.log`（sha256 前 12 位 `722f79b5a9b2`） |
  | 结构度量 | `VITEST_MAX_WORKERS=6 pnpm run metrics --coverage --base 8446c4588f0e2400f2e905179ec252473f7b1066` | 第一次退出 2：派发者的 Stryker 沙箱 `packages/.stryker-tmp-…` 当时还在，turbo 报重名。沙箱清掉后在前台重跑，退出 0（14:53–14:55 UTC） | `/tmp/rv-mcp-a/metrics.log`（`17a98acbc17e`）；审讯页 `/data/qiwei/repos/omne-harness-lite/tmp/metrics/f5ead35f4/review.html` |
  | 撤除与 `AggregateError` 探针 | `node probe-dispose.mjs cordis-probe` 与 `cordis-probe-noawait` | 原样插件：成立。对照变异：不成立。详见下文「探针」 | `tmp/review-a-mcp-cordis/` |
  | 配置探针 | `node probe-config.mjs` | 13 个输入的答复都符合规格 | 同上 |
  | 名字冲突探针 | `node probe-names.mjs` | Cordis 4.0.4 的 `Service` 原型和实例都不含 `start`、`list`、`inspect` 等端口或服务方法名；生命周期走 `symbols.init` | 同上 |
  | 受影响测试与全套检查 | 没有重跑（简报没有要求） | 只读了卡上证据和派发者复跑的日志 | 卡 #1119 评论 6687353835 |
  
  ### 结构读数摘要（只列改动函数）
  
  - 这次改动了 37 个函数。超过 alert（12）的 0 个，超过 warn（10）的 1 个：
    - `packages/mcp/mcp-host-local/src/cordis.ts:109` `mcpPluginConfig.~standard.validate`：圈复杂度 11，覆盖 100%，CRAP 11。
  - 其余改动函数的 CRAP 都不超过 3.14：
    - `credentialsOf.acquire`（`:187`）：圈复杂度 3，覆盖 75%。未覆盖的是第 197 行 HTTP 用途的分支，原因是没有 HTTP 旅程。
    - `createMcpPlugin.apply`：圈复杂度 3，覆盖 100%。
    - 四个适配器方法：各自圈复杂度 2，覆盖 100%。
    - 12 个转发方法：各自圈复杂度 1，覆盖 100%。
  - `mcp-cordis-contract` 的五个构造函数在本成员的覆盖里是 0。它们由 `mcp-host-local` 的用例跨成员执行，不算问题。
  - 「环 1」就是 `lint:deps` 放行的那个具名例外组环，与本闭包无关。
  - 「测试未通过 1 个」出在 `packages/skills/skill-host-local`，覆盖率阶段退出 1。日志 `coverage/packages__skills__skill-host-local.vitest.log` 里的错误是 `Failed to resolve entry for package "@omne-harness/skill-contract"` 和 `Cannot find package '@omne-harness/skill-contract/testing'`。这是本工作树里 skill 组成员没有构建产物造成的。该成员在本次只多了一行依赖，来自共享写 `9a1089645`。这个归因是我读日志得出的，没有走失败归因入口，见「未覆盖」。
  
  ## 逐项核对（A 节判据）
  
  **四个端口适配器（`mcp-host-local/src/cordis.ts:143–211`，逐行读过）**
  
  - 每次调用都执行 `ctx.get(<键常量>)`，`ctx` 是 `apply` 收到的那个，见第 147、152、163、193、206 行。没有闭包缓存，也不读调用方的上下文。
  - 缺席时的答复与端口类型逐一对照（`mcp-contract/src/ports.ts:34-39, 47-53, 84-99, 130-135`），全部一致：
    - `AdoptionView.endpoints` 与 `endpoint`：都答 `fail('unknown')`，错误类型都是 `'unknown'`。
    - `UseEligibility.check`：答 `{ kind: 'unknown' }`，是 `EligibilityVerdict` 的一支。
    - `CredentialUse.acquire`：两个重载共用一个实现，取端口在判用途之前，所以两种用途缺席时都答 `fail('unknown')`，属于 `CredentialFailure`。在场时两支都把调用原样转出去。
    - `ProcessLanding.start`：答 `fail('unknown')`。
  - 写者的变异 H1–H3、H2b、H5、H6、H4b 都有用例变红，见 `tmp/w4-mcp-cordis/logs/mutants.json` 与 `mutants2.json`。
  - H4 存活。我同意写者判为等价：按 `mcp/SPEC.md` MC-5 的失败表，落点的 `landing-invalid`、`facility-missing`、`unknown` 三种失败都收成 `landing-unavailable`，`lost` 原因都是 `preparation-failed`，从服务面看不出差别。这是读出来的。
  
  **撤除函数**
  
  - 第 307–312 行只有 `await services.connections.closeAll()`。没有 `try/catch`，也没有 `.catch`。
  - 我读了 Cordis 4.0.4 的 `lib/index.js` 第 1372–1390 行（`_unload`）：它对全部撤除函数做 `Promise.all`，逐个 `await runDisposable`，`catch` 里调 `ctx.logger.error`。`await()` 一直循环到 `inertia` 结束。
  - 探针在副本上确认了这条链，见下文。
  - 撤除时在途调用的答复是 `sent` 带 `unknown`（`abandoned`），与 `mcp-contract/SPEC.md` S8 一致：已发出的请求结局不改。也与传输关闭时已交给线路的请求答 `no-answer`（`abandoned`）一致（SPEC.md:490）。用例在 `tests/cordis-entry.spec.ts:515-527`。
  
  **三个服务子类**
  
  - 逐个核对了 `services.ts` 的接口：
    - `ActionDiscovery` 有 `current`、`refresh`、`peer`。
    - `ActionInvoker` = `ActionCalls`（`invoke`、`continueWithInput`、`cancel`）加 `TaskControl`（`queryTask`、`taskResult`、`provideTaskInput`、`cancelTask`）。
    - `EndpointStatus` 有 `inspect`、`list`。
  - 子类转发了全部 12 个方法，返回值原样交回（`src/cordis.ts:213-271`）。
  - 写者变异 H9–H16、H22–H25 一共 12 处，都有用例变红。
  - 用例 `:346-395` 和 `:397-409` 让每个方法都至少走了一次答复互不相同的路径，例如 `provideTaskInput` 答 `accepted`，`cancelTask` 答 `requested`。
  
  **配置**
  
  - Schema 只查形状。取值范围由现有检查抛 `RangeError`。`probe-config.mjs` 的输出：
    - `clientInfoExtra` 得到 issue「clientInfo has no field title」，加载失败，抛 `ValidationError`。
    - `NaN`、`Infinity`、`-1`、`0`（`maxListingPages`、`instructionsByteLimit`）都由 `createMcp` 抛 `RangeError`。
    - `probeTimeoutMs: 0.5` 由传输工厂抛 `RangeError`。
    - `clientInfo.name: ''` 抛 `RangeError: clientInfo.name must be a non-empty text`。
    - 合法配置装载成功。
  - 数组、`null`、`clientInfo` 为数组都被 Schema 拒绝。
  - `definePlugin`（`packages/assembly/kernel-basis/src/cordis.ts:26`）只是原样透传，不包装 `apply`。
  
  **键**
  
  - 七个 `static readonly provide` 是唯一书写处（`mcp-cordis-contract/src/cordis.ts:22、46、82、104、124、143、158`）。键常量取自它们。
  - 键名字面量在 `src/` 和 `tests/` 里只出现在 JSDoc 注释，以及契约成员 `tests/cordis-entry.spec.ts:21-27` 的期望值表里。期望值表是在钉住公开键名，不算消费者重写键名。
  - 插件和 `mcp-host-local` 的用例只用常量，类型位置写 `typeof <键常量>`（`:260-263`）。
  
  **Service 写法**：`super(ctx, X.provide)`，`implements` 对应接口，没有 `inject`，不导入任何提供者。根入口 `src/index.ts` 是 `export {}`。
  
  ### 探针（副本，不改受跟踪文件）
  
  - 做法：把 head 构建出的 `dist/cordis.js` 复制一份（`cmp` 与 dist 一致；dist 里 `stryNS_` 等标记计数为 0）。只把 `@omne-harness/mcp` 的导入换成一个包装：它先调用真实的 `createMcp`，再把 `connections.closeAll` 包成「先等真实的 `closeAll`，再延迟 300 ms，可选以 `AggregateError` 拒绝」。
  - 原样插件（`cordis-probe`）的输出：
    - `{"label":"closeAll resolves after 300ms","disposeOutcome":"resolved","closeAllSettledBeforeDisposeReturned":true,"after":"undefined","loggedErrors":[]}`
    - `{"label":"closeAll rejects with AggregateError after 300ms","disposeOutcome":"resolved","closeAllSettledBeforeDisposeReturned":true,"after":"undefined","loggedErrors":["defect-1","defect-2"]}`
  - 对照变异（`await` 改成 `void`，`cordis-probe-noawait`）的输出：两次都是 `closeAllSettledBeforeDisposeReturned:false`、`loggedErrors:[]`，进程以未处理的 `AggregateError` 退出 1。
  - 结论：在真实插件代码上，`dispose()` 等撤除函数结算；`AggregateError` 没被吞掉，交给了 `ctx.logger`；`await` 这一个词决定了这两点。闭包规格要评审逐行核对的「插件不捕获」那一半，由此有了工具输出支撑。
  
  ## 发现
  
  ### 阻断
  
  无。
  
  ### 非阻断
  
  **N1：`clientInfo` 内多余字段被拒，没有用例；证据评论却说有。**（检查表第 2、5 问）
  
  - 位置：`packages/mcp/mcp-host-local/tests/cordis-entry.spec.ts:563-582`。拒绝表只有六种：不是对象、缺字段、顶层多余字段 `retries`、上界不是数字、`clientInfo` 缺字段、`clientInfo.name` 不是文本。
  - 证据：
    - 卡 #1119 评论 6687353835 写「配置：……多余字段、缺字段、`clientInfo` 内多余字段、`maxActions: 0`、`probeTimeoutMs: 0` 都加载失败」。
    - `grep -n clientInfo` 在这个测试文件里只命中第 62、560、573–580 行。
    - 写者的 H17、H18 改的是共享的 `fieldsIssue`（`from: if (extra !== undefined) return …`），没有打到第 125 行对 `clientInfo` 的调用点。
  - 行为本身是对的：`probe-config.mjs` 显示 `clientInfoExtra` 被拒。
  - 反例（读出来的，没有执行）：把 `src/cordis.ts:125` 换成只查缺失，例如 `CLIENT_INFO_FIELDS.find(f => !(f in clientInfo))` 后返回同样文字的 issue，现有用例应当全过。原因是「accepts … as a copy」只断言了合法输入，而交回的副本只取 `name` 和 `version`，会悄悄丢掉多余字段。
  - 后果：简报 A 节要求「`clientInfo` 内的多余字段被拒」。这条规则以后被改坏时不会有用例变红，而证据把它记成了已覆盖。
  - 要做的：在拒绝表加一行 `['whose clientInfo has an extra field', { ...CONFIG, clientInfo: { name: 'n', version: '0', title: 't' } }, 'clientInfo has no field title']`（同时得到 validate 用例和加载用例），并改正证据评论里的这一句。
  
  **N2：改动函数中有一个超过 warn 线，交付说明没有交代。**（检查表第 11 问）
  
  - 位置：`packages/mcp/mcp-host-local/src/cordis.ts:109` `mcpPluginConfig.~standard.validate`。
  - 证据：度量输出「变更函数超 alert 0、超 warn 1……`packages/mcp/mcp-host-local/src/cordis.ts:109 mcpPluginConfig.~standard.validate CC 11 覆盖 100% CRAP 11`」（warn 10，alert 12）。证据评论和闭包交回都没有提到这一项。
  - 后果：只是没交代。覆盖 100%，没到 alert，不挡路。
  - 要做的：在交回里写一句处置（接受并说明理由，或拆开），由派发者判断。
  
  **N3：H19–H21 的结果没有落盘，证据只有输入。**（检查表第 2 问）
  
  - 证据：
    - 证据评论写「H19、H20：插件改写 0 值的上界」有用例变红，H21 等价。
    - `tmp/w4-mcp-cordis/mut/mutants3.json` 只有变异的输入（edits）。`tmp/w4-mcp-cordis/logs/` 下有 `mutants.json`、`mutants2.json`、`mutants4.json` 的结果，没有第三批的结果文件。
  - 后果：这三条结论查不到运行输出。从读代码看，H19、H20 会被 `:594-604` 的两条 `RangeError` 用例接住，H21 确实等价，所以结论大概率成立。
  - 要做的：补上第三批的运行输出，或在证据里注明这三条没有结果文件。
  
  ### 范围外待裁决
  
  无。
  
  ### 未覆盖
  
  - 简报没给接受级别。L3 那一组只读了热点：
    - `access` 和 `principalKey` 都是显式参数，原样透传给 `createMcp` 与端口，插件不设默认值（读出来的）。
    - 凭据只出现在夹具里，是替身值 `secret: 's'`（`tests/cordis-entry.spec.ts:238`），不进日志或错误文本。
    - 本闭包没有同一提交两处写入的要求，也没有形式任务。
  - `skill-host-local` 在度量覆盖率阶段的失败没有走失败归因入口。上面「成员没有构建产物」的判断是读日志得出的。
  - 我没有重跑受影响成员的快层、慢层和全套检查，用的是卡上的写者门禁与派发者复跑的证据。差分变异归 D 面。
  - `credentialsOf.acquire` 的 HTTP 用途分支（`:197`）没有用例执行，覆盖 75%。这与证据里「HTTP 上的插件旅程」未覆盖一致。
  - 以下转给其他面：
    - IC-2 要求写明「一条 fiber 提供三个键」的理由，`docs/cordis.md` 的表述、IC 映射和「未覆盖」是否如实，转 B 面。
    - 适配器与子类的形状、Schema 与现有检查的分工，转 C 面。
    - 验收清单逐条判定，转 E 面。
  
  ## 观察（不是发现）
  
  - 第 147、152、163、193、206 行的「取不到就答 `unknown`」重复了五次，每个端口一份。是否收拢是 C 面的形状问题。
  - `fieldsIssue` 用 `field in record` 判断缺字段，原型链上继承来的字段也会算作「在」。插件树数据是序列化的，我给不出实际会出现的输入。
  
  ## 跑过的命令与退出码
  
  - `pnpm run lint:deps`：退出 0，用时约 1 分 57 秒。
  - `pnpm run metrics --coverage --base 8446c4588f0e2400f2e905179ec252473f7b1066`：第一次退出 2（Stryker 沙箱重名）；沙箱清掉后在前台重跑，退出 0，用时 2 分 21 秒。
  - 三个 node 探针脚本：`probe-dispose.mjs`（原样插件退出 0；`noawait` 对照退出 1，符合预期）、`probe-config.mjs`（退出 0）、`probe-names.mjs`（退出 0）。
  - 我自己写的后台等待循环用 `pgrep -f` 时匹配到了它自身，停不下来，我手动结束了它（退出 144）。它没有跑任何检查。
  
  ## 文件
  
  - 被评审的代码：
    - `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/src/cordis.ts`
    - `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-host-local/tests/cordis-entry.spec.ts`
    - `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/packages/mcp/mcp-cordis-contract/src/cordis.ts`
  - 探针：`/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-cordis/tmp/review-a-mcp-cordis/`（`probe-dispose.mjs`、`probe-config.mjs`、`probe-names.mjs`、`plugin/`）
  - 日志：`/tmp/rv-mcp-a/lint-deps.log`、`/tmp/rv-mcp-a/metrics.log`
  - 度量产物：`/data/qiwei/repos/omne-harness-lite/tmp/metrics/f5ead35f4/`（`summary.md`、`metrics.json`、`review.html`、`coverage/packages__skills__skill-host-local.vitest.log`）
</agent-message>