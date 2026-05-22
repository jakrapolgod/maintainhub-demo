import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(request: Request) {
  const body = await request.json()
  const period: string = body.period ?? 'month'

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    system: `You are a maintenance manager. Write a concise ${period} report summary in 3 sections: Performance, Issues, Recommendations. Use bullet points.`,
    messages: [
      {
        role: 'user',
        content: `Generate a ${period} maintenance report based on this data: ${JSON.stringify(body.data ?? {})}`,
      },
    ],
  })

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
