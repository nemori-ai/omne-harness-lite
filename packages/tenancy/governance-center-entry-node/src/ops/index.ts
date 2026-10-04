// 运维面（入口契约 S-25、S-26；https-json/1 S-20、S-21）。导入白名单：kernel-basis、storage 协议、offer-expiry、
// Node 内置、cordis、zod、本包 ../events.ts，以及本目录内文件。包的公开入口从 ../index.ts 导出，本文件只汇总本目录。
export {
  governanceCenterOpsPlugin,
  GovernanceCenterOpsConfigSchema,
  type GovernanceCenterOpsConfig,
} from './plugin.ts'
