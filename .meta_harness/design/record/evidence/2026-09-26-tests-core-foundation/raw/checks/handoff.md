# W1 静态检查交付

角色：verification-developer；结果接收者与技术验收者：主调度 /root。
工作树：`/data/qiwei/repos/omne-harness-lite/.worktrees/core-delivery-checks`。
分支：`panqiwei/core-delivery-checks`；最终提交：`30f8786d3fd84c14f6c4862d18e443054dca24d4`。
自身提交：`93c29e65de2b177dd583ca54b1c8e19122bfabda`、`30f8786d3fd84c14f6c4862d18e443054dca24d4`。
调度者同步 HUB 的提交为 `ff086144`；其中已包含 foundation 公开身份类型清单。自身两次提交仅修改 tools/ts-checks。

## 规格与实现范围

采用已接受的 data.identity-values/v1、data.offer-expiry/v1，以及十五个新 core 节点当前已接受的 design。
规格来源：`.meta_harness/design/spec/data/{identity-values,offer-expiry}/verification.md`；
实现映射来源：`.meta_harness/design/realization/packages/core/<node>/design.md` 的公开面、依赖与静态义务章节。
未修改冻结规范、产品源码、根配置或锁文件。规则源码只属于本次明确的开发工具范围。

## 本次新增规则

| Rule ID | 来源及覆盖 |
|---|---|
| core-pure-imports | 十五个新 core 节点公开面和依赖表；同时承载 stream-assembly SC-2、asset-evaluation SC-1 的 import 部分。节点逐一白名单、公开入口及 schema 子入口，本包 src 与 JSON Schema、明确采用的纯 Node 构件及 Ajv/YAML/regexpp；禁 Cordis/kernel/storage/非 core 插件及未登记 core 依赖。类型与运行时 import 都查 |
| identity-decision-inputs | identity-values S-21/S-22、SC-1。显式注册函数或 @identityDecision，语法级类型/品牌输入检查。默认注册为空，组织结构/流转谓词不纳入准入检查 |
| identity-account-references | identity-values S-24、SC-2 的 typed 记录面。第二个 AccountId 字段；真实 AccountRow 自身份为 string 时，额外 typed 引用仍报出；附真实源码内存变异 |
| identity-scope-columns | identity-values S-11/S-16、SC-9 的直接记录反例。成对 optional/nullable organization/tenant 列；合法判别归属与互斥联合不误报 |

SC-OE-3 复用 no-wall-clock：Date.now 原反例保留；新增 new Date()、performance.now 反例。
其扫描改为词法代码视图，避免把注释/字面量当代码；显式 new Date(instant) 合法。

语法分析复用已锁定 TypeScript 6.0.3，不构造 Program 或声称跨文件类型分析。
IDENTITY_CHECK_INPUTS.identityTypeNames 直接引用公开入口 IDENTITY_TYPE_NAMES，测试核对同一对象及冻结。
tools/ts-checks/package.json 新增 identity-values workspace devDependency；根 pnpm-lock.yaml **需要 HUB owner 更新**。
本 spoke 使用 `pnpm install --lockfile=false --ignore-scripts` 增加 workspace 链接，再重建本检出的 identity-values。

## 验证结果与原始证据

环境：Node v24.18.0、pnpm 10.28.1、TypeScript 6.0.3、Vitest 4.1.11。

| 实际命令 | 结果 | 原始文件 |
|---|---|---|
| pnpm install --frozen-lockfile --ignore-scripts | 通过（初始锁定环境） | install.log |
| pnpm install --lockfile=false --ignore-scripts | 通过（授权的新增 workspace 链接，不改锁） | install-workspace-link.log |
| pnpm --filter @omne-harness-lite/identity-values run build | 通过（当前公开出口 dist） | identity-build.log |
| pnpm --filter @omne-harness-lite/ts-checks run build | 通过 | build.log |
| pnpm --filter @omne-harness-lite/ts-checks run typecheck | 通过 | typecheck.log |
| pnpm --filter @omne-harness-lite/ts-checks run test | 6 文件、98 tests 通过；无类型错误 | test.log |
| pnpm run lint:rules | 24 规则扫描 packages + apps，无违反 | scan.log |
| node tools/ts-checks/dist/cli.js packages apps | 构建产物 CLI 同样通过 | built-cli-scan.log |
| make docs-check | 957 Markdown 文件及本地链接/镜像通过 | docs-check.log |
| git diff --check | 通过 | 调用结果 |

局部共享格式化已跑。新规则均有合法和故意违反的 fixture。
CLI 测试实际写入临时包并启动进程，禁止 import 时退出 1、合法时退出 0；finally 删除该可重建 fixture。
AccountRow 变异只在内存进行，不改产品文件。

## 覆盖局限与后续条件

`coverage.json` 绑定规则列表、source 字段、工具源码/manifest/锁文件 SHA-256，并列出当前源码覆盖。
本树 packages 有 197 个 TS 文件（其中 100 个非测试 src），apps 32 个（其中 11 个非测试 src）。
十五个新纯 core 包在本次检出仍各为 **0 个实际产品源文件**：本次证明统一规则形式有效，尚不能为它们登记实现符合性。
SC-1 默认 decisionTargets = []、实际产品 @identityDecision 标注文件为空：**真实准入函数覆盖为 0**。
SC-2 真实 AccountRow 原文扫描通过，内存新增 typed 引用必红；普通 string 列及任意聚类键仍需字段盘点/数据形状评审。
SC-9 只检查明确直接对象形状，继承、跨文件、复合记录、重命名字段仍需额外类型/Schema及形状核对。
import 检查不覆盖第三方传递依赖、tsconfig 别名、经全局对象进行 I/O；不能据此宣称纯度、无通知或资源状态全闭合。
详细“不覆盖”及十五节点的本阶段形式/后置消费者 owner 清单已写 tools/ts-checks/README.md。

后续实施每包时运行真实源码扫描；须在真实模块路径确定后给解析调用点、六正文推出规则注册局部边界。
重用规则承载同义义务，不为消费者尚不存在的路径建立假证明。其他 SC 中可由类型表达的义务留给包级负向类型测试，
行为与状态义务留给真实运行测试；本次仅交付形式清单，未把这些项目记成已完成。

## 退休与集成

主调度需要合回最终提交，更新 workspace 锁，再用 HUB 自己的环境重跑受影响检查。
此报告及目录中的运行日志、coverage.json 是本 spoke 的唯一 ignored 证据，退休前应复制并核对 hash。
本任务已释放工作树和 .venv 消费者；不存在本任务仍运行的测试、构建或后台进程。
未执行独立总体验收；技术接受由主调度决定，最终总体接受由用户决定。
