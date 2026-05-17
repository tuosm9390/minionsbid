type BulyResponse = {
  result?: 'Y' | 'N' | boolean
  url?: string
  message?: string
}

export async function createBulyShortUrl(orgUrl: string): Promise<string> {
  const customerId = process.env.BULY_CUSTOMER_ID || 'tuosm9390'
  const partnerApiId = process.env.BULY_PARTNER_API_ID
  const apiUrl = process.env.BULY_API_URL || 'https://www.buly.kr/api/shoturl.siso'

  if (!partnerApiId) {
    throw new Error('BULY_PARTNER_API_ID 환경변수가 설정되지 않았습니다.')
  }

  const body = new URLSearchParams({
    customer_id: customerId,
    partner_api_id: partnerApiId,
    org_url: orgUrl,
  })

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })

  const data = (await response.json().catch(() => null)) as BulyResponse | null
  const success = data?.result === 'Y' || data?.result === true

  if (!response.ok || !success || !data?.url) {
    throw new Error(data?.message || 'Buly 단축 URL 생성에 실패했습니다.')
  }

  return data.url
}
