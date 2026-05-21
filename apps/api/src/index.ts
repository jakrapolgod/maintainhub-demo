import { buildApp } from './app'
import { config } from './config'

const SHUTDOWN_TIMEOUT_MS = 10_000

async function main(): Promise<void> {
  const app = buildApp()

  // ── Graceful shutdown ────────────────────────────────────────────────────
  // Registered before listen() so signals received during startup are handled.

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutdown signal received — draining in-flight requests')

    // Force-kill if graceful shutdown exceeds the timeout.
    // Covers stuck DB queries, runaway jobs, etc.
    const forceExit = setTimeout(() => {
      app.log.error(
        { timeoutMs: SHUTDOWN_TIMEOUT_MS },
        'Graceful shutdown timed out — forcing exit',
      )
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)

    // clearTimeout is a no-op if forceExit already fired, so this is safe.
    forceExit.unref()

    try {
      // Stops accepting new connections, waits for in-flight requests,
      // then runs all onClose hooks (Prisma.$disconnect, redis.quit, …).
      await app.close()
      clearTimeout(forceExit)
      app.log.info('Server shut down cleanly')
      process.exit(0)
    } catch (err) {
      clearTimeout(forceExit)
      app.log.error({ err }, 'Error during graceful shutdown')
      process.exit(1)
    }
  }

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })

  // Emit unhandled rejections as fatal log entries instead of silent crashes.
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ reason }, 'Unhandled promise rejection')
    process.exit(1)
  })

  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'Uncaught exception')
    process.exit(1)
  })

  // ── Start server ─────────────────────────────────────────────────────────
  try {
    await app.listen({ port: config.API_PORT, host: config.API_HOST })
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start server')
    process.exit(1)
  }
}

void main()
