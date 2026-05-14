// 경매 표시 유틸의 티어 이미지 매핑을 검증한다.
import { describe, expect, it } from 'vitest'
import { getExactTierImage } from '@/features/auction/utils/display'

describe('display utils', () => {
  it('정확히 매칭되는 티어만 이미지 경로를 반환한다', () => {
    expect(getExactTierImage('플레티넘')).toBe('/Rank=Platinum.png')
    expect(getExactTierImage('플래티넘')).toBe('/Rank=Platinum.png')
    expect(getExactTierImage('마스터')).toBe('/Rank=Master.png')
  })

  it('범위형 또는 임의 텍스트 티어는 이미지 없이 텍스트 표시 대상으로 둔다', () => {
    expect(getExactTierImage('마스터 이상')).toBeNull()
    expect(getExactTierImage('실버 이하')).toBeNull()
    expect(getExactTierImage('아브실')).toBeNull()
    expect(getExactTierImage('롤체가 뭔지 모름')).toBeNull()
  })
})
