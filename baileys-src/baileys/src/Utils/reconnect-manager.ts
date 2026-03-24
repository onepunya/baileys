/**
 * Onepunya Reconnect Manager
 * Smart reconnect dengan exponential backoff
 */

import { DisconnectReason } from '../Types'
import { Boom } from '@hapi/boom'

export interface ReconnectManagerConfig {
	maxRetries?: number
	initialDelay?: number
	maxDelay?: number
	factor?: number
	logger?: any
	onReconnecting?: (attempt: number, delay: number) => void
	onConnected?: () => void
	onFailed?: () => void
}

export class ReconnectManager {
	private attempt = 0
	private config: Required<Omit<ReconnectManagerConfig, 'logger' | 'onReconnecting' | 'onConnected' | 'onFailed'>>
	private callbacks: Pick<ReconnectManagerConfig, 'onReconnecting' | 'onConnected' | 'onFailed'>
	private logger: any
	private timer: NodeJS.Timeout | null = null

	constructor(config: ReconnectManagerConfig = {}) {
		this.config = {
			maxRetries: config.maxRetries ?? 15,
			initialDelay: config.initialDelay ?? 2000,
			maxDelay: config.maxDelay ?? 60000,
			factor: config.factor ?? 1.5,
		}
		this.callbacks = {
			onReconnecting: config.onReconnecting,
			onConnected: config.onConnected,
			onFailed: config.onFailed,
		}
		this.logger = config.logger
	}

	/** Handle connection close event */
	handle(
		error: Error | undefined,
		connectFn: () => void
	): void {
		const statusCode = (error as Boom)?.output?.statusCode
		const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401
		const isRestart = statusCode === DisconnectReason.restartRequired

		// Jangan reconnect kalau logged out
		if (isLoggedOut) {
			this.logger?.warn('Session logged out, please re-authenticate')
			this.callbacks.onFailed?.()
			return
		}

		// Langsung reconnect kalau restart required
		if (isRestart) {
			this.attempt = 0
			this.logger?.info('Restart required, reconnecting immediately...')
			connectFn()
			return
		}

		// Cek max retries
		if (this.attempt >= this.config.maxRetries) {
			this.logger?.error(`Max retries (${this.config.maxRetries}) reached, giving up`)
			this.callbacks.onFailed?.()
			return
		}

		// Calculate delay dengan exponential backoff
		const delay = Math.min(
			this.config.initialDelay * Math.pow(this.config.factor, this.attempt),
			this.config.maxDelay
		)

		this.attempt++
		this.logger?.info(`Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.attempt}/${this.config.maxRetries})`)
		this.callbacks.onReconnecting?.(this.attempt, delay)

		// Clear timer sebelumnya
		if (this.timer) clearTimeout(this.timer)

		this.timer = setTimeout(() => {
			connectFn()
		}, delay)
	}

	/** Reset attempt counter (call on successful connection) */
	reset(): void {
		this.attempt = 0
		this.callbacks.onConnected?.()
	}

	/** Get current attempt */
	get currentAttempt(): number {
		return this.attempt
	}

	/** Destroy manager */
	destroy(): void {
		if (this.timer) clearTimeout(this.timer)
	}
}
