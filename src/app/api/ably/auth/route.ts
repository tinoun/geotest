import Ably from 'ably'
import { NextRequest, NextResponse } from 'next/server'

const rest = new Ably.Rest(process.env.ABLY_API_KEY!)

export async function POST(req: NextRequest) {
  const { clientId } = await req.json()
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId,
    capability: { '*': ['subscribe', 'publish', 'presence', 'history'] }
  })
  return NextResponse.json(tokenRequest)
}
