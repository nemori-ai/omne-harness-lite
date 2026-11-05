# verification

本目录承载本包的持续验证资源：模型、论证或证明。

## 允许的内容

`models/` 下的形式模型，`proofs/` 下的论证或证明，以及说明文件。

## 边界

每份资源说明所验证的性质、前提、运行命令、覆盖与限制。单次运行的原始输出留任务 tmp，不进本目录。

## 维护

被验证的承诺变化时，同步模型、证明与本目录 `index.md`。

## 本包事实

`models/` 有两个 TLA+ 模型，对应 SPEC 的两节：

| 模型 | SPEC 条款 | 性质 |
| --- | --- | --- |
| [ProcessCustody](models/README.md#processcustody) | [一次性命令留下的进程](../SPEC.md#一次性命令留下的进程)、[保留终端](../SPEC.md#保留终端)的封闭与回收、[恢复](../SPEC.md#恢复) | 不泄漏、唯一归属、移交恰好一次、停止为真、封闭即终、不驱逐、保留活过获取、恢复覆盖、可保留即保留；三条活性 |
| [TerminalSegments](models/README.md#terminalsegments) | [终端段的完成与字节归属](../SPEC.md#终端段的完成与字节归属) | 完成只看控制通道、前台字节不外流、全归属且保序、后台写入不使终端失效、一个终端同时只有一段 |

两个模型对应的条款都已由宿主提供者在 Linux 上兑现，实现与模型动作的对应见 [formal-mapping.md](formal-mapping.md)。保留进程的 `stop` 条款冻结，现在没有实现，模型里的显式停止只说明目标语义。

运行全部配置的命令（在仓库根目录）：

```sh
JAVA_BIN=<java 可执行文件> TLA2TOOLS_JAR=<tla2tools.jar> TLC_WORKERS=6 \
  packages/execution/execution-environment-contract/verification/models/run-tlc.sh <输出目录>
```

`TLA2TOOLS_JAR` 必须给出。工具环境见 [docs/verification.md](../../../../docs/verification.md#检查入口)。脚本跑完每个配置，在输出目录写 `summary.txt`。任一项不符合预期时，脚本以非零退出。判读规则见 [models/README.md](models/README.md#判读)。仓库不设中央的形式任务登记，所以这条命令就是这两个模型的守卫：改动相关条款或实现时复跑它，并把结果记进 [formal-runs.md](formal-runs.md)。

性质、条款与前提的对应见 [formal-mapping.md](formal-mapping.md)。有限常量之外的推广见 [proofs/](proofs/README.md)。

不能由这些资源得出的结论：

- 模型只在所列的有限常量内穷举。有限实例里没有反例，不表示任意规模下成立。推广靠 `proofs/` 的手写证明，它不是机器检查的证明。
- 模型证明的是：平台满足前提时，语义成立。它不证明某个平台满足前提。每个平台的前提由宿主提供者在真机上用慢层用例验证。
- 模型不证明实现精化模型。实现与模型动作的对应写在 [formal-mapping.md](formal-mapping.md#实现对应)。现在只有 TerminalSegments 有对应，ProcessCustody 在一次性命令实现时填写。

本成员的其他持续验证义务列在 SPEC 的[持续验证义务](../SPEC.md#持续验证义务)，现在由本包测试承担的部分见 [tests/](../tests/README.md)。许可先于首个外部效果、同键获取不重复分配、释放与恢复的状态转移这类性质，主要由机制成员与集成方的组合承担。配额、查询、迟到与结清协议还没有模型。

`./testing` 提供环境与提供者的独立用例；实际宿主消费和坏实现否定在 host-local 测试运行。缺少控制钩子的通用调用报告不适用；宿主在途排空另以受控真实文件操作运行同一用例。未覆盖受限执行域、耐久账本与跨进程恢复。
