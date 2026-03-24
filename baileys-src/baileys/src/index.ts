import makeWASocket from './Socket/index'

export * from '../WAProto/index.js'
export * from './Utils/index'
export * from './Types/index'
export * from './Defaults/index'
export * from './WABinary/index'
export * from './WAM/index'
export * from './WAUSync/index'

export type WASocket = ReturnType<typeof makeWASocket>
export { makeWASocket }
export default makeWASocket

// ─── Onepunya Bot Extensions ──────────────────────────────────────────────────
export * from './Utils/bot-utils'
export * from './Socket/bot-socket'
export * from './Utils/reconnect-manager'
