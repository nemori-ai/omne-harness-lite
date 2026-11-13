# @omne-harness/session-observation

[English](README.md)

会话观察：登录的人看一个会话，现在正在发生什么。模板变体：`cordis-module`。

## 职责与状态

本包回答「这个会话现在怎样」。它读会话日志和模型的公共流，给出一条帧序列：这一轮开始了没有、日志有没有新的已提交内容、正在生成的回复是什么。已提交的内容本身由读历史给，历史是权威，观察只是进行中的投影。

本包是会话组里认识会话与模型两份契约的集成成员。它不写任何东西，不做授权判断，不取消模型调用。允不允许由会话与模型两头的拥有者回答，本包只转交拒绝。

消费者：服务端应用的 `session-observation` 行发布服务 `sessionObservation`；以后接入组的插件把它接成 `observe-session` 的帧来源。

状态：`draft`，[SPEC](SPEC.md) 是候选规格。

- 已实现：领域面 `open`；定位（读日志，得到修订号、当前这一轮、最近一次主调用）；向模型取当前的流、流的订阅，以及 `snapshot`、`delta`、`gap` 帧；刷新的预算；提交通知唤醒；中止时收场；`./cordis` 里的 Cordis 绑定。
- 现行限制：模型三的文件还在接入组，待搬；调用登记比模型调用晚出现的那段时间里，看不到这次调用的流。完整列表见 SPEC 的[现行限制](SPEC.md#现行限制)。
- 未验证：形式模型三还在接入组，没有在本包重跑；提交通知跨行送达只在本机一棵树上测过。

## 使用

调用方持有观察者自己的主体、租户和会话，以及一个 `AbortSignal`：

```ts
const opened = await sessionObservation.open({ access, signal })
if (opened.kind === 'opened') {
  for await (const frame of opened.frames) {
    // frame.kind 是 'state'、'refreshing' 等
  }
}
```

- `open` 有三种结果：`opened`、`denied`、`unavailable`。被拒、会话不存在、标识不合法都答 `denied`，彼此不可区分。
- 帧序列走完时，原因是生成器的返回值；被中止时返回 `undefined`。
- 不再需要这次观察时，中止 `signal`，或对生成器调 `return`。本包收掉自己的订阅与计时。

独立使用：从根入口 `@omne-harness/session-observation` 取 `createSessionObservation`，自己给出 `SessionObservationPorts`。根入口不导入 Cordis。

Cordis 集成：从 `@omne-harness/session-observation/cordis` 装载 `createSessionObservationPlugin({ historyKinds })`，它发布服务 `sessionObservation`。细节见 [docs/cordis.md](docs/cordis.md)。

## 契约

- 公开类型与导出：[src/index.ts](src/index.ts)、[src/cordis.ts](src/cordis.ts)；导航见 [docs/public-api.md](docs/public-api.md)。
- 非类型行为的唯一正文：[SPEC.md](SPEC.md)，包含领域面、五个对象、全化表与用例的对照、定位的读法、刷新的预算、通知、中止与现行限制。
- 错误、生命周期与资源责任：见 SPEC 的[所有权、失败与生命周期](SPEC.md#所有权失败与生命周期)。

## 设计

五个对象各有一个变化的理由：一次观察（帧的出口）、定位（读日志）、刷新的预算（策略）、帧的翻译（对外表示）、流的订阅（对一个目标的订阅，换目标后丢掉迟到的旧帧）。业务逻辑只对着端口 `SessionObservationPorts`；Cordis 的订阅与过滤在 `./cordis` 的薄适配里。完整设计见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md)、[docs/object-model.md](docs/object-model.md)。

## 配置与运行

配置由装配传入。插件工厂的输入只有 `historyKinds`；其余是行配置 `SessionObservationConfig`，经插件 `apply` 的第二个参数给出，没给的取成员默认初值：

- `historyKinds`（插件工厂的输入，必填）：读历史给出的条目种类。它和三个固定种类一起，决定哪些提交通知算有新内容。
- `policy`（行配置，可选）：刷新策略 `ObservationRefreshPolicy` 的部分字段，逐字段覆盖默认值。默认初值是 `interval` 1000 ms、`backoff` 1.5、`maxAttempts` 60、`deadline` 30 分钟、`currentTimeout` 5000 ms。`interval` 低于 100 ms 时钳到 100 ms 并记诊断。
- `locatePages`（行配置，可选）：一次反向读最多翻几页，默认 4。

运行时依赖会话服务（以 `reader` 调用方类注入）、事件 `session-cordis-contract/committed`，以及模型的两个公共流读取面。调用方负责传入观察者自己的主体，并在不再需要时中止；本包负责收掉自己的读取、订阅与计时。

## 验证

在成员目录运行：

```sh
pnpm exec vitest run --mode fast
```

用例对着端口的假实现，时间用假的 `wait`，覆盖领域面、定位轴、流轴、不丢唤醒、不发旧帧、中止、刷新的预算和两个入口的导出。形式模型三在 [packages/access/server-entry/verification/models](../../access/server-entry/verification/models/SessionObservation.tla)，暂留原地，待搬。

未覆盖：形式模型三还没有在本包重跑；代码与模型的对应只靠契约测试和精化对照。SPEC 的「组合与验证」列出不能声称的事。

## 维护

- 改端口、策略或帧的形状：同步 `src/` 的公开定义、SPEC、`docs/public-api.md`、`tests/`，以及消费者（服务端应用的 `session-observation` 行与演示脚本）。
- 改读日志或调用登记的读法：会话契约的 `readCallRegistration`、`readRunBoundary` 与「一轮在进行」的判法是源，先改它的 SPEC。
- 改流的订阅或帧的翻译：同步 SPEC 的结果表与流轴表、`tests/stream.spec.ts` 的用例名前缀，以及形式模型三（待搬到 `verification/models/`）。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态与本图
index.md                  包内阅读路径
SPEC.md                   公开类型以外的行为规格
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、状态与资源归属、机制
├── flows.md              关键业务流与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费者使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、校验与实现
tests/                    持续测试；fixtures/ 放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 放其输入
```

每个目录有 README.md 说明职责，有 index.md 做导航。阅读路径见 [index.md](index.md)。专题可以升级为同名目录，目录内有 README.md 与 index.md。专题移动时同步本图。
