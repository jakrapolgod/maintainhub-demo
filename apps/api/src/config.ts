import { config as dotenvLoad } from 'dotenv'
import { resolve } from 'node:path'
import { z } from 'zod'

// Load env files before Zod parse.
// In TS→CJS compilation all requires are hoisted, then statements execute in order,
// so dotenvLoad() runs before z.object().parse(process.env) below.
// Tries workspace-root .env first (dev), then local .env (CI / containers).
dotenvLoad({ path: resolve(process.cwd(), '../../.env'), override: false })
dotenvLoad({ path: resolve(process.cwd(), '.env'), override: false })

// ── Schema ────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // PostgreSQL — Prisma reads DATABASE_URL directly; we validate it exists here
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // CORS — comma-separated origins, or "*" to allow all
  CORS_ORIGINS: z.string().default('*'),

  // JWT — both secrets required; generate with: openssl rand -hex 32
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be ≥32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be ≥32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // SMTP (Nodemailer) — defaults work with Mailpit on pnpm dev:infra
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  // 'true' → TLS from the start (port 465); 'false' → plain / STARTTLS
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('"MaintainHub" <noreply@maintainhub.local>'),

  // Frontend base URL — used to build invitation accept links in emails
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Anthropic — optional until AI routes are wired up
  ANTHROPIC_API_KEY: z.string().optional(),

  // MinIO — S3-compatible object storage for attachments
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  MINIO_USE_SSL: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin_dev_secret'),
  MINIO_BUCKET_NAME: z.string().default('maintainhub'),

  // Socket.io — CORS origins for WebSocket handshake (same format as CORS_ORIGINS)
  WS_ORIGINS: z.string().default('*'),

  // Meilisearch — full-text search for assets
  MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
  MEILISEARCH_KEY: z.string().default(''),
})

export type Config = z.infer<typeof envSchema>

// ── Parse & export ────────────────────────────────────────────────────────────

function parseConfig(): Config {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    // Print a clear diff of what is wrong before crashing
    console.error('❌  Invalid environment variables:\n')
    for (const [field, messages] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${field}: ${(messages as string[]).join(', ')}`)
    }
    console.error(
      '\nCopy .env.example → apps/api/.env (or workspace root .env) and fill in the required values.\n',
    )
    process.exit(1)
  }
  return result.data
}

export const config = parseConfig()
