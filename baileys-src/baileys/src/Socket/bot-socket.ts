/**
 * Onepunya Bot Socket Extensions
 * Extends makeWASocket dengan helper methods untuk bot
 */

import type { proto } from '../../WAProto/index.js'
import type { WAMessage, AnyMessageContent, MiscMessageGenerationOptions } from '../Types'
import {
	toJid,
	fromJid,
	isGroup,
	getMessageText,
	getMediaType,
	getQuoted,
	downloadMedia,
	DownloadedMedia,
	MessageQueue,
	createReconnectStrategy,
	ReconnectConfig
} from '../Utils/bot-utils.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotSocketConfig {
	/** Delay antar pesan dalam ms (default: 500) */
	messageDelay?: number
	/** Config reconnect */
	reconnect?: ReconnectConfig
	/** Owner numbers */
	ownerNumbers?: string[]
}

export interface SendOptions extends MiscMessageGenerationOptions {
	quoted?: WAMessage
}

// ─── Bot Socket Factory ───────────────────────────────────────────────────────

/**
 * Wrap sock dengan helper methods
 * 
 * @example
 * const sock = makeWASocket(config)
 * const bot = createBotSocket(sock, { messageDelay: 500 })
 * 
 * // Kirim text
 * await bot.reply(msg, 'Halo!')
 * 
 * // Download media
 * const media = await bot.downloadMedia(msg)
 */
export const createBotSocket = (sock: any, config: BotSocketConfig = {}) => {
	const { messageDelay = 500, ownerNumbers = [] } = config
	const queue = new MessageQueue(messageDelay)

	// ─── Helpers ───────────────────────────────────────────────────────────────

	/** Kirim pesan dengan queue (rate limited) */
	const send = (jid: string, content: AnyMessageContent, options?: SendOptions) => {
		return queue.add(() => sock.sendMessage(jid, content, options))
	}

	// ─── Text ─────────────────────────────────────────────────────────────────

	/** Kirim text */
	const sendText = (jid: string, text: string, options?: SendOptions) =>
		send(jid, { text }, options)

	/** Reply ke pesan */
	const reply = (msg: WAMessage, text: string) =>
		send(msg.key.remoteJid!, { text }, { quoted: msg })

	/** Reply dengan mention */
	const replyMention = (msg: WAMessage, text: string, jids: string[]) =>
		send(msg.key.remoteJid!, { text, mentions: jids }, { quoted: msg })

	// ─── Media ────────────────────────────────────────────────────────────────

	/** Kirim gambar */
	const sendImage = (
		jid: string,
		image: Buffer | string,
		caption = '',
		options?: SendOptions
	) => {
		const content: AnyMessageContent = typeof image === 'string'
			? { image: { url: image }, caption }
			: { image, caption }
		return send(jid, content, options)
	}

	/** Kirim video */
	const sendVideo = (
		jid: string,
		video: Buffer | string,
		caption = '',
		options?: SendOptions
	) => {
		const content: AnyMessageContent = typeof video === 'string'
			? { video: { url: video }, caption }
			: { video, caption }
		return send(jid, content, options)
	}

	/** Kirim audio */
	const sendAudio = (
		jid: string,
		audio: Buffer | string,
		ptt = false,
		options?: SendOptions
	) => {
		const content: AnyMessageContent = typeof audio === 'string'
			? { audio: { url: audio }, mimetype: 'audio/mpeg', ptt }
			: { audio, mimetype: 'audio/mpeg', ptt }
		return send(jid, content, options)
	}

	/** Kirim voice note */
	const sendVoice = (jid: string, audio: Buffer | string, options?: SendOptions) =>
		sendAudio(jid, audio, true, options)

	/** Kirim dokumen */
	const sendDocument = (
		jid: string,
		document: Buffer | string,
		mimetype: string,
		fileName: string,
		caption = '',
		options?: SendOptions
	) => {
		const content: AnyMessageContent = typeof document === 'string'
			? { document: { url: document }, mimetype, fileName, caption }
			: { document, mimetype, fileName, caption }
		return send(jid, content, options)
	}

	/** Kirim sticker */
	const sendSticker = (jid: string, sticker: Buffer | string, options?: SendOptions) => {
		const content: AnyMessageContent = typeof sticker === 'string'
			? { sticker: { url: sticker } }
			: { sticker }
		return send(jid, content, options)
	}

	// ─── Typing & Presence ────────────────────────────────────────────────────

	/** Tampilkan typing indicator */
	const sendTyping = async (jid: string) => {
		await sock.sendPresenceUpdate('composing', jid)
	}

	/** Tampilkan recording indicator */
	const sendRecording = async (jid: string) => {
		await sock.sendPresenceUpdate('recording', jid)
	}

	/** Stop typing indicator */
	const stopTyping = async (jid: string) => {
		await sock.sendPresenceUpdate('paused', jid)
	}

	/** Kirim read receipt */
	const markRead = async (msg: WAMessage) => {
		await sock.readMessages([msg.key])
	}

	// ─── React ────────────────────────────────────────────────────────────────

	/** React ke pesan dengan emoji */
	const react = (msg: WAMessage, emoji: string) =>
		send(msg.key.remoteJid!, {
			react: { text: emoji, key: msg.key }
		})

	/** Hapus react */
	const unreact = (msg: WAMessage) => react(msg, '')

	// ─── Group ────────────────────────────────────────────────────────────────

	/** Ambil list member grup */
	const getGroupMembers = async (jid: string): Promise<string[]> => {
		const meta = await sock.groupMetadata(jid)
		return meta.participants.map((p: any) => p.id)
	}

	/** Cek apakah user adalah admin grup */
	const isAdmin = async (jid: string, userId: string): Promise<boolean> => {
		const meta = await sock.groupMetadata(jid)
		const participant = meta.participants.find((p: any) => p.id === userId)
		return participant?.admin === 'admin' || participant?.admin === 'superadmin'
	}

	/** Cek apakah bot adalah admin grup */
	const isBotAdmin = async (jid: string): Promise<boolean> => {
		const botId = sock.user?.id || ''
		return isAdmin(jid, botId)
	}

	/** Mention semua member grup */
	const tagAll = async (jid: string, text = '') => {
		const members = await getGroupMembers(jid)
		const mentions = members
		const mentionText = members.map(m => `@${fromJid(m)}`).join(' ')
		return send(jid, { text: `${text}\n${mentionText}`, mentions })
	}

	// ─── Message Utils ────────────────────────────────────────────────────────

	/** Ambil teks dari pesan */
	const getText = (msg: WAMessage) => getMessageText(msg)

	/** Ambil media type dari pesan */
	const getMedia = (msg: WAMessage) => getMediaType(msg)

	/** Ambil quoted message */
	const getQuotedMsg = (msg: WAMessage) => getQuoted(msg)

	/** Download media dari pesan */
	const download = (msg: WAMessage): Promise<DownloadedMedia | null> =>
		downloadMedia(msg, sock.logger)

	/** Cek apakah user adalah owner */
	const isOwner = (userId: string): boolean => {
		const clean = userId.replace(/[^0-9]/g, '')
		return ownerNumbers.some(n => n.replace(/[^0-9]/g, '') === clean)
	}

	// ─── Return ───────────────────────────────────────────────────────────────

	return {
		// Original sock
		...sock,

		// Text
		sendText,
		reply,
		replyMention,

		// Media
		sendImage,
		sendVideo,
		sendAudio,
		sendVoice,
		sendDocument,
		sendSticker,

		// Presence
		sendTyping,
		sendRecording,
		stopTyping,
		markRead,

		// React
		react,
		unreact,

		// Group
		getGroupMembers,
		isAdmin,
		isBotAdmin,
		tagAll,

		// Utils
		getText,
		getMedia,
		getQuotedMsg,
		download,
		isOwner,
		toJid,
		fromJid,
		queue,
	}
}

export type BotSocket = ReturnType<typeof createBotSocket>
