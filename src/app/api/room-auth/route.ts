import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const roomId = searchParams.get('roomId')
  const role = searchParams.get('role')
  const teamId = searchParams.get('teamId')
  const token = searchParams.get('token')

  if (!roomId || !role || !token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const cookieStore = await cookies()
  const cookieName = `room_auth_${roomId}`
  
  const authData = JSON.stringify({ role, teamId, token })
  
  cookieStore.set(cookieName, authData, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'lax', 
    path: '/' 
  })

  return NextResponse.redirect(new URL(`/room/${roomId}`, request.url))
}
