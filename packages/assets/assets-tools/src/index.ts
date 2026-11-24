export {
  answerExtensions,
  createExtensionsAuthor,
  extensionsExecutor,
  extensionsToolModule,
} from './author.ts'
export { attachExtensionsSource, extensionsSourceOf } from './port.ts'
export type { ExtensionsCallSource, ExtensionsFaces, Placed } from './port.ts'
export {
  extensionsAdoption,
  extensionsCommandNames,
  extensionsContract,
  extensionsParameterCodec,
} from './protocol.ts'
export type { ExtensionsArguments, ExtensionsCommandName } from './protocol.ts'
