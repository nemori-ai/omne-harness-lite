# tests

<!-- documentation:placeholder -->

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

<!-- documentation:placeholder -->

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

<!-- documentation:placeholder -->

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

<!-- documentation:placeholder -->

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

替身：契约 `./testing` 的五个内存替身（经 `doubles/ports.ts` 加计数与脚本化的 `stop()` 范围）、`doubles/scripted-transport.ts` 的传输工厂、`doubles/stalls.ts` 让某次端口调用等到测试放行（迟到的落点、凭据与采用答复）。并发用例用 `doubles/deferred.ts` 排次序，不用计时器；只有连接时限与取页时限的用例用 1 ms、50 ms 的真实时限。真实依赖：无。`public-entry.spec.ts` 经构建产物导入包名，其余用例经相对路径导入 `src/`。缺口：没有真实传输、进程与对端；调用口的用例在下一波。
