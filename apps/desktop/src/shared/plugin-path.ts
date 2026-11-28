/** Where a page takes the files of a plugin from: under the bridge, because the login cookie travels only there. */
export const PLUGIN_FILES = '/bridge/plugins/'

export const pluginFilePath = (name: string, version: string, path: string): string =>
  `${PLUGIN_FILES}${name}/${version}/${path}`
