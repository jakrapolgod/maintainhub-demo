import { openrouter, FREE_MODELS } from '@/lib/ai-client'

export async function POST(request: Request) {
  const body = await request.json()
  const period: string = body.period ?? 'month'

  const res = await openrouter.chat.completions.create({
    model: FREE_MODELS.reason,
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: `You are a maintenance manager. Write a concise ${period} report summary in 3 sections: Performance, Issues, Recommendations. Use bullet points.`,
      },
      {
        role: 'user',
        content: `Generate a ${period} maintenance report based on this data: ${JSON.stringify(body.data ?? {})}`,
      },
    ],
    stream: true,
  })

  return new Response(res.toReadableStream(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
