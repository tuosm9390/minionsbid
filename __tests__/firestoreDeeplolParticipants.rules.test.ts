import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const projectId = 'minionsbid-rules-test'
const scheduleId = 'schedule-rules-1'
const participantPath = `league_schedules/${scheduleId}/deeplol_participants/puu-1`

let testEnv: RulesTestEnvironment

function participantData() {
  return {
    puu_id: 'puu-1',
    riot_name: 'player-one',
    riot_tag: 'KR1',
    team_id: 'team-blue',
    team_name: 'Blue',
    position: 'Jungle',
    status: 'ACTIVE',
  }
}

describe('Firestore Rules: deeplol_participants', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
        port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
        rules: readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    })
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), participantPath), participantData())
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('allows an admin to read, update, and delete a participant mapping', async () => {
    const adminDb = testEnv.authenticatedContext('admin-user', { admin: true }).firestore()
    const participantRef = doc(adminDb, participantPath)

    await assertSucceeds(getDoc(participantRef))
    await assertSucceeds(updateDoc(participantRef, { status: 'INACTIVE' }))
    await assertSucceeds(deleteDoc(participantRef))
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const deletedSnapshot = await getDoc(doc(context.firestore(), participantPath))
      expect(deletedSnapshot.exists()).toBe(false)
    })
  })

  it('denies unauthenticated and non-admin reads', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore()
    const memberDb = testEnv.authenticatedContext('member-user', { admin: false }).firestore()

    await assertFails(getDoc(doc(anonymousDb, participantPath)))
    await assertFails(getDoc(doc(memberDb, participantPath)))
  })

  it('denies non-admin creation, update, and deletion', async () => {
    const memberDb = testEnv.authenticatedContext('member-user', { admin: false }).firestore()
    const participantRef = doc(memberDb, participantPath)
    const newParticipantRef = doc(memberDb, `league_schedules/${scheduleId}/deeplol_participants/puu-2`)

    await assertFails(setDoc(newParticipantRef, participantData()))
    await assertFails(updateDoc(participantRef, { status: 'INACTIVE' }))
    await assertFails(deleteDoc(participantRef))
  })
})
