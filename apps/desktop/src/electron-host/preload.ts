import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  HOST_IPC,
  OMNE_HOST_GLOBAL,
  type HostAnswer,
  type HostObserveEvent,
  type HostObserveReply,
  type HostSubscribeReply,
  type OmneHost,
} from '../shared/host-bridge.ts'

const observers = new Map<number, (event: string) => void>()
const early = new Map<number, string[]>()
const stateListeners = new Set<(state: string) => void>()
let opening = 0

ipcRenderer.on(HOST_IPC.observeEvent, (_event: IpcRendererEvent, event: HostObserveEvent) => {
  const listener = observers.get(event.id)
  if (listener !== undefined) listener(event.text)
  else if (opening > 0) early.set(event.id, [...(early.get(event.id) ?? []), event.text])
})

ipcRenderer.on(HOST_IPC.loginStateEvent, (_event: IpcRendererEvent, state: string) => {
  for (const listener of Array.from(stateListeners)) listener(state)
})

function attach(id: number, listener: (event: string) => void): void {
  observers.set(id, listener)
  for (const text of early.get(id) ?? []) listener(text)
  early.delete(id)
}

const host: OmneHost = {
  call: request => ipcRenderer.invoke(HOST_IPC.call, request) as Promise<HostAnswer>,
  login: credentials => ipcRenderer.invoke(HOST_IPC.login, credentials) as Promise<HostAnswer>,
  logout: () => ipcRenderer.invoke(HOST_IPC.logout) as Promise<HostAnswer>,
  async observe(request, listener) {
    opening += 1
    try {
      const reply = (await ipcRenderer.invoke(HOST_IPC.observe, request)) as HostObserveReply
      if ('refused' in reply) return undefined
      attach(reply.id, listener)
      return {
        close() {
          observers.delete(reply.id)
          void ipcRenderer.invoke(HOST_IPC.observeClose, reply.id).catch(() => {})
        },
      }
    } finally {
      opening -= 1
      if (opening === 0) early.clear()
    }
  },
  async loginState(listener) {
    stateListeners.add(listener)
    try {
      const reply = (await ipcRenderer.invoke(HOST_IPC.loginState)) as HostSubscribeReply
      if ('refused' in reply) {
        stateListeners.delete(listener)
        return undefined
      }
    } catch (failure) {
      stateListeners.delete(listener)
      throw failure
    }
    return {
      close() {
        stateListeners.delete(listener)
      },
    }
  },
}

contextBridge.exposeInMainWorld(OMNE_HOST_GLOBAL, host)
