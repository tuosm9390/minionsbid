import 'dotenv/config'
import { adminDb } from '@/lib/firebaseAdmin'
import { syncLeagueDeeplolSchedule } from '@/features/deeplol/deeplolSync'
import {
  notifyDeeplolBatchSummary,
  notifyDeeplolBatchFatalError,
} from '@/features/notifications/discordWebhook'

const WRITE_MODE = process.argv.includes('--write')
const INCLUDE_COMPLETED = process.argv.includes('--include-completed')
const FAIL_FAST = process.argv.includes('--fail-fast')
const LIMIT = parsePositiveInt('--limit')
const TARGET_SCHEDULE_ID = readOption('--schedule-id')

function parsePositiveInt(option: string) {
  const index = process.argv.indexOf(option)
  if (index < 0) return null
  const value = Number(process.argv[index + 1])
  return Number.isInteger(value) && value > 0 ? value : null
}

function readOption(option: string) {
  const index = process.argv.indexOf(option)
  if (index < 0) return null
  const value = process.argv[index + 1]?.trim()
  return value || null
}

function printUsage() {
  console.log(`Usage: pnpm sync:deeplol -- [options]\n\nOptions:\n  --write                  실제 Deeplol 조회 및 Firestore 저장 실행\n  --schedule-id <id>      특정 리그 일정만 실행\n  --limit <n>              최대 처리 일정 수\n  --include-completed     COMPLETED 일정도 대상에 포함\n  --fail-fast              첫 일정 오류에서 즉시 종료\n`)
}

function toMillis(value: unknown) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') {
    const millis = new Date(value).getTime()
    return Number.isNaN(millis) ? 0 : millis
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') {
      const date = toDate()
      return date instanceof Date ? date.getTime() : 0
    }
  }
  return 0
}

async function loadMemberPuuIds(scheduleRef: FirebaseFirestore.DocumentReference) {
  const snapshot = await scheduleRef.collection('deeplol_participants').where('status', '==', 'ACTIVE').get()
  return Array.from(new Set(
    snapshot.docs
      .map((doc) => String(doc.data().puu_id ?? doc.data().puuId ?? doc.id).trim())
      .filter(Boolean),
  ))
}

async function main() {
  if (process.argv.includes('--help')) {
    printUsage()
    return
  }

  const schedulesRef = adminDb.collection('league_schedules')
  const snapshot = TARGET_SCHEDULE_ID
    ? await schedulesRef.where('__name__', '==', TARGET_SCHEDULE_ID).get()
    : await schedulesRef.get()

  const candidates = snapshot.docs
    .map((doc) => ({ doc, data: doc.data() }))
    .filter(({ data }) => INCLUDE_COMPLETED || data.status !== 'COMPLETED')
    .filter(({ data }) => typeof data.deeplol_tournament_name === 'string' && data.deeplol_tournament_name.trim())
    .sort((a, b) => toMillis(a.data.starts_at) - toMillis(b.data.starts_at))
    .slice(0, LIMIT ?? Number.MAX_SAFE_INTEGER)

  const summary = {
    mode: WRITE_MODE ? 'write' : 'dry-run',
    targetScheduleId: TARGET_SCHEDULE_ID,
    candidateCount: candidates.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    schedules: [] as Array<Record<string, unknown>>,
  }

  for (const { doc, data } of candidates) {
    const tournamentName = String(data.deeplol_tournament_name).trim()
    const memberPuuIds = Array.isArray(data.deeplol_member_puu_ids)
      ? data.deeplol_member_puu_ids.map(String).map((value) => value.trim()).filter(Boolean)
      : await loadMemberPuuIds(doc.ref)
    const uniqueMemberPuuIds = Array.from(new Set(memberPuuIds))
    const base = {
      scheduleId: doc.id,
      scheduleName: String(data.name ?? doc.id),
      tournamentName,
      memberCount: uniqueMemberPuuIds.length,
      startsAt: data.starts_at ?? null,
      endsAt: data.ends_at ?? null,
    }

    if (!WRITE_MODE) {
      summary.schedules.push({ ...base, status: 'DRY_RUN', wouldSync: uniqueMemberPuuIds.length > 0 })
      summary.processed += 1
      continue
    }

    if (uniqueMemberPuuIds.length === 0) {
      summary.schedules.push({ ...base, status: 'SKIPPED_NO_MEMBERS' })
      summary.processed += 1
      summary.failed += 1
      if (FAIL_FAST) throw new Error(`${doc.id}: 활성 Deeplol 참가자가 없습니다.`)
      continue
    }

    try {
      const result = await syncLeagueDeeplolSchedule(doc.id, {
        tournamentName,
        memberPuuIds: uniqueMemberPuuIds,
        platformId: String(data.deeplol_platform_id ?? 'KR'),
        pageSize: Number(data.deeplol_page_size ?? 20),
        maxAttempts: Number(data.deeplol_max_attempts ?? 3),
        lockLeaseSeconds: Number(data.deeplol_lock_lease_seconds ?? 120),
        timezone: String(data.deeplol_timezone ?? 'Asia/Seoul'),
      })
      summary.schedules.push({ ...base, status: 'COMPLETED', result })
      summary.succeeded += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      summary.schedules.push({ ...base, status: 'ERROR', error: message })
      summary.failed += 1
      if (FAIL_FAST) throw error
    } finally {
      summary.processed += 1
    }
  }

  console.log(JSON.stringify(summary, null, 2))
  if (WRITE_MODE) await notifyDeeplolBatchSummary(summary)
  if (summary.failed > 0) process.exitCode = 2
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error))
  if (WRITE_MODE) await notifyDeeplolBatchFatalError(error)
  process.exitCode = 1
})
