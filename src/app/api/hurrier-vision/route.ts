import { NextRequest, NextResponse } from 'next/server'

// Hurrier bills have a two-column layout that Tesseract cannot reliably parse:
// LEFT:  Large bold order number (#7086) takes ~40% width
// RIGHT: Small text — customer name, [pro badge], TEL: +974XXXXXXXXX, [address]
//
// Claude Vision reads the image semantically and correctly extracts the right column.

export async function POST(req: NextRequest) {
  try {
    const { imageData } = await req.json()
    if (!imageData) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    // Strip the data:image/...;base64, prefix if present
    const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData
    const mediaType = imageData.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `This is a Hurrier food delivery bill. It has a TWO-COLUMN layout:
- LEFT column: Large bold order number like #7086 (ignore this)
- RIGHT column: Small text with customer name, optional "pro" badge, TEL: phone number, optional address

Extract ONLY from the RIGHT column:
1. customerName: The customer's name above "TEL:". Skip the "pro" badge. If name is in Arabic, return empty string.
2. contactNumber: The phone number after "TEL:" — digits may be split across lines. Normalize to Qatar format +974XXXXXXXX (12 digits). Include the +974 prefix.

Ignore everything after the phone number (address, street, building info, etc.)

Respond with ONLY valid JSON, no other text, no markdown:
{"customerName":"...", "contactNumber":"+974XXXXXXXX"}`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', err)
      return NextResponse.json({ error: 'Vision API failed', detail: err }, { status: 502 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text?.trim() || ''

    // Parse the JSON response
    try {
      // Strip any markdown fences just in case
      const clean = text.replace(/```json?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(clean)
      return NextResponse.json({
        customerName: parsed.customerName || '',
        contactNumber: parsed.contactNumber || '',
      })
    } catch {
      // Try to extract from text directly
      const nameM = text.match(/"customerName"\s*:\s*"([^"]*)"/)
      const phoneM = text.match(/"contactNumber"\s*:\s*"([^"]*)"/)
      return NextResponse.json({
        customerName: nameM?.[1] || '',
        contactNumber: phoneM?.[1] || '',
      })
    }
  } catch (e: unknown) {
    console.error('Hurrier vision route error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
