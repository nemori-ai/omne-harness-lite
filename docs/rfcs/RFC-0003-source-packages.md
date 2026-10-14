---
id: RFC-0003
title: 新架构源码包
revision: 1
status: accepted
owner: PanQiWei
---

# RFC-0003：新架构源码包

规则与维护责任见[RFC入口](README.md)。PanQiWei 于 2026-10-14 接受本提案 revision 1，记录见[接受评论](https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6165074528)。它告诉接手人怎样建立、消费、检查和交付新的源码包。它不建立这些包，也不把预留目录变成成员。规范写回尚未发生。

## 问题与有效输入

[包组织](../package-organization.md) 已经给出目标分组。`packages/*/*` 和 `apps/*` 在本提案起草时没有 `package.json`。活跃工具仍依赖 `packages.0.0.1.legacy/` 和 `apps.0.0.1.legacy/`。没有一份文本说明第一个真实成员如何声明导出、如何被类型检查、以及哪些目录还不能当成员。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [包组织](../package-organization.md) | `packages/<能力组>/<成员>/`。第一层不是 workspace 成员。契约、实现、提供者和 Cordis 适配就近维护 | 本提案不另写一套分组。它只规定成员如何成为可安装、可检查的包 |
| [Issue #241](https://github.com/nemori-ai/omne-harness-lite/issues/241) 的 I-05 | 共同值目标是 `packages/common/legal-identity` 与 `packages/common/utc-instant`。`kernel-basis` 是独立 assembly 成员。设计接受不等于产品实现 | 这些位置可以进入首批候选。缺技术接受的部分不获得实施资格 |
| [RFC-0002](RFC-0002-engineering-toolchain.md) | 工具侧拥有 TypeScript 7、oxlint、dependency-cruiser、源码条件导出和可擦除语法的检查责任 | 成员规则引用该提案。本提案不复制工具选型 |
| 清点 `tmp/issue-241/inventory.md` | `tools/ts-checks` 导入旧 `identity-values`。`tools/core-verification` 有 21 个旧包名、28 条 devDependency。新包目录尚无 `package.json` | 首批成员只覆盖已点名且解除依赖所必需的承接。没有点名拥有者的旧包保持未知 |

## 建议与改变范围

一个成员是拥有 `package.json`、源码、依赖、公开入口和验证的目录。能力组目录不是成员。预留的 README 不是成员。

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 包组织 | 目标叶子多数还没有包 | 成员按已有分组落入。拆包依据是真实消费者和依赖边界，不是技术角色目录 | 不把 common、time、telemetry、assembly 变成杂物目录。不造空成员 |
| 身份与时间 | 旧 `identity-values` 仍被检查器导入 | 首批候选包含 `legal-identity` 和 `utc-instant`。检查器改从这些公开入口取类型名 | 包不存在之前，不改导入。精确业务契约仍由成员持有 |
| 装配 | 包组织已登记 `packages/assembly/kernel-basis`，并写明现行实现仍在 legacy | 首批候选包含该成员。根入口只导出操作结果，不导入 `@deepseek-ai/cordis` | 本提案不搬迁旧包，也不建立转发层 |
| 存储 | #223 的事务行为已有规格，目录还不是 workspace 成员 | 存储成员可以承接该规格。完整装配的其余设计仍有缺口 | 缺口部分不授予实施资格 |
| 声明与产物 | 旧成员通过 `dist` 的声明互相引用 | 类型检查按 RFC-0002 的源码条件读源码。构建仍产出 `dist`。运行和发布消费 `dist`，除非该成员已证明 Node 能直接执行其源码 | 条件名是 `source`。发布时去掉它。发布包不含 `src` |
| 测试 | 旧测试经常导入自己的 `dist` | 类型检查不先构建。单元测试和包内集成在源码可直接执行时读源码。子进程、schema 生成和打包消费测试必须对着实际产物 | 禁止用旧 `dist` 或缓存让缺少产物的测试通过 |
| 模板与检查器 | #219 已交付模板，并保留方向规则尚未适配的缺口 | 新包准入补上这些缺口之后，模板才能生成会被默认检查接受的成员 | 临时样例不留在产品目录 |

首批候选和已知消费者：

| 候选成员 | 已点名的消费者 | 今天的状态 |
| --- | --- | --- |
| `packages/common/legal-identity` | `tools/ts-checks` 的身份形状规则 | 目录不是包。旧消费者导入 `@omne-harness-lite/identity-values` |
| `packages/common/utc-instant` | 需要共同时间值的成员。具体导入点由建包任务列出 | 目录不是包 |
| `packages/assembly/kernel-basis` | 业务成员的公开入口，按包组织的现有句子 | 现行代码仍在 legacy。本提案不搬迁 |
| `packages/storage` 下的事务规格成员 | 调用存储的参加者。精确包名尚未在已接受设计里钉死 | 规格已接受。包未建立。名称未定，不在这里新造一个名字 |

`tools/core-verification` 的 21 个旧包里，`identity-values` 和 `kernel-basis` 已有目标位置，`storage` 与 `storage-sql` 只有规格、没有包名。其余旧包没有点名的新拥有者，不进入首批。

依赖方向沿用包组织和架构分层。CLI 通过 SDK 消费。命令解析模块不导入 `@deepseek-ai/cordis`。SDK 不导入 server-entry。这些边界来自 #218 的已接受结论。本提案不放宽它们。

成员还要满足 RFC-0002 交给包提案拥有的四条成员规则：

1. `build` 先清空 `dist`。
2. 源码的类型检查只有一条责任路径。构建不再兼任日常类型检查。
3. 禁止包级循环，包括 devDependency。
4. 源码只用可擦除的 TypeScript 语法，以便 Node 24 能直接执行。构造函数参数属性、`enum` 和 `namespace` 不进入新包。

### 源码包的正式模板结构

新的产品源码包使用下面这一套结构。它以现有 `typescript-package@2.0.0` 的必选文件为底，并补上 RFC-0002 已经接受的三处。应用不使用这套模板。应用仍在 `apps/<成员>/`。

每个新成员必须有这些文件。缺任何一个，模板生成不合格。

```text
packages/<能力组>/<成员>/
├── package.json
├── README.md
├── README_ZH.md
├── documentation.json
├── src/
│   └── index.ts
├── tests/
│   └── <行为>.spec.ts
├── tsconfig.build.json
├── tsconfig.test.json
└── vitest.config.ts
```

`cordis-module`、`service-contract` 和 `service-provider` 再加 `src/cordis.ts`。`module` 不加这个文件。根入口 `src/index.ts` 不导入 `@deepseek-ai/cordis`。Cordis 绑定只从 `src/cordis.ts` 导出。

`package.json` 必须声明这些字段。源码条件名是 RFC-0002 已定的 `source`。发布时去掉它。

```json
{
  "name": "@omne-harness/<成员>",
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json"
  }
}
```

源码条件写在 `types` 前面。`files` 只发布 `dist`。`build` 先删除 `dist`，再编译。成员自己的脚本不再跑第二遍类型检查。全仓类型检查读取源码条件，不把 `src` 再编进 `tsconfig.test.json`。

`tsconfig.build.json` 只包含 `src`，并打开 `erasableSyntaxOnly`。`tsconfig.test.json` 只包含 `tests`。测试导入本包时走包名，不写 `../dist/index.js`。

下面的目录只有在里面有真实内容时才存在。模板不生成空目录，也不生成占位规格。

```text
docs/  SPEC.md  schema/  verification/  adr/  examples/  resources/
```

`typescript-package@2.0.0` 生成必选文件、四种变体和 `src/cordis.ts`。生成器已经写出 `build` 先删除 `dist`、`erasableSyntaxOnly`、只发布 `dist` 的 `files`，以及 `source` 条件。发布时去掉 `source`。现有模板 README 里的大树是可选资源角色，不是每个新包都要建满的目录。

依赖层数的上限未定。未定之前，新包不得形成比解除当前工具依赖更深的链。具体数字等 PanQiWei 在看到首批依赖图之后裁定。

模板和检查器的已知缺口：

- 旧的三层方向检查还按 legacy 的 core、util、领域、应用来分组。新分组要用包组织的能力组，而不是那三层。
- SDK 与 server-entry 的同组依赖识别尚未按 #218 的边界适配。
- 应用模板还不能表达「应用装配 Cordis、命令解析不导入 Cordis」。
- 建包顺序是：先有被 `tools/ts-checks` 实际导入的身份包，再移开该导入。其他首批候选只有在具名消费者需要时才建立。没有消费者的预留目录保持目录。

可以并行的范围：身份包的契约草案，和与它无导入关系的文档写回。不能并行的范围：两个写者同时改根锁文件、包模板或 Issue 摘要。

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| 把 legacy 包改名或加一层转发，让旧导入继续工作 | 检查器不用改 | 这就是别名和转发层。Issue #241 明确不把这种结果当成脱离 | 放弃 |
| 等全部 21 个旧依赖都有新包再移开检查器 | 一次切完 | 多数新拥有者未知。检查器会继续安装整个旧闭包 | 放弃。只移开已有拥有者且被活跃工具真实导入的边 |
| 类型检查继续只读 `dist` | 与今天相同 | 新包的类型检查仍要先构建，并按依赖顺序排队 | 放弃。类型检查跟随 RFC-0002。产物测试仍读 `dist` |

## 验证与消费者切换

- 独立阅读本提案的人能指出首批候选、它们的消费者，以及哪些依赖仍然未知。
- 沿着身份规则到 `legal-identity` 的边可以在文中走通。今天这条边的实现仍指向旧包，文中写明了这一点。
- 声明、运行和安装分别有约定。上面的模板树给出必选文件和 `package.json` 的导出形状。可选目录不是必选文件。
- 建立第一个成员时，在隔离目录运行模板，检查导出、类型检查和「不导入 server-entry / 不在命令解析中导入 Cordis」。样例不提交到产品树。
- 正例是新成员的源码导入。反例是旧路径、旧包名和经由第三包的间接旧包导入。检查机制归 RFC-0002 的 dependency-cruiser 责任。该工具未安装之前，不得把反例写成已经拦住。

## 决定范围

- 有权决定者：PanQiWei。
- 决定日期及对应 revision：2026-10-14，revision 1。记录为 https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6165074528 。
- 采用范围：本提案 revision 1 的方案，包括源码包的正式模板结构。模板文件继续由 `tools/ts-checks` 的包模板维护，不在仓库根另设模板目录。
- 不采用范围及必要理由：不建立全部目标目录，不搬迁 legacy，不实施 RFC-0002 的工具升级，不把根上的模板目录当作第二份结构。存储包名、依赖层数上限，以及尚未点名的旧依赖拥有者，仍未决定。源码条件名已由 RFC-0002 定为 `source`。
- 未决与依赖停止点：
  - 存储成员的包名。裁定者是 PanQiWei。恢复输入是已接受的存储规格和具名消费者。
  - 依赖层数上限。与 RFC-0002 的未决是同一项，不在两份提案里各定一个数。
  - 源码条件名已定为 `source`。见 RFC-0002。
  - `tools/core-verification` 其余旧依赖的新拥有者。没有拥有者就不建包。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 成员定义、首批候选、声明与测试职责、正式模板结构 | [包组织](../package-organization.md#成员的必选结构)。[开发指南](../development.md#创建和整改产品包) 与 [成员文档](../member-documentation.md) 只保留指针 | 已写回 | 2026-10-14。同日生成器补上先删除 `dist` 的 build 和 `erasableSyntaxOnly`。源码条件名未定 |
| workspace 的源码归属 | [workspace](../workspace.md) | 免除写回 | 2026-10-14 核对。该页写的是尚未退出的工具依赖和参考位置，不是新工作的导入做法。确认范围来自本卡落盘计划 |
| 仍写着新工作应导入旧包的过渡句 | 清点列出的开发指南 | 待写回 | 本次没有把指南改成已经脱离。代码未切换。指示新工作导入旧包的句子留到切换时改 |
| 模板准入缺口 | [包模板中文说明](../../tools/ts-checks/templates/package/README_ZH.md) 与 [英文说明](../../tools/ts-checks/templates/package/README.md) | 已写回 | 2026-10-14 生成器已写出先删除 `dist` 的 build 和 `erasableSyntaxOnly`。源码条件仍未写出 |

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| [RFC-0005](RFC-0005-package-testing.md) revision 1，2026-10-14 接受 | 后继本提案「测试」那一行的责任划分。revision 1 的其余采用范围保持。该行原文保留 | [验证](../verification.md#包级测试责任与边界) |
