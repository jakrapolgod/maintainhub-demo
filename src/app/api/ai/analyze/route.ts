import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

export async function POST(request: Request) {
  const body = await request.json()
  const context: string = body.context ?? ""

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: `You are a CMMS analytics expert. Facility data: ${context}. Answer concisely in 2-3 sentences.`,
    messages: [{ role: "user", content: body.question ?? "Summarize the current facility status." }],
  })

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
