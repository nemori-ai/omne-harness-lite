# request-context-cordis 的内部架构

本页说明本成员怎样组织两个入口与依赖，来兑现 [SPEC](../SPEC.md)。插件、配置、isolate、贡献登记表、事件与撤除的正文归 [Cordis 说明](cordis.md)。缓存与默认策略归 [request-context](../../request-context/docs/architecture.md)。组内八个成员的分解与依赖方向归[组架构](../../docs/architecture.md)。本页不另立公共规则。

本成员没有运行实现。`src/index.ts` 与 `src/cordis.ts` 只有模板标记。下文是 SPEC 固定的结构，文件名由实现确定。

## 模块与依赖

| 入口 | 源文件 | 承载 | 现状 |
| --- | --- | --- | --- |
| `@omne-harness/request-context-cordis` | `src/index.ts` | 一个不依赖 Cordis 的工厂，输入契约端口、策略实现与配置，输出与插件相同的实现（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)） | 模板标记 |
| `@omne-harness/request-context-cordis/cordis` | `src/cordis.ts` | `RequestContextService` 的具体子类、插件与配置 Schema | 模板标记 |

`./cordis` 内部按 Cordis 责任分成五块：

| 模块 | 职责 | 依据 |
| --- | --- | --- |
| 配置与策略选择 | 静态 `Config` 的 Standard Schema，按配置构造两个策略实例，指向不存在的策略即加载失败 | [配置与策略选择](cordis.md#配置与策略选择) |
| 服务子类 | 持有机制实例与贡献登记表，实现登记面三项方法 | 性质 2、6 |
| 贡献登记表 | 按作用域与层保存登记，核重名，按作用域解析遮蔽，维护登记修订 | 性质 2、3 |
| 事件派发 | 贡献变化后派发带修订的事件，捕获监听者失败 | 性质 3 |
| 撤除 | 一个 effect 内完成拒绝新请求、等在途组装、丢弃登记表与缓存 | 性质 5 |

```mermaid
flowchart LR
  Root[根入口：工厂] --> RQI[request-context]
  Root --> RQC[request-context-contract]
  Cordis[./cordis：子类与插件] --> RQD[request-context-cordis-contract]
  Cordis --> RQI
  Cordis --> Lib["@deepseek-ai/cordis"]
  RQD --> RQC
  RQI --> RQC
```

包外依赖：

- `@omne-harness/request-context-contract`：类型与端口。
- `@omne-harness/request-context-cordis-contract`：抽象类、键、事件增补与策略选择的配置形状，只由 `./cordis` 使用。
- `@omne-harness/request-context`：工厂与默认策略。
- `@deepseek-ai/cordis`：只由 `./cordis` 使用。

现在 `package.json` 只列出 `@deepseek-ai/cordis`，其余三项随实现进入。本成员不导入任何协调者或持有者的契约（性质 7）。贡献者与组装请求的调用方依赖服务定义，不依赖本成员的 `./cordis`。提供者选择归应用装配（[IC-5](../../../../docs/architecture/cordis-integration-conventions.md#ic-5)）。

明确缺项：

- SPEC 没有写明根入口的工厂与 request-context 的工厂怎样分工。两者都「输入契约端口与配置，输出实现」。实现进入前要由 SPEC 拥有者确定：根入口是直接重导出机制工厂，还是在它之外加本成员自己的配置校验与策略选择。
- 服务定义上没有组装入口，经 Cordis 的调用方怎样用到机制实例没有定义，见 [Cordis 说明的插件与服务](cordis.md#插件与服务)。

## 关键机制与理由

### 撤除放在一个 effect 里

撤除有严格次序：先拒绝新的登记与组装，再等在途组装结算，最后丢弃登记表与缓存。Cordis 卸载 fiber 时，不同 effect 的撤除函数并发运行（[effect-disposal-concurrent-not-ordered](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)）。所以三步必须写在一个 effect 里按顺序 `await`，不能各注册一个 effect。

代价：撤除函数里的一步抛出时，Cordis 只记日志，不上抛。撤除函数要自己捕获每一步，并保证后续步骤仍然执行。

### 作用域每次调用时读取

登记方法每次都从调用方 fiber 读 intercept 配置，不在插件装载时缓存。理由：服务实例是共享的，调用方各不相同，作用域属于调用方而不属于服务。取不到配置就拒绝，不给默认层，因为默认层会让未声明作用域的贡献者覆盖到错误的层。

### 策略选择失败即加载失败

配置指向不存在的策略，或策略参数不合 Schema，插件加载失败，fiber 进入 `FAILED`（性质 4）。理由：静默回退到默认策略会让装配者以为自己选的策略在用。错误不能静默变成成功。代价是一个配置错误会使整个服务不可用，装配者必须修正配置才能继续。

### 渲染结果随登记一起撤除

撤除函数移除登记的同时丢弃这条贡献的渲染结果（性质 2）。理由：渲染结果只是登记的派生物，登记不在了，留下的渲染结果会被后续组装误用。两件事写在同一个撤除函数里，不依赖两个 effect 的释放次序。

### 不为每次请求开运行对象

本成员不为每次请求开 fiber，不用 `inject` 表达输入，不发第二种事件（性质 6）。作用域与租户随操作参数进入。理由：作用域与请求的数量随使用增长。为它们建 fiber 或 isolate，会让每次增删伴随 Cordis 的装卸，而 isolate 也不隔离数据（[isolate-hides-instances-not-data](../../../../.meta_harness/design/basis/cordis/isolate-hides-instances-not-data.md)、[IC-17](../../../../docs/architecture/cordis-integration-conventions.md#ic-17)）。

## SOLID 与扩展边界

| 原则 | 本成员的具体选择 | 必须防止的反例 |
| --- | --- | --- |
| 单一职责 | 本成员只承担 Cordis 责任：装载、配置与策略选择、isolate、登记效应、事件与撤除。缓存与默认策略都在 request-context | 在子类里重写缓存键、按组失效或默认策略的数值 |
| 开闭 | 新策略实现只加到可选项与 Schema，不改登记表或撤除。新贡献者只登记，本成员不改 | 为某类贡献者或某个上层领域加特例分支或第二个服务键 |
| 里氏替换 | 子类遵守抽象类的全部承诺：键只来自抽象类，登记落在调用方 fiber，事件只做失效提示 | 把登记挂在服务自己的 fiber 上，或在事件里携带段文本 |
| 接口隔离 | 贡献者与组装请求的调用方只看到服务定义，不导入本成员 | 让依赖方导入 `./cordis` 的子类来调用登记面 |
| 依赖倒置 | 本成员依赖契约、服务定义与机制工厂。租户、作用域与资格随参数进入 | 从 `ctx`、isolate 标签或插件实例推断租户或资格 |

## 验证与维护

| 保证 | 现在的验证 | 后续义务 |
| --- | --- | --- |
| 根入口没有 Cordis | [public-entry.spec.ts](../tests/public-entry.spec.ts) 断言根入口没有导出 | 工厂进入后，核对导出集合并确认不导入 Cordis |
| `./cordis` 只有本成员的插件 | [cordis-entry.spec.ts](../tests/cordis-entry.spec.ts) 断言草稿入口没有导出 | 实现进入后，核对导出集合 |
| SPEC 的七项验证义务 | 没有 | 见 [Cordis 说明的验证义务](cordis.md#验证义务) |

维护规则：

1. 服务定义改变时，同步子类、[Cordis 说明](cordis.md)与测试。
2. request-context 的工厂签名、默认策略或配置改变时，同步配置 Schema 与[公开接口页](public-api.md)。
3. Cordis 升版时，先重跑服务定义成员与 Runtime Context 服务定义列出的 basis probe。
