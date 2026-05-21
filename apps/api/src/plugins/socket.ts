/**
 * Socket.io plugin — attaches a Socket.io Server to the Fastify HTTP server
 * and decorates the instance with `fastify.io`.
 *
 * ## Authentication
 * Clients must send a valid JWT in `socket.handshake.auth.token`.
 * The middleware verifies it with the same @fastify/jwt plugin secret so the
 * browser client can reuse its existing access token for WS connections.
 *
 * ## Rooms
 * Work-order specific events are scoped to room `wo:{workOrderId}`.
 * Clients join by emitting `join:wo` with `{ workOrderId }`.
 *
 * ## Usage in route handlers
 *   request.server.io.to(`wo:${id}`).emit('comment:added', payload)
 */
import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** Socket.io server instance. */
    io: Server
  }
}

// ── Event contract (kept in one place for easy client codegen) ────────────────

export type WoSocketEvents = {
  'comment:added': {
    workOrderId: string
    comment: {
      id: string
      body: string
      authorId: string
      authorName: string
      authorAvatarUrl: string | null
      mentions: string[]
      createdAt: string
    }
  }
}

export default fp(
  async (fastify) => {
    const origins =
      config.WS_ORIGINS === '*' ? '*' : config.WS_ORIGINS.split(',').map((o) => o.trim())

    const io = new Server(fastify.server, {
      cors: { origin: origins, credentials: true },
      // Use polling + upgrade path for environments where WS is blocked
      transports: ['websocket', 'polling'],
    })

    // ── JWT auth middleware ────────────────────────────────────────────────────
    io.use((socket, next) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const token = (socket.handshake.auth as Record<string, unknown>).token as string | undefined
      if (!token) {
        next(new Error('Authentication token required'))
        return
      }
      try {
        // Verify with the same secret the HTTP routes use
        fastify.jwt.verify(token)
        next()
      } catch {
        next(new Error('Invalid or expired token'))
      }
    })

    // ── Room subscription ─────────────────────────────────────────────────────
    io.on('connection', (socket) => {
      fastify.log.debug({ socketId: socket.id }, 'WebSocket client connected')

      socket.on('join:wo', ({ workOrderId }: { workOrderId: string }) => {
        void socket.join(`wo:${workOrderId}`)
        fastify.log.debug({ socketId: socket.id, workOrderId }, 'Client joined WO room')
      })

      socket.on('leave:wo', ({ workOrderId }: { workOrderId: string }) => {
        void socket.leave(`wo:${workOrderId}`)
      })

      socket.on('disconnect', (reason) => {
        fastify.log.debug({ socketId: socket.id, reason }, 'WebSocket client disconnected')
      })
    })

    fastify.decorate('io', io)

    fastify.addHook('onClose', async () => {
      await io.close()
    })
  },
  { name: 'socket' },
)
