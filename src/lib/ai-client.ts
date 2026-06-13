import OpenAI from 'openai'

// Lazy singleton — avoids "Missing credentials" error during Next.js build-time
// static analysis (the constructor throws immediately when apiKey is undefined).
let cachedClient: OpenAI | null = null

function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY ?? 'not-configured',
      defaultHeaders: {
        'HTTP-Referer': 'https://maintainhub-demo.vercel.app',
        'X-Title': 'MaintainHub Demo',
      },
    })
  }
  return cachedClient
}

// Transparent proxy so existing callers (`openrouter.chat.completions.create(…)`)
// continue to work without any changes.
export const openrouter: OpenAI = new Proxy({} as OpenAI, {
  get(_t, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver)
  },
})

export const FREE_MODELS = {
  fast: 'google/gemini-2.0-flash-exp:free',
  reason: 'deepseek/deepseek-chat:free',
  default: 'openrouter/auto:free',
}
