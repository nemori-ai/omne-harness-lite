export {
  answerExtensions,
  createExtensionsAuthor,
  extensionsExecutor,
  extensionsToolModule,
} from './author.ts'
export { attachExtensionsSource, extensionsSourceOf } from './port.ts'
export type {
  ExtensionsCallSource,
  ExtensionsFaces,
  HeldSetting,
  HeldSettings,
  Placed,
  SettingPresence,
  SettingWritten,
} from './port.ts'
export {
  extensionsAdoption,
  extensionsCommandNames,
  extensionsContract,
  extensionsParameterCodec,
} from './protocol.ts'
export type { ExtensionsArguments, ExtensionsCommandName } from './protocol.ts'
