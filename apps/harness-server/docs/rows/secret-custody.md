# 秘密保管行

`secret-custody` 行把 settings-local 的秘密保管库（`@omne-harness/settings-local/secrets`）作为受信服务 `settingsSecretCustody` 提供给装配。端口与值归 [Settings 的秘密设置项](../../../../packages/assets/settings/SPEC.md#secret-items)，文件格式、文件锁、原子发布与读分类归 [settings-local 的秘密保管](../../../../packages/assets/settings-local/SPEC.md#secret-custody)。本行不解释目标的含义，不在范围之间选择，也不持有工厂规则。

## 配置与装载

配置是 `{ path, lockWaitMs? }`。`path` 是保管库文件的绝对路径；本地配置档由 `src/local/operator-defaults.ts` 从位置解析填入 `<状态目录>/model-vault.json`，与 `model-credential` 行同一个文件。`lockWaitMs` 是每次写入等待文件锁的上限，默认 2000 毫秒；在一棵装配树里等待不应长于一次请求的耐心。配置经导出的 Standard Schema `secretCustodyConfig` 校验，缺 `path` 或 `lockWaitMs` 不是非负安全整数时拒绝。

行声明：提供 `settingsSecretCustody`，不注入任何名字，生命周期 `none`。装载时不读文件、不建文件：服务的每个方法在调用时打开保管库。文件缺失、损坏或读不出时行仍是 `ACTIVE`，读面答 `unavailable`，写面答 `not-written`，文件字节不变。这样装配不因一个未建好的保管库而启动失败，而缺少秘密在使用处作为结果可见。

## 服务面

服务类 `SettingsSecretCustodyService` 实现 `SecretCustodyManagement & SecretCustodyUse`：`bind`、`unbind`、`describe`、`list`、`use`。结果形状归 Settings 的 [secrets.ts](../../../../packages/assets/settings/src/secrets.ts)：读面不返回值；`use` 返回当前值，没有绑定答 `missing`，绑定已撤销答 `denied`，读不出答 `unavailable`。没有缓存：每次调用重读文件，所以 `setup --replace-credential`、Model 凭据插件的写入与本行的写入互相可见。

`model-credential` 行不经本行取值：它的插件在同一路径上自己打开保管库，并按 Model 的绑定键（`MODEL_FACTORY_SECRET_KEY`、`modelCredentialBindingKey`）与 Model 的判定解析。本行的管理面写同一个文件，Model 的行在下一次解析时读到。

## 受信键与发行登记

`settingsSecretCustody` 是受信名：只有受信表列出的行可以提供或注入它，根上取不到。装配页的受信表把它交给三行：本行提供，`settings` 行 `inject`（在它之上建秘密项入口），`tool-bindings` 行按调用读取（Web 附着解析 search 的 key）。Model 凭据插件不经它。

发行层（`config/serve.distribution.json`、`config/s0.distribution.json`、`src/s0/aa-rows.json`）把本行列在 `model-credential` 之后、`settings` 之前。次序有意：打开保管库要求文件已在路径上。本机单用户档由 `setup` 在 `serve` 之前建库；测试树没有 `setup`，由 `model-credential` 行的插件在空路径上建库，本行装载时打开同一个文件。本地操作档（`localOperatorLayer`）给本行 `path`，与 `model-credential` 同一路径。

## 验证入口

`tests/rows/secret-custody/secret-custody.spec.ts` 用测试自备的可见表装载本行与一个探针行：行声明；基线格式（没有 `version`）的文件经读面读出工厂秘密与租户凭据而读面不含值；经管理面写入后文件是版本 2 且保留 Model 的两条绑定；可见表不列出的行注入该键时装载失败；读不出的文件下读面 `unavailable`、写面 `not-written`、字节不变；配置 Schema；本地操作档在发行列出与不列出该行时的两种行为。

```sh
cd apps/harness-server && NO_COLOR=1 pnpm exec vitest run --mode fast tests/rows/secret-custody
```
