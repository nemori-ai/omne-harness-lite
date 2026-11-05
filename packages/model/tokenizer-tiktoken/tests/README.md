# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

测试分两层。两层都不访问网络，不替身 js-tiktoken。

快层：

- 直接调用 `createTiktokenTokenizer`，使用真实的 js-tiktoken 引擎。
- 第一份词表是 js-tiktoken 自带的 `o200k_base` 秩数据，只在测试中导入。发布代码不导入任何词表。
- 第二份词表是 [fixtures/synthetic-ranks.json](fixtures/README.md)。它证明计数用的是调用方传入的词表。
- o200k 的普通文本计数与完整 js-tiktoken 的 `o200k_base` 编码器比较。
- 摘要常量在本包以外独立算出，见 [fixtures/README.md](fixtures/README.md)。所以测试核对的是规范 JSON 的写法，不只是本包自身的一致。

`differential.spec.ts` 直接导入本包 `src/tokenizer.ts`。它用未修改的 js-tiktoken 1.0.21 作 oracle，穷举 32 份稀疏、同 rank、非单调合成词表上的 364 个文本。另以固定 seed 比较 o200k 和家族拥有的 Claude 词表。具名小例覆盖最左优先、左右更新、失效边、整块捷径、缺 rank、NaN 与 Infinity、正则间隙及零宽、相邻段、显式特殊段与 Unicode。测试只比较公开计数；计数相等可能掩盖分区差异，具名反例保证关键调度错误会改变结果。另以只有单字节 token 的 131072 字节片段核对已知计数，排除对展开参数上限的依赖；不声称旧引擎能完成该输入。

`engine-shape.spec.ts` 直接消费包内私有模块，核对未声明运行时成员不兼容时的错误。它没有新增包导出。

慢层的两个文件都以 `// @module-tag slow` 标记，都会启动子进程。运行之前必须先构建本包；经 turbo 运行时，turbo 先构建。

`published.spec.ts`：

- 子进程从 `realpathSync(mkdtempSync(...))` 得到的临时目录启动，不继承 `BASELINE` 环境变量。
- 子进程只加载 `dist/index.js`，自己读取两份词表，再初始化并计数。父进程用源码计数，两边结果必须相同。
- 子进程中实现版本失配同样返回 `unavailable`。

`performance.spec.ts` 给子进程设置 8 秒外部截止和 SIGKILL，避免同步计算阻塞测试进程。它加载重建后的 dist，计数 24 KiB 空白。该回归只排除已知全扫描退化；不把这个时限提升为跨环境 SLA，也不证明完整请求或服务关闭流程。

未覆盖：

- Anthropic 的采用值和参考 150 由家族 `meter.spec.ts` 核对。算法差分只读取它现有的 `claude.json`，不复制或改写资源。
- 本包不测试家族成员给出的具体采用值是否与厂商的实际 tokenizer 一致。这项责任归家族成员。
- `count` 不读文件、不访问网络，这一点由源码结构保证，没有专门的运行时探测。
