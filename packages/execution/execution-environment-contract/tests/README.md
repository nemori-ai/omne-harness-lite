# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员没有提供者与运行实现。测试不需要真实存储、服务、宿主资源或 Cordis，也不使用替身。测试只覆盖本成员自己的纯函数、声明与类型，不代替组合验证、规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。导出变化时，同一次修改要更新 `public-entry.spec.ts`。改 schema 文件时，`need-declaration.spec.ts` 的摘要核对会失败，直到采用身份的 `digest` 同步。

## 本包事实

现在有八个运行测试文件与一个类型测试文件。表里列出其中六个，`operation-schemas.spec.ts` 与 `exports-inventory.spec.ts` 见本节末尾：

| 文件                                                   | 覆盖什么                                                                                                                                                                                                                                                                                                  | 条款                                                                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [public-entry.spec.ts](public-entry.spec.ts)           | 根入口导出三个设施声明、需要声明的 schema 与采用身份、两条块声明与两个纯函数；三个核心设施的每项操作都须授权；两条块是稳定的供给块，恢复方式是重算；任何模块都不导入 Cordis                                                                                                                               | [设施协议](../SPEC.md#设施协议)、[INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)、[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4) |
| [judge-requirement.spec.ts](judge-requirement.spec.ts) | 解码环境要求并保留租户对象；拒绝不带作用域引用的绑定层；拒绝带策略词的要求；用块的 schema 核对落点块的值                                                                                                                                                                                                  | [INV-EE02](../SPEC.md#inv-ee02-策略在域外求值环境只在允许清单内匹配)                                                                                                              |
| [match-providers.spec.ts](match-providers.spec.ts)     | 按允许清单的顺序匹配，不按提供者的登记顺序；不选清单外的层；缺设施时拒绝为 `missingFacility`；隔离不满足时拒绝为 `isolationUnconfirmed`                                                                                                                                                                   | [INV-EE02](../SPEC.md#inv-ee02-策略在域外求值环境只在允许清单内匹配)、[INV-EE03](../SPEC.md#inv-ee03-必需设施和隔离不得降低满足)                                                  |
| [decode.spec.ts](decode.spec.ts)                       | 租户文本经 `tenantCodec` 解码后与原租户相等；本进程已铸造的租户原样保留；手造租户、JSON 往返后的对象形与不合法的租户文本被拒；各绑定层、落点块与宿主事实块的每个字段在自己的路径上拒绝；块声明的读者与稳定性；最接近的未命中原因；`bindingScope`、`originRef`、`acquisitionRef` 与 `createRecoveryAccess` | [获取与租约](../SPEC.md#获取与租约)、[INV-EE17](../SPEC.md#inv-ee17-真实落点痕迹与诊断可定位且守住披露)、[工具环境声明](../SPEC.md#工具环境声明)                                  |
| [need-declaration.spec.ts](need-declaration.spec.ts)   | 接受未登记的设施键；拒绝未知字段、非字符串元素与不存在的绑定层；`digest` 等于 schema 文件字节的摘要                                                                                                                                                                                                       | [工具环境声明](../SPEC.md#工具环境声明)                                                                                                                                           |
| [provider-conformance.spec.ts](provider-conformance.spec.ts) | 用脚本替身逐项运行提供者套件的十六项义务，并用坏提供者逐项否定：配额声明不合界、查询编造分配、不同描述不答冲突、列出漏掉打开的获取、重复结清改写分配等；执行环境套件的用例数为三十三 | [原获取的查询与结清](../SPEC.md#原获取的查询与结清)、[配额与安全上界](../SPEC.md#配额与安全上界)、[持续验证义务](../SPEC.md#持续验证义务) |
| [facility-set.spec-d.ts](facility-set.spec-d.ts)       | 示例按公开入口编译；`FacilitySet` 只给出声明点名的设施；三个核心设施键已登记且键集开放；声明不能写不存在的绑定层；租约按键给出设施类型                                                                                                                                                                    | [工具环境声明](../SPEC.md#工具环境声明)、[设施协议](../SPEC.md#设施协议)                                                                                                          |

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/execution-environment-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。`vitest.config.ts` 为 `*.spec-d.ts` 打开了类型检查。

当前缺口：落点的歧义拒绝、获取的幂等与重新核对、租约视图与恢复编排归 [execution-environment](../../execution-environment/README.md) 验证，本目录不覆盖；真实设施行为归提供者成员验证。SPEC 的[持续验证义务](../SPEC.md#持续验证义务)大部分需要组合验证。`operation-schemas.spec.ts` 覆盖三面九操作的 schema（含配额域、原获取描述、查询与恢复查询的答复、采用失败与清理状态）、日期与逐项拒绝，`exports-inventory.spec.ts` 消费共享导出清单工具。`./testing` 的执行环境套件在登记表成员的 `contract-conformance.spec.ts` 运行；执行环境与真实宿主提供者套件、V-EE05/18/19/20/22 坏实现否定在 host-local 的 `contract-conformance.spec.ts` 运行；这些进程内测试不证明真实资源耐久或隔离。具名维护者由负责人指定。
