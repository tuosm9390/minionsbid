import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const roomId = searchParams.get('roomId')
  const role = searchParams.get('role')
  // URL parameters that are empty strings will be parsed as "" by URLSearchParams
  // which is truthy. We want undefined/null if they aren't provided.
  let teamId = searchParams.get('teamId')
  if (teamId === 'undefined' || teamId === 'null' || teamId === '') {
    teamId = null
  }
  const token = searchParams.get('token')

  if (!roomId || !role || !token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const cookieStore = await cookies()
  const cookieName = `room_auth_${roomId}`
  
  // JSON stringify converts undefined to undefined in objects, which is removed, 
  // but let's be explicit and pass null for the teamId if it's missing.
  const authData = JSON.stringify({ role, teamId: teamId || null, token })
  
  cookieStore.set(cookieName, authData, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'lax', 
    path: '/' 
  })

  return NextResponse.redirect(new URL(`/room/${roomId}`, request.url))
}
