import OpenAI from 'openai'

export const openrouter = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://maintainhub-demo.vercel.app',
    'X-Title': 'MaintainHub Demo',
  },
})
