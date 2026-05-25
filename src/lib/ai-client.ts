import OpenAI from 'openai'

export const openrouter = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://maintainhub-demo.vercel.app',
    'X-Title': 'MaintainHub Demo',
  },
})

export const FREE_MODELS = {
  fast: 'google/gemini-2.0-flash-exp:free',
  reason: 'deepseek/deepseek-chat:free',
  default: 'openrouter/auto:free',
}
