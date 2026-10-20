# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试只经根入口与 `./testing` 入口调用，只断言公开返回值，不读内部状态。

- `public-entry.spec.ts` 核对两个入口的导出名、源码与构建产物的导入图、清单依赖，以及生产安装闭包不到达 Cordis。它读 `package.json` 与 `dist`，所以先构建再运行。
- `memory-journal.spec.ts` 用内存 Journal 核对[同形清单](../docs/architecture/mechanisms.md#两种实现必须同形的事实)。替身只有一个进程，不覆盖耐久性、崩溃与跨进程接管。
- `fixtures.spec.ts` 与 `assembly.spec.ts` 核对替身按编排回答，以及测试装配交给工厂得到 idle 的 provider。替身不证明真实提供者符合契约。
- `factory.spec.ts` 核对工厂的四种创建失败与成功的 idle。每条失败用例都经调用记录核对创建没有调用任何依赖的方法：没有写 Journal，没有事件，没有调用登记句柄与 `access.check`。
- `provider-access.spec.ts` 对四个面的每个公开操作核对：跨租户 `denied`，缺租户或租户非法 `invalid`（`observe` 以 `denied` 结束），都不调用 `access.check`。`access.check` 的 denied、unavailable、reject 与契约之外的回答都不放行。每次操作恰好调用一次，不缓存 allowed。

测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。#558 裁定 M04-4、M04-5 或 M04-7 之后，在同一波修改内存 Journal、对应的临时做法用例和成员 README 的支持范围表。同形清单变化时，按新条目号同步 `memory-journal.spec.ts` 的用例名。

## 本包事实

`memory-journal.spec.ts` 按同形清单组织：每个 `describe` 对应一条事实，名称以 `fact N` 开头，用例名也带条目号。6.1 与 7.4 可以把这些用例搬到 `agent-journal-local`，两种实现共用同一套断言。

名为「临时做法，待 #558 裁定」的 `describe` 含四条用例：

- M04-4：`commit` 与六个记录方法成功写入时推进 revision，同操作重试认回原回执、不推进。
- M04-5：未声明参加者时，`recordResult.transfer` 的 custody 与 processed 由提供者建立依据；`commit.caller` 的同种类返回 `unsupported`。
- M04-7：`open` 不追加事件，第一个序号属于之后的一次提交。
- M04-1 的读法：`control` 与 `recordControl` 把阶段事实投影为 control 事件。

`fact 10` 中名称带「临时做法，待 #558 裁定」的用例固定 `tryFinish` 的 controls 与 inputs 两项 blocked 条件、passages 不检查，以及 ended 之后 `recordControl` 只记录、不投影事件。`journal-support.ts` 的 `finish` 先经 `takeInputs` 取走受理输入，再以普通完成终结。

`provider-access.spec.ts` 中名称以「stage-temporary (#502)」开头的用例固定阶段性临时做法：放行之后，`observe` 之外的操作本体返回具名的 `unavailable`。实现对应阶段的卡改写这些用例。

下列创建校验没有用例，因为工厂收到的输入判定不了它们，见[成员 README](../README_ZH.md#支持范围)：

- 待拥有者：绑定租户与安全作用域不一致（`denied`）。
- 待拥有者：精确采用 `binding.definition` 与 `loopGuardPolicy` 解析不到（`unavailable`），以及依定义判定 tools、admission、extensions 的必需性。
- 待 #558 M04-3：外部协调者参加的拒绝条件。

工厂只为无类型调用方校验选项的取值。依赖假定满足各自的契约类型，测试不覆盖违反类型的依赖：没有 `capabilities` 的 Journal、抛出异常的 `registration.instance` 读取器、不是对象的选项或依赖都使创建 reject。

`observe` 缺租户与租户非法的用例名带「待拥有者」：契约没有 `invalid` 的结束原因，用例只核对序列结束、没有状态、没有调用 `access.check`，不核对结束原因。

`journal-support.ts` 构造测试共用的契约值。`factory-support.ts` 给出工厂测试的有效选项、记录每次依赖方法调用的代理与登记句柄替身。`module-graph.ts` 与 `packages/tool/tool/tests/module-graph.ts` 相同，遍历导入图。
