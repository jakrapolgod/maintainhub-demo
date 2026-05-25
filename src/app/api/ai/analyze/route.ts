import { openrouter } from '@/lib/ai-client'

export async function POST(request: Request) {
  const body = await request.json()
  const context: string = body.context ?? ''

  const res = await openrouter.chat.completions.create({
    model: 'anthropic/claude-sonnet-4-5',
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: `You are a CMMS analytics expert. Facility data: ${context}. Answer concisely in 2-3 sentences.`,
      },
      {
        role: 'user',
        content: body.question ?? 'Summarize the current facility status.',
      },
    ],
    stream: true,
  })

  return new Response(res.toReadableStream(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
