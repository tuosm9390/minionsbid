'use server'

import { adminDb } from '@/lib/firebaseAdmin'
import * as admin from 'firebase-admin'

const VALID_ROLES = ['ORGANIZER', 'LEADER', 'VIEWER', 'SYSTEM', 'NOTICE'] as const

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
    await adminDb
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .add({
        sender_name: senderName,
        sender_role: safeSenderRole,
        content: content.trim(),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      })
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
    await adminDb
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .add({
        sender_name: '주최자',
        sender_role: 'NOTICE',
        content: content.trim(),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      })
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: message }
  }
}
