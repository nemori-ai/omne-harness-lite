# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。组级边界见[组架构](../../docs/architecture.md#凭据的现有装配边界)。

## 模块与依赖

| 模块 | 持有什么 | 依赖 |
| --- | --- | --- |
| [credential-port.ts](../src/credential-port.ts) | `createSecretCredentialPort`：按供应商的凭据项与绑定键读秘密保管，用契约的两条规则选层、判读并取秘密 | model-contract、settings、operation-result |
| [index.ts](../src/index.ts) | 根入口：凭据端口、本地装配与发送资源 | credential-port、assembly、send-resources |
| [cordis.ts](../src/cordis.ts) | Cordis 绑定入口：`serveModelCredential` 与宿主插件 | model-cordis-contract、Cordis、plugins |
| [send-resources.ts](../src/send-resources.ts) | 生产发送资源：每次 `acquire` 一个 pi 传输及其私有凭据槽、物化传输归属、配置探针、`SendResourceDefect` | model（`SendResources` 类型）、model-contract、pi-ai-transport |
| [assembly.ts](../src/assembly.ts) | 本地 Model 装配：创建并关闭网络资源，组合发送资源与 model 的发送边界，在同一组家族与 `ModelCommands` 上建计量准备资源；`close` 开始后两者都拒绝新的资源 | model（`createModelSendBoundary`、`createModelPreparationResources`）、model-contract、pi-ai-transport、send-resources |
| [plugins/config.ts](../src/plugins/config.ts) | 两个宿主插件的配置：四项宿主上限与 `maxCitedCalls`，缺失或越界即加载失败，不给数值默认值 | fields |
| [plugins/instances.ts](../src/plugins/instances.ts)、[plugins/converters.ts](../src/plugins/converters.ts) | 两个目录插件：继承契约包的目录服务，把注入的权威交给构造函数 | model-cordis-contract、Cordis |
| [plugins/host.ts](../src/plugins/host.ts) | 宿主驱动：未绑定宿主、`bind`、有界唤醒与协程、路由发布与撤除、按调用核对观察资格、一个外层 effect 拥有的有序关闭，以及只发布 `modelInstanceHost` 的贡献 | model（`ModelRuntimeProvider` 类型）、model-contract、model-cordis-contract、Cordis、config |
| [plugins/preparation.ts](../src/plugins/preparation.ts) | 请求准备插件：静态注入 `modelCommands`，经 `createModelPreparationResources` 取租约，按家族规则形成固定请求并交还租约；同一份资源交给装配作计量租约来源 | model（`createModelPreparationResources`）、model-contract、model-cordis-contract、Cordis、config |

credential-port.ts 只依赖 settings 的秘密保管端口，不导入 settings-local：保管库文件与磁盘记录归保管提供者，由装配注入。cordis.ts 不导入 credential-port.ts，服务只转发注入给它的端口。根入口不导入 Cordis 或 cordis.ts。assembly.ts 到 send-resources.ts，两者都不导入 credential-port.ts 或任何 `testing` 模块：装配只经 `CredentialPort` 取得秘密。本包依赖 model 取得发送边界；model 不依赖本包。本包依赖 pi-ai-transport 取得传输与网络资源；家族包只是测试依赖，由调用方组合后注入。

## 关键机制与理由

**规则归契约，端口只读事实。** 选哪一层、一层是否可用，是 model-contract 的 `selectCredentialLayer` 与 `readCredentialLayer`。端口只给它们每一项的状态，再在可用时取秘密。这样第二个供应商只是 `providers` 里多一行：凭据项、发行是否持有与绑定键，不改端口。

**只读，不写。** 端口只拿秘密保管的读面与使用面。写入属于设置域的设置操作与部署的 `setup`，端口没有管理面，也就不能改秘密。

**每次读而不是缓存。** 其他进程造成的轮换、撤销与损坏要在下一次调用时可见，因此 `layerOf`、`resolve` 每次经保管读。读面与使用面之间绑定变了时，端口答 `unavailable`，不把不一致当成功。

**服务以闭包持有端口。** Cordis 把服务实例的代理交给消费者，`#private` 字段经代理失败，实例属性可被任何能读 `ctx.modelCredential` 的插件取得，所以端口只放在两个方法的闭包里。

**每次发送一个私有凭据槽。** pi 传输的凭据槽在构造时固定，一个传输的所有发送共用它。发送资源因此为每次 `acquire` 建一个传输，槽只属于这个资源。并发发送没有共享的槽，不需要锁，也不会读到别人的值。pi 传输在 `start` 的同步调用内读槽，所以填槽、`start`、清槽放在同一个同步 `try/finally` 里就完整；即使以后传输推迟读槽，私有槽也只会读到空值而拒绝发送，不会串号。代价是每次发送多一次配置检查。

**物化传输的归属核对。** 资源包住 `prepare` 交出的已准备传输，记下它物化出的每个对象。`startWithCredential` 只接受本资源记下的对象，异物是程序缺陷，抛出带原因的 `SendResourceDefect`，不填槽。

**装配期的配置探针。** 发送资源在构造时用空槽建一个传输检查配置，配置错误在装配时抛出，而不是在第一次发送时变成一个不可用结果。探针不发送，构造时即开始关闭，发送资源的 `close` 等待其结果。

**装配只组合。** 装配不持有业务状态，不另造协调语义。账目经 model 运行时的接收路径到达注入的 `ModelCommands`；补全、去重与修订替换归 `ModelCommands`。准备资源的绑定来源就是发送用的 `families`（`PiFamilyContributions` 在结构上满足 model 的 `PreparationBindingSource`），调用事实经同一个 `commands` 读取，所以计量与发送看到同一组家族记录和同一份调用事实。路由、代理、限额与 `maxCitedCalls` 都来自配置，余量来自家族配置。

**绑定后才发布，贡献最后撤。** 宿主插件在 `Service.init` 里先建未绑定宿主，`await host.bind(...)` 成功后，才创建发布 `modelInstanceHost` 的子插件。子插件与有序关闭放在同一个外层 effect 的撤除列表里：Cordis 按逆序逐个撤除一个 effect 的部分，所以关闭（quiesce → 停派发并等待驱动交还）先跑，发布服务的贡献最后撤。分成两个顶层 effect 会被并发撤除。宿主状态全在闭包里，交给消费者的实例只有四个操作，`bind` 不出现。

**观察资格来自装配。** 设计给宿主的注入只有 `modelCommands`、`modelClock`、`modelHostAuthority`，没有提供「当前 observe 资格」的来源。路由命中不当作授权，所以 `directory.connect` 先问装配给的 `qualifyObservation`，失败（含 `denied`）原样返回。

**一个命令源。** 准备插件与宿主注入同一个 `modelCommands` 服务，准备资源只读它的 `dispatches`，所以延续计量读得到同一份调用事实。插件卸载后租约来源拒绝新租约，卸载前取得的租约持有自己的绑定直到释放。

**一个关闭结束两部分。**装配的 `close` 是发送资源与准备资源共同的终点。`close` 开始后，两者都拒绝新的资源。发送资源返回自己的 `unavailable`（`pi-send-resources`，`send-resources-closed`）；准备资源返回指向装配的 `unavailable`（`model-host-local`，`assembly-closed`）。准备资源没有在途交换要等待，所以关闭只拒绝新的租约。关闭前取得的租约持有自己的绑定，由取得它的调用方释放。家族计量器是纯函数，关闭后仍可计量。

## 验证与维护

保证与测试的对应见 [SPEC](../SPEC.md#组合与验证)。model-contract 的凭据端口或选层规则变化时，同步 [credential-port.ts](../src/credential-port.ts) 与测试。服务定义变化时同步 [cordis.ts](../src/cordis.ts)。model 的 `SendResources` 端口或 pi-ai-transport 的传输配置变化时，同步 [send-resources.ts](../src/send-resources.ts)、[assembly.ts](../src/assembly.ts) 与对应测试。宿主插件扩展或运行时门面接入时，同步 [plugins/host.ts](../src/plugins/host.ts) 的扩展点与 [plugins-host.spec.ts](../tests/plugins-host.spec.ts)。
