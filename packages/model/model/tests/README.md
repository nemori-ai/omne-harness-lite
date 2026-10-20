# Model 成员测试

本目录维护单元和契约测试。[public-entry.spec.ts](public-entry.spec.ts) 使用真实 workspace 包入口，检查根入口导出清单，并核对源码不到达保管实现、Cordis 或 model-host-local。[judgment.spec.ts](judgment.spec.ts) 用内存状态快照直接覆盖存在性与解析的判定：五种结果、租户隔离、官方默认凭据的取舍与关闭。public-entry.spec.ts 还断言 `./cordis` 与 `./execute` 子路径不可解析、清单精确导出根与独立 testing 入口且不声明 Cordis、proper-lockfile 与 model-cordis-contract。判定对未经铸造的查询租户一律返回拒绝，快照里有未经铸造的绑定租户时不给工厂秘密，由 judgment.spec.ts 覆盖。保管、持久化、文件故障与 Cordis 插件的测试在 [model-host-local](../../model-host-local/tests/index.md)。

运行命令为 `pnpm --filter @omne-harness/model test`。内存行为测试经公开 testing 入口覆盖 22 个 Commands、未知写、流归约、读/ACK/清理和五端口。runtime-testing 检查真实构造壳的零调用及明确 unavailable。这些是本地模拟，不覆盖耐久或生产托管执行。运行实现完成后须加入实际提供者与存储交接的验证，并注明替身和故障范围。

[vitest.config.ts](../vitest.config.ts) 仅把 model-contract 的根入口与 testing 子路径映射到其公开源码入口，避免行为测试读取并发 build 正在重建的 dist。它不匹配私有子路径，也不改变 Node 的包解析。public-entry 的 Node resolver 与独立安装场景继续验证真实 exports 和制品。

固定输入归 [fixtures](fixtures/index.md)。持续验证义务见 [verification](../../model-contract/verification/index.md)，目录导航见 [index](index.md)。

## 独立执行

[execute.spec.ts](execute.spec.ts) 经真实 model 根入口连接公开 createScriptedTransport，检查单次发送、重复迭代、并发推进、首供应商、准备拒绝和物化回执。[execute-lifecycle.spec.ts](execute-lifecycle.spec.ts) 使用本成员受控传输，覆盖准备等待取消、启动后确认与失联、消费者早退、原生 return 排队，以及终局交付前的清理次序和失败报告。[execute.spec-d.ts](execute.spec-d.ts) 检查根函数精确签名。

[execute-transport.spec.ts](execute-transport.spec.ts) 直接对 provider 的 transport 运行共同符合性，逐项要求六个 transport ID 为 pass。该套件不调用 executeModel，不能单独证明执行组合。上述执行测试才覆盖真实 executeModel 的交接。受控传输只提供事实、等待和故障，不替执行函数完成取消分类、回执校验或清理。这些证据没有真实 HTTP、厂商模型、耐久后端或托管运行。

## 安装闭包

`pnpm --filter @omne-harness/model run install-closure` 调用 model-contract 的安装闭包设施，策略为 [fixtures/install-policy.json](fixtures/install-policy.json)，场景为 [install/scenario.mjs](install/scenario.mjs)。场景导入 `@omne-harness/model`、`@omne-harness/model-contract`、契约 testing 入口与 `@omne-harness/legal-identity`：以注入的端口调用 `deliver`，覆盖已发送、拒绝、缺席三条路径，并对一个快照做铸造租户的判定。另用已安装根入口的 executeModel 连接公开脚本传输，验证一次发送与两级关闭。给出 `--scenario` 时设施把闭包里的每个工作区成员声明为消费工程的直接依赖，所以场景导入得到 model-contract 与 legal-identity。运行带 `--out <报告.json>` 写出报告，退出码 0 表示 `forbidden` 为空且全部检查（含 `scenario-run`）通过。报告写在任务的 `tmp/`，不入库；它只证明 model 自己的安装闭包与场景，不证明 model-host-local 的闭包，另覆盖已安装 testing 入口及真实构造壳，不证明托管业务执行或生产宿主。

## 内存行为资源

- [memory-admission.spec.ts](memory-admission.spec.ts) 检查显式/采用/请求值的参数边界、工具关联、typed 拒绝及未知注入不被非法请求消费；请求各序列与三个 stop 承载的单空位、中间空位、合法密集值及绑定冲突。
- [memory-core.spec.ts](memory-core.spec.ts) 检查身份、受理、操作唯一、未知与恢复。
- [memory-dispatch.spec.ts](memory-dispatch.spec.ts) 检查物化、首内容、批次原子性、重试、终局和供应商账目修订。
- [memory-consumption.spec.ts](memory-consumption.spec.ts) 检查完整块分页、当前资格、ACK 与材料释放。
- [runtime-testing.spec.ts](runtime-testing.spec.ts) 检查逐方法构造依赖、发送身份关联与调用后引用修改隔离、send/retry 参数及稀疏序列失败通道、一次发送及耗尽/异常/取消释放、宿主和手动时钟。

fixture 的主体与证据只在本地测试适配中可信。它们不替代真实耐久、消费者完成、跨进程排除或资格事务的证据。

内存部分结果场景见 [memory-partial.spec.ts](memory-partial.spec.ts)。测试按真实保存与结算驱动，覆盖未封值、提醒、超目标完整项、页完整编码硬界与临界预留下的控制/承接/释放。scripted 显式结算不代替这些映射证据。
