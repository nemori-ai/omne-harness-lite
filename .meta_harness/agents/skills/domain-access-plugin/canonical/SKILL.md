---
name: domain-access-plugin
description: >
  让一个领域对客户端开放时的做法：协议契约、接入插件、服务端应用的一行装配、界面模块各放哪、
  各依赖什么、处理函数照什么次序写、要改哪些登记文件、用哪些检查验。
  要给一个领域新增对客户端开放的操作或观察、新建 `*-protocol`、`*-access`、`*-ui` 成员、
  给已有协议加操作、给命令行或桌面应用接一个新协议，或排查「协议没挂上」「新地址答 404」
  「依赖检查拦了界面模块」时加载。只改领域核心、不碰对外开放的面时不加载。
  本技能不授予接受权；边界与规则以 `packages/access/SPEC.md` 与架构正文为准。
---

# 领域怎样对客户端开放

入口、界面外壳都不认识任何领域。一个领域要让客户端用到它，自己带四样东西来：协议契约、接入插件、协议客户端、界面模块。前两样在服务端一侧，后两样在客户端一侧，协议契约两端共用。开不开放由应用的装配决定：有这四样不等于开放。

精确的规则不在这里。入口、管道、登记表与观察中枢归 `packages/access/SPEC.md`；谁可以依赖谁归 `docs/architecture/layers-and-dependencies.md`；外壳给界面模块什么归 `packages/frontend/SPEC.md`「外壳契约」；心智模型在技能 `domain-mental-models` 的 `references/access.md`。这份技能只讲动手时的次序与容易漏的地方。

## 先分清要哪几样

| 你要做的事 | 要的东西 |
| --- | --- |
| 让客户端调领域的一个操作，或看它的一条事件流 | 协议契约、接入插件、服务端应用的一行 |
| 让命令行用上 | 上一行，加命令行里的一条命令。协议客户端由协议契约得到，不用写 |
| 让人在桌面应用里看见、点到 | 再加界面模块，并在应用的装配文件里列出它 |
| 给已有协议加一个操作 | 改协议契约与接入插件。行、登记、装配都不动 |

一个协议一个主版本。改已有操作的形状是破坏性改动，先读技能 `omne-card` 的契约变更参考页。

## 四样东西各是什么

| 样 | 成员与位置 | 写什么 | 在仓库里只依赖 |
| --- | --- | --- | --- |
| 协议契约 | `packages/<组>/<名>-protocol` | 用 `defineProtocol` 声明协议名、主版本、每个操作与观察；形状用规则写，经 `ruleCodec` 得到编解码 | 公开契约的共同部分、共用纯定义 |
| 接入插件 | `packages/<组>/<名>-access` | 根入口：处理函数与它要的端口。`./cordis` 入口：一个工厂，用 `defineAccessPlugin` 把贡献挂上登记表 | 协议契约、接入贡献的类型与登记表的服务定义、领域的公开接口 |
| 服务端应用的一行 | `apps/harness-server/src/rows/<名>-access/index.ts` | `defineRow`：把接入插件的端口接到这棵树上的服务 | 应用自己的事 |
| 界面模块 | `packages/<组>/<名>-ui` | `./cordis` 入口导出一个用 `defineUiModule` 造的插件，名字是 `<领域>UiModule` | 客户端装配、frontend 组、SDK 的客户端核心、公开契约、本领域的协议契约、共用纯定义 |

协议客户端不是一个成员：客户端装配拿到协议契约，协议在服务端挂着时客户端树上就长出它，撤了就收回。

样例照着读，不照着抄形状以外的东西：

- 最小的一套（一个操作，没有观察）：`packages/session/session-diagnostics-protocol`、`session-diagnostics-access`，行在 `apps/harness-server/src/rows/session-diagnostics-access/`。
- 带观察的：`packages/session/session-protocol`、`session-access`（帧带内容，断了能接续）；`packages/human-intervention/human-intervention-protocol`、`human-intervention-access` 的 `observe-cards`（帧只说「可能变了」，客户端收到就重读）。
- 带界面模块的：`packages/assets/assets-protocol`、`assets-access`、`assets-ui`。

## 次序

### 1. 协议契约

1. 用包模板生成成员（`pnpm package:template create`，看它的帮助；变体照同类的现有成员）。
2. 每个操作写四样：`identity`（这次调用要什么身份）、`effect`（读还是提交）、`limit`（正文的大小档）、`body` 与 `outcomes`。结果名取共同契约里的那一组，不自造。
3. 形状只用规则的叶子与组合写。叶子的清单在 `packages/access/public-contract/src/rule.ts`。一个值是什么就用什么叶子：条数用计数的叶子，不借修订号或文本。清单里没有合适的叶子时，停下来提出加一个，不凑。
4. 提交类的操作配一个认回的操作（`query-…`），正文与提交相同。结果不知道就答 `unknown`，由客户端拿同一份正文认回。
5. 把成员登记成契约成员并生成契约 API 的快照（见下面的登记）。

### 2. 接入插件

处理函数的次序是固定的，每一步答什么也是固定的：

1. 核这次登录可以为目标租户行事。登录对插件不透明，读不出账号：插件声明一个端口，由应用的行用身份的 `actFor` 适配。拒绝答 `denied`，依据取不到答 `basis-unavailable`。
2. 取为这个租户行事的主体。主体每次调用现取，不缓存。
3. 取领域的面。面按调用现取；取不到答 `basis-unavailable`，协议不撤下。
4. 调领域的公开入口，把领域的结果映射成协议的结果。领域抛出时：读操作答 `basis-unavailable`，提交操作答 `unknown`。不把抛出写成成功或失败。

别的要点：

- 插件不认识入口，也不认识应用。它要的东西都写成端口（`src/ports.ts`），由行来接。
- 派生标识用的文本（会话的身份、输入的身份、答复的身份）写进了已有的事实，改了旧的就认不回。要用到时照现有的字面，不改。
- 插件没有写诊断的去处。处理函数答 `basis-unavailable` 或抛出时，由入口的管道统一记。
- 一个操作算不算业务访问（`countsAsAccess`）是领域的决定，写在协议契约里。

### 3. 服务端应用的一行与登记

行只注入登记表与主体签发两样，别的面在处理函数里按调用现取。登记要改的文件多，漏一个就有一项检查变红：逐项见 [references/registrations.md](references/registrations.md)。

### 4. 客户端

- 命令行：在 `apps/cli` 加命令，经协议客户端调。本机状态文件的形状不动。
- 界面模块：`defineUiModule({ name, inject, apply })`，在 `apply` 里往外壳的插入位置放东西（登录门、页面、侧栏区）。它依赖的协议客户端写在 `inject` 里：协议没挂着时界面模块不加载，撤了就卸载，放的东西随作用域撤掉，不写撤下的代码。
- 界面模块之间互不导入，要配合就经外壳（切页用 `shell.navigate`，租户用 `shell.scope`）。控件、图标、样式变量用 `@omne-harness/ui-kit` 的，成员里不自己写按钮、提示这一类基础样式。文案是中文，失败码到文案的映射归界面模块。
- 服务端是事实的权威：界面模块不从历史里推服务端的状态，要知道就读协议给的那个操作。
- 应用的装配文件是唯一列出界面模块的地方。外壳的其余代码不导入任何领域。

## 用什么验

| 验什么 | 怎样验 |
| --- | --- |
| 形状往返 | 协议成员的用例：每个操作的正文与每种结果编出去再读回来相等；不合规则的被拒 |
| 处理函数 | 接入成员的用例：领域用替身，上面四步每一步的每种答复各一条 |
| 真的挂上了 | `apps/harness-server/tests/rows/<名>-access/` 的慢层用例：起真实的发行树，经新地址走一遍 |
| 行表与文档一致 | `apps/harness-server` 下 `pnpm run check:aa-rows` |
| 契约 API 快照 | 根下 `pnpm exec omne-contract-api --check` |
| 依赖方向 | 根下 `pnpm run lint:deps`。界面一侧的三条：界面模块只依赖客户端装配、frontend 组与本领域协议；frontend 组不认识领域；别的成员不依赖客户端一侧 |
| 界面模块的加载与卸载 | 界面成员的用例：依赖的服务出现时放进去，消失时撤掉。用例里的外壳照 `packages/frontend/shell-contract/tests/reference-shell.ts` 起一个最小的 |

## 常见的错

- 新地址答 404：行没进发行树，或依赖的服务不齐插件没启动。先看 `tests/serve.spec.ts` 里的行清单，再看行的 `inject`。
- 协议挂着但调用答 `basis-unavailable`：领域的面按调用现取时没取到。这是设计好的答复，查领域那一行起没起来。
- 界面模块不出现：它 `inject` 的协议客户端不在。协议在服务端没挂着，或客户端装配没拿到这份协议契约。
- 依赖检查拦了界面模块：它导入了别的领域的成员，或别的领域的界面模块。
