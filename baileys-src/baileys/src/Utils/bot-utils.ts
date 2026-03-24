/**
 * Onepunya Bot Utils
 * Helper functions untuk mempermudah pembuatan bot WhatsApp
 */

import { createReadStream } from 'fs'
import { Readable } from 'stream'
import { proto } from '../../WAProto/index.js'
import { downloadMediaMessage } from './messages-media.js'
import type { WAMessage, MediaType } from '../Types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DownloadedMedia {
	buffer: Buffer
	mimetype: string
	ext: string
	size: number
	filename?: string
}

export interface BotMessage {
	from: string
	sender: string
	pushname: string
	body: string
	isGroup: boolean
	isOwner: boolean
	isPremium: boolean
	mediaType: string | null
	raw: WAMessage
	quoted: WAMessage | null
}

// ─── JID Helpers ─────────────────────────────────────────────────────────────

/** Format nomor HP ke JID WhatsApp */
export const toJid = (number: string): string => {
	const clean = number.replace(/[^0-9]/g, '').replace(/^0/, '62')
	return `${clean}@s.whatsapp.net`
}

/** Format nomor grup ke JID grup */
export const toGroupJid = (id: string): string => {
	return id.includes('@') ? id : `${id}@g.us`
}

/** Ambil nomor dari JID */
export const fromJid = (jid: string): string => {
	return jid.split('@')[0]
}

/** Cek apakah JID adalah grup */
export const isGroup = (jid: string): boolean => {
	return jid.endsWith('@g.us')
}

// ─── Message Helpers ──────────────────────────────────────────────────────────

/** Ambil teks dari semua jenis pesan */
export const getMessageText = (msg: WAMessage): string => {
	const m = msg.message
	if (!m) return ''
	return (
		m.conversation ||
		m.extendedTextMessage?.text ||
		m.imageMessage?.caption ||
		m.videoMessage?.caption ||
		m.documentMessage?.caption ||
		m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
		m.buttonsResponseMessage?.selectedDisplayText ||
		m.listResponseMessage?.title ||
		m.templateButtonReplyMessage?.selectedDisplayText ||
		''
	)
}

/** Ambil tipe media dari pesan */
export const getMediaType = (msg: WAMessage): MediaType | null => {
	const m = msg.message
	if (!m) return null
	if (m.imageMessage) return 'image'
	if (m.videoMessage) return 'video'
	if (m.audioMessage) return 'audio'
	if (m.documentMessage) return 'document'
	if (m.stickerMessage) return 'sticker'
	if (m.documentWithCaptionMessage) return 'document'
	return null
}

/** Ambil quoted message */
export const getQuoted = (msg: WAMessage): WAMessage | null => {
	const ctx = msg.message?.extendedTextMessage?.contextInfo ||
		msg.message?.imageMessage?.contextInfo ||
		msg.message?.videoMessage?.contextInfo ||
		msg.message?.audioMessage?.contextInfo ||
		msg.message?.documentMessage?.contextInfo ||
		msg.message?.stickerMessage?.contextInfo

	if (!ctx?.quotedMessage) return null

	return {
		key: {
			remoteJid: msg.key.remoteJid,
			fromMe: ctx.participant === msg.key.participant,
			id: ctx.stanzaId,
			participant: ctx.participant
		},
		message: ctx.quotedMessage
	} as WAMessage
}

/** Ambil mimetype dari pesan */
export const getMimetype = (msg: WAMessage): string => {
	const m = msg.message
	if (!m) return ''
	return (
		m.imageMessage?.mimetype ||
		m.videoMessage?.mimetype ||
		m.audioMessage?.mimetype ||
		m.documentMessage?.mimetype ||
		m.stickerMessage?.mimetype ||
		''
	)
}

/** Ambil filename dari pesan dokumen */
export const getFilename = (msg: WAMessage): string => {
	const m = msg.message
	if (!m) return ''
	return m.documentMessage?.fileName || m.documentWithCaptionMessage?.message?.documentMessage?.fileName || ''
}

// ─── Media Download ───────────────────────────────────────────────────────────

/** Download media dari pesan dengan cara yang lebih simpel */
export const downloadMedia = async (
	msg: WAMessage,
	logger?: any
): Promise<DownloadedMedia | null> => {
	const mediaType = getMediaType(msg)
	if (!mediaType) return null

	try {
		const buffer = await downloadMediaMessage(
			msg,
			'buffer',
			{},
			{ logger, reuploadRequest: async () => msg }
		) as Buffer

		const mimetype = getMimetype(msg)
		const ext = mimetype.split('/')[1]?.split(';')[0] || 'bin'
		const filename = getFilename(msg)

		return {
			buffer,
			mimetype,
			ext,
			size: buffer.length,
			filename
		}
	} catch (err) {
		return null
	}
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

/** Format bytes ke ukuran yang readable */
export const formatSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/** Format durasi detik ke mm:ss */
export const formatDuration = (seconds: number): string => {
	const m = Math.floor(seconds / 60)
	const s = Math.floor(seconds % 60)
	return `${m}:${s.toString().padStart(2, '0')}`
}

/** Escape karakter khusus WhatsApp */
export const escapeMarkdown = (text: string): string => {
	return text.replace(/[_*~`]/g, '\\$&')
}

// ─── Reconnect Helper ─────────────────────────────────────────────────────────

export interface ReconnectConfig {
	maxRetries?: number
	initialDelay?: number
	maxDelay?: number
	factor?: number
	onRetry?: (attempt: number, delay: number) => void
}

/** Exponential backoff reconnect helper */
export const createReconnectStrategy = (config: ReconnectConfig = {}) => {
	const {
		maxRetries = 10,
		initialDelay = 1000,
		maxDelay = 30000,
		factor = 2,
		onRetry
	} = config

	let attempt = 0

	return {
		shouldReconnect: (statusCode: number): boolean => {
			// 401 = logged out, jangan reconnect
			if (statusCode === 401) return false
			return attempt < maxRetries
		},
		getDelay: (): number => {
			const delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay)
			attempt++
			onRetry?.(attempt, delay)
			return delay
		},
		reset: () => {
			attempt = 0
		},
		getAttempt: () => attempt
	}
}

// ─── Queue Helper ─────────────────────────────────────────────────────────────

/** Queue untuk rate limiting pengiriman pesan */
export class MessageQueue {
	private queue: Array<() => Promise<any>> = []
	private processing = false
	private delay: number

	constructor(delayMs = 500) {
		this.delay = delayMs
	}

	add<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					resolve(await fn())
				} catch (err) {
					reject(err)
				}
			})
			if (!this.processing) this.process()
		})
	}

	private async process() {
		this.processing = true
		while (this.queue.length > 0) {
			const fn = this.queue.shift()!
			await fn()
			if (this.queue.length > 0) {
				await new Promise(r => setTimeout(r, this.delay))
			}
		}
		this.processing = false
	}

	get size() {
		return this.queue.length
	}

	clear() {
		this.queue = []
	}
}
