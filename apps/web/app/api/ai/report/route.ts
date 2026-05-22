export async function POST(request: Request) {
  const body = await request.json()
  const period: string = body.period ?? 'month'

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      stream: true,
      system: `You are a maintenance manager. Write a concise ${period} report summary in 3 sections: Performance, Issues, Recommendations. Use bullet points.`,
      messages: [
        {
          role: 'user',
          content: `Generate a ${period} maintenance report based on this data: ${JSON.stringify(body.data ?? {})}`,
        },
      ],
    }),
  })

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of decoder.decode(value).split('\n')) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') continue
            try {
              const event = JSON.parse(payload)
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                controller.enqueue(encoder.encode(event.delta.text))
              }
            } catch {
              // skip malformed lines
            }
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
