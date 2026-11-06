# @omne-harness/telemetry-contract 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

本包拥有工程遥测的纯契约：作用域绑定、声明式定义、字段与绑定的校验、carrier 编解码、准入结果、关闭报告的形状，以及有界捕获替身。本文件用「遥测」指工程遥测。

状态：候选，第一版。设计依据是 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) 的「[公共契约形状](../../../docs/rfcs/RFC-0013-engineering-telemetry.md#公共契约形状)」与「[决定范围](../../../docs/rfcs/RFC-0013-engineering-telemetry.md#决定范围)」。RFC-0013 还没有接受，所以本文件的全部条款都是候选范围。名词 `telemetry`（D01）已由负责人采用，见[决定记录](https://github.com/nemori-ai/omne-harness-lite/issues/1140#issuecomment-6663579066)。「纯契约、Cordis 定义与 Node 提供者分成三个成员」（D02）与「不设全局目录」（D08）暂按建议推进，等裁定者确认。

预留：`Carrier`（[TC-6](#tc-6-carrier-只含因果身份)、[TC-11](#tc-11-carrier-格式)）、`defineMetric` 与 `Emitter.record`（[TC-8](#tc-8-定义只校验本地输入)、[TC-15](#tc-15-端口与关闭报告)）有形状、有校验、有测试，第一版没有消费者。它们为推迟的 OTel 链路与指标预留，第一版不扩展也不删除。

本包不拥有下列事项：

- Cordis 服务定义 `telemetry`（`TelemetryService`、`telemetryKey`）。它归 `telemetry-cordis-contract`。本包的安装闭包里没有 Cordis。
- 输出格式、队列、采样实现、预算、SDK 与后端。它们归 Node 提供者 `telemetry-node`。
- 各领域的事件目录和投影。它们归各领域实现成员。
- 主体签发、授权与租户核验。它们归 identity 与 authorization。
- `health()`。它随 OTel 推迟，见 RFC-0013「后续」。第一版的计数只进 `CloseReport`。

## 结果与不变量

下面 TC-1 到 TC-9 是本包的九条契约条款。TC-10 到 TC-15 补全格式、上限、字符集与端口的细则。

### TC-1 端口操作同步、有界、不抛错

`Emitter.event`、`Emitter.record`、`Emitter.startSegment`、`Emitter.bind`、`Segment.event`、`Segment.end` 和 `TelemetryPort.bind` 必须同步返回，不等待网络，不抛错。每次调用的工作量以本文件的结构上限为界。调用方不需要对 `Admission` 分支，但可以读它。输入在读取时抛错（例如代理对象），实现答 `dropped(invalid)`。

`TelemetryPort.bind` 收到无效绑定时不抛错。它返回一个 emitter，这个 emitter 对每次记录都答 `dropped(invalid)`。

### TC-2 运行时校验实际值

TypeScript 类型不是安全边界。提供者必须在运行时用 `validateFields` 与 `validateBinding` 判定每条记录，规则只在这两个函数里写一份。下列输入一律答 `dropped(invalid)` 并计数：

- 未声明的键，包括 symbol 键。
- 缺少的键，可选字段除外。
- 非有限数，超出 `min`～`max` 的数。
- 不在枚举里的值。
- 超长或字符集不符的引用。
- 任何对象值，包括 `Error`、数组、普通对象和带 `toJSON` 的对象。
- 带 getter 或 setter 的字段。校验不调用 getter。

metric 的值必须是有限数。counter 的值必须不小于 0。

字段规则可以带 `optional: true`。四种规则与 metric 标签都可以带。可选字段缺席时合法；在场时按同一规则校验，不放宽任何检查。键在场而值为 `undefined` 不算缺席，按值校验。没有 `optional` 的字段仍必须在场。类型层面，`Fields<S>` 把可选字段的键变成可省略。

### TC-3 没有自由文本入口

字段规则只有四种：`enum`、`boolean`、`number`、`ref`。字符串只能是枚举值或受限字符集的引用。遥测不识别秘密。保护靠字段规则里根本没有自由文本。错误先由本域转成有限的错误码。原始 `message`、`cause`、`stack` 不进入普通事件。

### TC-4 作用域只表达事实属于谁

`Binding.scope` 表达记录的事实属于谁：某个租户的工作，或者服务进程自身。它不表达调用方是否知道租户，也不授予任何权限（IC-18）。

- 记录某个租户的工作时，scope 必须是该租户。调用方拿不到租户时，不能发这条记录。
- 记录服务进程自身的事实时，scope 是 `system`，`component` 写明部件，记录里不带任何租户标识。
- 不能把属于某租户工作的事实改标为 `system`。

scope 必须由 `@omne-harness/legal-identity` 铸造。`validateBinding` 用 `actingScopeCodec.encode(scope)` 判定：结果是 failure，scope 就是未铸造的值，绑定无效。形状相同的普通对象和铸造值的拷贝都无效。提供者输出 scope 时，使用同一个 `encode` 给出的文本形式。遥测不核验主体，也不从 scope 推断权限。

### TC-5 关联值有数量与字节上限

`links` 与 `adopted` 的元素数、每个 `OwnedRef` 的字节数都有上限，上限见 [TC-12](#tc-12-结构上限)。超出上限的绑定无效。`OwnedRef` 只有 `owner` 与 `ref` 两个成员，多出的成员使它无效。

### TC-6 Carrier 只含因果身份

`Carrier` 是预留形状，第一版没有消费者。它只含版本号、trace 身份、span 身份和标志位。它不带作用域、主体或凭据。跨进程的接收方重新 `bind` 自己的作用域，再把收到的 `Carrier` 放进 `links`。接收方不把入站 trace 与本地租户拼成一条链。格式见 [TC-11](#tc-11-carrier-格式)。

### TC-7 提供者保有独立计数

提供者保有下列计数：准入、采样、校验拒绝、政策丢弃、容量丢弃、过期段、输出错误、未决发送和当前输出代的状态。这些计数不经过同一条输出管线。第一版只在 `CloseReport` 与应用的关闭报告里暴露它们。

### TC-8 定义只校验本地输入

`defineEvent`、`defineMetric`、`defineSegment` 只校验本次输入，返回冻结的拷贝。之后修改输入对象不影响定义。非法定义抛 `TypeError`。本包没有全局注册表：同名的两次定义得到两个独立的定义（D08）。下列定义非法：

- `owner` 或 `name` 为空、超长，或含空白与控制字符。
- `version` 不是正整数。
- 字段名不是合法记号，或字段数超过上限。
- 枚举为空、重复、超长，或值的个数超过上限。
- `number` 的边界不是有限数，或下界大于上界。
- `ref` 的 `maxBytes` 不是 1 到 `refMaxBytes` 之间的整数。
- 规则的 `optional` 在场而不是 `true`。冻结的拷贝保留 `optional: true`。
- metric 的标签规则不是 `enum` 或 `boolean`。标签的取值个数必须有限，所以 `number` 与 `ref` 不能作标签。
- histogram 没有边界、边界不严格递增、含非有限数，或个数超过上限。

### TC-9 捕获替身有界

`./testing` 的 `createCapturingTelemetry` 按调用顺序捕获已准入的记录，每条带绑定快照、定义与字段。它满足下列规则：

- 它用 `validateBinding` 与 `validateFields` 判定准入。无效记录答 `dropped(invalid)`，不进入捕获列表。
- 捕获数达到 `capacity`（默认 1024）后，新记录答 `dropped(capacity)`。
- `dropped()` 计数每一条被丢弃的记录，不区分原因。
- `clear()` 清空捕获列表并把丢弃计数归零。
- 它不导入 Cordis，任何输入都不使它抛错。

### TC-10 校验是契约的纯函数

`validateFields(definition, fields)` 与 `validateBinding(binding)` 是纯函数，不抛错。它们返回 `ok`，或者带闭合原因的 `invalid`。输入在读取时抛错，原因是 `malformed`。不经 `define*` 构造、规则种类未知的定义，原因是 `definition`。提供者与捕获替身共用这两个函数。

### TC-11 Carrier 格式

carrier 文本是 W3C traceparent 的子集：`00-<trace>-<span>-<flags>`。

- `trace` 是 32 位小写十六进制数，`span` 是 16 位小写十六进制数，`flags` 是 2 位小写十六进制数。
- `trace` 与 `span` 不能全为零。
- 版本只能是 `00`。段数只能是四段。文本前后不能有空白。
- `flags` 的最低位是采样标志。

`decodeCarrier` 对不符合格式的输入答 `invalid`，不抛错。`encodeCarrier` 对不符合格式的身份抛 `TypeError`。`encodeCarrier` 写出的 flags 只有 `00` 与 `01`。编码后再解码，得到相同的身份与采样标志。segment 的 carrier 由提供者生成，`Segment.carrier` 直接给出。

### TC-12 结构上限

`TELEMETRY_LIMITS` 是契约的结构上限：

| 上限                     | 初值 |
| ------------------------ | ---- |
| `componentMaxLength`     | 64   |
| `nameMaxLength`          | 128  |
| `ownerMaxLength`         | 128  |
| `refMaxBytes`            | 256  |
| `maxLinks`               | 8    |
| `maxAdopted`             | 8    |
| `maxFields`              | 32   |
| `maxEnumValues`          | 64   |
| `enumValueMaxLength`     | 64   |
| `maxHistogramBoundaries` | 32   |

这些数是结构上限的初值，不是运行预算。运行预算（速率、队列长度、批大小、期限）属于提供者配置。字段规则 `ref` 的 `maxBytes` 不能超过 `refMaxBytes`。

### TC-13 引用与名字的字符集

`OwnedRef.ref`、`ref` 字段、`owner`、`name`、`component`、字段名与枚举值只允许可打印 ASCII（`0x21`～`0x7E`）。它们不含空白和控制字符，不能为空。长度按 UTF-8 字节计。因为字符集只含 ASCII，字节数等于字符数。所以 `Bearer x` 这类带空格的文本无效。

### TC-14 段的开始、事件与结束

- `Emitter.startSegment` 返回 `Segment`，或者返回 `{ kind: 'dropped', reason }`。用 `isSegment` 区分两者。
- `Segment.end` 是幂等的。第一次有效调用结束这个段，之后的调用返回第一次的结果，不再产生记录。`outcome` 缺省为 `unknown`。`outcome` 不是 `ok`、`failure`、`unknown` 之一时，答 `dropped(invalid)`，段不结束。
- `end` 的结果只说明这个测量段的结果，不表示业务终态。
- 段结束后，`Segment.event` 答 `dropped(closed)`。
- `startSegment` 的 `links` 遵守 TC-5 与 TC-11。

### TC-15 端口与关闭报告

第一版的 `TelemetryPort` 只有 `bind(binding)`，不公开 `health()`。`Emitter.record` 是预留的指标入口，第一版没有消费者。`Emitter.bind(patch)` 派生一个新的 emitter，原 emitter 不变。派生只改 `work`、`attempt`、`call`、`adopted`、`links`。补丁里的其他成员不生效，补丁中值为 `undefined` 的成员也不生效。派生出的绑定仍按 TC-2 校验。

`CloseReport` 报告提供者关闭时的事实。`dropped` 是总数，`droppedBy` 按 `DropReason` 分项。下面四个确认边界互不相同，报告不得混同：

1. `forceFlush` 返回。
2. 本地写函数的回调。
3. Collector 协议的确认。
4. 后端可以查询到这条记录。

`flush` 与 `boundary` 只说明提供者实际看到的最强边界，不声称更后面的边界。`flush` 是 `completed-to-boundary` 时，`boundary` 写明到达的边界。这一语义承接已删除的 `@omne-harness/diagnostic` 成员（D03）关闭报告的三段：lastRecord（最后一条记录是否已交出）、flush（排空的计数或期限）、transport（传输关闭只能是未确认或期限）。

## 所有权、失败与生命周期

- 绑定由调用方给出。提供者在 `bind` 时取得绑定的快照，之后调用方修改原对象，不影响已有的 emitter 与记录。快照保留 scope 的原对象身份，因为 legal-identity 只认铸造的对象。
- emitter 是不可变的值。它不登记到任何目录，不持有需要释放的资源。行撤除时，它随持有者一起消失（IC-13）。
- `admitted` 只表示本地准入，不是送达回执。准入之后的输出失败归提供者计数（TC-7），不改变已经返回的 `Admission`。
- 定义是代码对象，不进入插件树的配置（IC-16）。
- span 配对、准入计数与段的幂等结束只在同一进程内成立。跨进程的因果关系只靠 `Carrier` 与接收方重新绑定兑现（IC-19）。
- 本包不创建或关闭任何资源。服务定义归 `telemetry-cordis-contract`；提供者的装载、关闭与关闭报告归 `telemetry-node`。

## 组合与验证

本包消费 `@omne-harness/legal-identity` 的 `ActingScope` 与 `actingScopeCodec`（workspace 版本）。铸造判定只用 `actingScopeCodec.encode`，本包不复制铸造登记。本包不消费 Cordis。

| 条款                        | 持续验证                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ |
| TC-1、TC-9                  | `tests/capturing.spec.ts`：畸形输入、代理对象、容量与清空                      |
| TC-2、TC-3、TC-10、TC-13    | `tests/fields.spec.ts`、`tests/binding.spec.ts`，每条都有绕过类型的输入；可选字段的缺席、在场与类型层省略见 `tests/fields.spec.ts` 与 `tests/types.spec-d.ts` |
| TC-4                        | `tests/binding.spec.ts`：未铸造的 scope 与铸造值的拷贝都无效                   |
| TC-5、TC-12                 | `tests/binding.spec.ts`、`tests/definitions.spec.ts`：上限处有效，超出一个无效 |
| TC-6、TC-11                 | `tests/carrier.spec.ts`                                                        |
| TC-8                        | `tests/definitions.spec.ts`、`tests/fields.spec.ts`（`optional` 标记）；类型层见 `tests/types.spec-d.ts` |
| TC-14、TC-15                | `tests/capturing.spec.ts`                                                      |
| 安装闭包里没有 Cordis（IC-4） | `tests/public-entry.spec.ts` 遍历构建产物的导入，读 `package.json` 的依赖并沿 workspace 依赖找 Cordis；`pnpm run lint:deps` |

未覆盖：TC-7 的计数与 `CloseReport` 的内容由提供者兑现，本包只给形状，验证归 `telemetry-node`。真实提供者对 TC-1、TC-2 的兑现也归 `telemetry-node` 的测试。`TelemetryService` 在真实 `Context` 上的提供、注入与撤除归 `telemetry-cordis-contract` 的测试。
