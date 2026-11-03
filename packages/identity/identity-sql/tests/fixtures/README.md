# tests/fixtures

本目录承载测试使用的夹具与固定输入。

## 允许的内容

夹具代码、子进程脚本与说明。

## 边界

夹具不能代替规格。夹具包装 `SqlStorage` 注入故障，产品代码不认识它们。`identity-001/` 是 001 构建参加者的冻结副本，只给升级用例创建 001 的域，不随产品代码修改。

## 维护

夹具接口变化时，同步引用它的测试。

## 本包事实

- `storage.ts`：真实 sqlite-provider 的临时部署，配置取 sqlite-provider SPEC §12.1 的候选初值，目录只含本成员的材料。
- `scrypt.ts`：较小 N 的 scrypt 配置、假材料派生、可门控的计算。
- `provider.ts`：一个部署上的一个提供者，手动时钟与可调期限。
- `faults.ts`：把契约套件的账号、登录与组织记录库故障映射到读与提交，读失败与回执丢失的包装。
- `restart-child.ts`：重启用例的子进程脚本，自引用包名导入 `dist`。
- `governance.ts`：治理契约套件的夹具。每次 `create` 是新部署，`restart` 关闭存储后用同一组文件重开。可换成负控副本。
- `mutants.ts`：负控用的 `dist` 副本与四项核对的改写锚点。
- `governance-child.ts`：撤销跨进程与 001 升级用例的子进程脚本。
- `identity-001/`：6c68f4a4b 的 `participant.ts`、`schema.ts`、`support.ts` 原样副本。

负责人是本成员的写者，当前没有缺口。
