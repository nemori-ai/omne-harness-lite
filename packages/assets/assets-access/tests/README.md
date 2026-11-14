# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

`operations.spec.ts` 用读写面的替身与主体端口的替身跑四个处理函数；消息体与成功的答复经真实的协议契约（`dist`）读写。主体端口的替身按身份的规则答：登录的账号不是目标租户的账号就拒绝。`public-entry.spec.ts` 与 `cordis-entry.spec.ts` 核两个入口。端到端用例在 `apps/harness-server/tests/rows/assets-access/`。
