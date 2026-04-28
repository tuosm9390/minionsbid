'use server'

import { adminDb } from '@/lib/firebaseAdmin'
import * as admin from 'firebase-admin'

const VALID_ROLES = ['ORGANIZER', 'LEADER', 'VIEWER', 'SYSTEM', 'NOTICE'] as const

async function publishLiveMessage(
  roomId: string,
  message: {
    sender_name: string
    sender_role: string
    content: string
  },
): Promise<void> {
  const db = admin.database()
  await db.ref(`signals/${roomId}/latestMessage`).set({
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    room_id: roomId,
    sender_name: message.sender_name,
    sender_role: message.sender_role,
    content: message.content,
    created_at: new Date().toISOString(),
    at: Date.now(),
  })
}

/** 일반 채팅 메시지 전송 */
export async function sendChatMessage(
  roomId: string,
  senderName: string,
  senderRole: string,
  content: string,
): Promise<{ error?: string }> {
  if (!content.trim() || content.length > 200) return { error: '유효하지 않은 메시지' }
  const safeSenderRole = (VALID_ROLES as readonly string[]).includes(senderRole)
    ? senderRole
    : 'VIEWER'

  try {
    const trimmedContent = content.trim()
    await Promise.all([
      adminDb
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .add({
          sender_name: senderName,
          sender_role: safeSenderRole,
          content: trimmedContent,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        }),
      publishLiveMessage(roomId, {
        sender_name: senderName,
        sender_role: safeSenderRole,
        content: trimmedContent,
      }),
    ])
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}

/** 공지 전송 (ORGANIZER 전용 UI) */
export async function sendNotice(
  roomId: string,
  content: string,
): Promise<{ error?: string }> {
  if (!content.trim() || content.length > 200) return { error: '유효하지 않은 공지' }

  try {
    const trimmedContent = content.trim()
    await Promise.all([
      adminDb
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .add({
          sender_name: '주최자',
          sender_role: 'NOTICE',
          content: trimmedContent,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        }),
      publishLiveMessage(roomId, {
        sender_name: '주최자',
        sender_role: 'NOTICE',
        content: trimmedContent,
      }),
    ])
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}
