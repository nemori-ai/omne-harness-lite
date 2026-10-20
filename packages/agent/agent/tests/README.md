# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试只经根入口与 `./testing` 入口调用，只断言公开返回值，不读内部状态。

- `public-entry.spec.ts` 核对两个入口的导出名、源码与构建产物的导入图、清单依赖，以及生产安装闭包不到达 Cordis。它读 `package.json` 与 `dist`，所以先构建再运行。
- `memory-journal.spec.ts` 用内存 Journal 核对[同形清单](../docs/architecture/mechanisms.md#两种实现必须同形的事实)。替身只有一个进程，不覆盖耐久性、崩溃与跨进程接管。
- `fixtures.spec.ts` 与 `assembly.spec.ts` 核对替身按编排回答，以及工厂壳返回 `unavailable`。替身不证明真实提供者符合契约。

测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。#558 裁定 M04-4、M04-5 或 M04-7 之后，在同一波修改内存 Journal、对应的临时做法用例和成员 README 的支持范围表。同形清单变化时，按新条目号同步 `memory-journal.spec.ts` 的用例名。

## 本包事实

`memory-journal.spec.ts` 按同形清单组织：每个 `describe` 对应一条事实，名称以 `fact N` 开头，用例名也带条目号。6.1 与 7.4 可以把这些用例搬到 `agent-journal-local`，两种实现共用同一套断言。

最后一个 `describe` 名为「临时做法，待 #558 裁定」，含三条用例：

- M04-4：`commit` 与六个记录方法成功写入时推进 revision，同操作重试认回原回执、不推进。
- M04-5：未声明参加者时，`recordResult.transfer` 的 custody 与 processed 由提供者建立依据；`commit.caller` 的同种类返回 `unsupported`。
- M04-7：`open` 不追加事件，第一个序号属于之后的一次提交。

`journal-support.ts` 构造测试共用的契约值。`module-graph.ts` 与 `packages/tool/tool/tests/module-graph.ts` 相同，遍历导入图。
