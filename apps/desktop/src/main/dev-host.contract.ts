/** What only the dev profile does: its own user data, and a page reload when the page is rebuilt. */
export type DevelopmentHost = Readonly<{
  userDataSuffix: string
  watchPage(pageRoot: string, reload: () => void): void
}>
