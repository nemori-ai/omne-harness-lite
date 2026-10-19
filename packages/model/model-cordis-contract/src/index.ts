// The root entry exports types only and does not import Cordis. The Cordis definitions are at `./cordis`.
export type {
  ModelConverterAuthority,
  ModelConverterRegistration,
  ModelConverterRegistrationInput,
  ModelPublication,
  ModelPublicationAuthority,
  ModelRegistration,
  ModelRegistrationFailure,
  ModelRegistrationInput,
} from './registration.ts'
