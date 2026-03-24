<h1 align='center'>@onepunya/baileys</h1>

<div align='center'>

Fork dari [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API library dengan tambahan bot utilities oleh [Onepunya](https://onepunya.qzz.io).

![Version](https://img.shields.io/badge/version-1.0.0-orange)
![Based On](https://img.shields.io/badge/based%20on-Baileys%207.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## ✨ Apa yang Berbeda?

Fork ini menambahkan **bot utilities** yang memudahkan pembuatan bot WhatsApp tanpa perlu install library tambahan.

### Fitur Tambahan

| Fitur | Deskripsi |
|-------|-----------|
| `createBotSocket()` | Wrapper sock dengan helper methods bawaan |
| `downloadMedia()` | Download semua jenis media dengan mudah |
| `ReconnectManager` | Smart reconnect dengan exponential backoff |
| `MessageQueue` | Rate limiter untuk pengiriman pesan |
| `toJid()` / `fromJid()` | Helper format nomor WA |
| `getMessageText()` | Ambil teks dari semua jenis pesan |
| `getQuoted()` | Ambil quoted message |

---

## 📦 Instalasi

```bash
npm install github:onepunya/baileys
```

Atau clone langsung:

```bash
git clone https://github.com/onepunya/baileys.git
cd baileys
npm install
npm run build
```

---

## 🚀 Quick Start

### Tanpa Bot Utils (cara lama)

```js
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'

const { state, saveCreds } = await useMultiFileAuthState('session')
const sock = makeWASocket({ auth: state })

sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  const text = msg.message?.conversation || ''
  if (text === 'ping') {
    await sock.sendMessage(msg.key.remoteJid, { text: 'pong' }, { quoted: msg })
  }
})
```

### Dengan Bot Utils (cara baru)

```js
import makeWASocket, { useMultiFileAuthState, createBotSocket, ReconnectManager } from '@onepunya/baileys'

const reconnect = new ReconnectManager({
  maxRetries: 10,
  onReconnecting: (attempt, delay) => console.log(`Reconnecting... attempt ${attempt}`)
})

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const raw = makeWASocket({ auth: state })
  
  // Wrap dengan bot utils
  const sock = createBotSocket(raw, {
    messageDelay: 500,
    ownerNumbers: ['628xxxxxxxxx']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      reconnect.reset()
      console.log('Connected!')
    }
    if (connection === 'close') {
      reconnect.handle(lastDisconnect?.error, connect)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const text = sock.getText(msg)
    const from = msg.key.remoteJid!

    if (text === 'ping') await sock.reply(msg, 'pong! 🏓')
    if (text === 'hi') await sock.reply(msg, 'Halo! 👋')
  })
}

connect()
```

---

## 📚 API Reference

### `createBotSocket(sock, config?)`

Wrap makeWASocket dengan helper methods.

```js
const bot = createBotSocket(sock, {
  messageDelay: 500,      // Delay antar pesan (ms)
  ownerNumbers: ['628x'], // Nomor owner
})
```

#### Text Methods

```js
await bot.reply(msg, 'Halo!')
await bot.sendText(jid, 'Teks biasa')
await bot.replyMention(msg, 'Halo @user!', [jid1, jid2])
```

#### Media Methods

```js
// Kirim gambar dari URL atau buffer
await bot.sendImage(jid, 'https://example.com/img.jpg', 'Caption')
await bot.sendImage(jid, buffer, 'Caption')

// Kirim video
await bot.sendVideo(jid, 'https://example.com/video.mp4', 'Caption')

// Kirim audio
await bot.sendAudio(jid, buffer)

// Kirim voice note
await bot.sendVoice(jid, buffer)

// Kirim dokumen
await bot.sendDocument(jid, buffer, 'application/pdf', 'file.pdf', 'Caption')

// Kirim sticker
await bot.sendSticker(jid, buffer)
```

#### Presence Methods

```js
await bot.sendTyping(jid)    // Tampilkan typing...
await bot.sendRecording(jid) // Tampilkan recording...
await bot.stopTyping(jid)    // Stop typing
await bot.markRead(msg)      // Tandai pesan dibaca
```

#### React Methods

```js
await bot.react(msg, '👍')  // React dengan emoji
await bot.unreact(msg)       // Hapus react
```

#### Group Methods

```js
const members = await bot.getGroupMembers(jid)
const isAdm = await bot.isAdmin(jid, userId)
const isBotAdm = await bot.isBotAdmin(jid)
await bot.tagAll(jid, 'Perhatian semua!')
```

#### Utility Methods

```js
const text = bot.getText(msg)        // Ambil teks pesan
const type = bot.getMedia(msg)       // Ambil media type
const quoted = bot.getQuotedMsg(msg) // Ambil quoted message
const media = await bot.download(msg) // Download media
const owner = bot.isOwner(userId)    // Cek apakah owner
const jid = bot.toJid('628xxx')      // Format ke JID
const number = bot.fromJid(jid)      // Ambil nomor dari JID
```

### `downloadMedia(msg)`

Download media dari pesan, kembalikan `{ buffer, mimetype, ext, size, filename }`.

```js
import { downloadMedia } from '@onepunya/baileys'

const media = await downloadMedia(msg)
if (media) {
  console.log(media.mimetype) // image/jpeg
  console.log(media.size)     // 12345
  // media.buffer siap digunakan
}
```

### `ReconnectManager`

Smart reconnect dengan exponential backoff.

```js
import { ReconnectManager } from '@onepunya/baileys'

const reconnect = new ReconnectManager({
  maxRetries: 10,
  initialDelay: 2000,
  maxDelay: 60000,
  factor: 1.5,
  onReconnecting: (attempt, delay) => {
    console.log(`Retry ${attempt} in ${delay}ms`)
  },
  onConnected: () => console.log('Connected!'),
  onFailed: () => console.log('Max retries reached'),
})

// Di connection.update:
if (connection === 'close') {
  reconnect.handle(lastDisconnect?.error, connect)
}
if (connection === 'open') {
  reconnect.reset()
}
```

### `MessageQueue`

Rate limiter untuk kirim pesan.

```js
import { MessageQueue } from '@onepunya/baileys'

const queue = new MessageQueue(500) // 500ms delay

await queue.add(() => sock.sendMessage(jid1, { text: 'msg 1' }))
await queue.add(() => sock.sendMessage(jid2, { text: 'msg 2' }))
// Pesan dikirim dengan jeda 500ms
```

---

## ⚠️ Disclaimer

Fork ini tidak berafiliasi dengan WhatsApp. Gunakan dengan bijak sesuai Terms of Service WhatsApp.

Berdasarkan [Baileys](https://github.com/WhiskeySockets/Baileys) oleh WhiskeySockets.

---

<div align='center'>Made with ❤️ by <a href='https://onepunya.qzz.io'>Onepunya</a></div>
