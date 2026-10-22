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

慢层（`published.spec.ts`）：

- 文件第一行写 `// @module-tag slow`，理由是它启动子进程。
- 子进程从 `realpathSync(mkdtempSync(...))` 得到的临时目录启动，不继承 `BASELINE` 环境变量。
- 子进程只加载 `dist/index.js`，自己读取两份词表，再初始化并计数。父进程用源码计数，两边结果必须相同。
- 子进程中实现版本失配同样返回 `unavailable`。
- 运行慢层之前必须先构建本包。经 turbo 运行时，turbo 先构建。

未覆盖：

- Anthropic 的 `claude.json` 不在本包测试。它随 `pi-ai-anthropic` 迁入。该成员的 `meter.spec.ts` 核对文件的 SHA-256，并核对经本包的计数等于参考值 150。
- 本包不测试家族成员给出的具体采用值是否与厂商的实际 tokenizer 一致。这项责任归家族成员。
- `count` 不读文件、不访问网络，这一点由源码结构保证，没有专门的运行时探测。
