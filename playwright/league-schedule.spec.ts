import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/e2e/schedule-fixture/reset')
  expect(response.ok()).toBeTruthy()
})

test('creates a schedule, saves a match day, registers a result, and completes the schedule', async ({
  page,
}) => {
  await page.goto('/league-schedule')

  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-create-admin-code').fill('secret-code')
  await page.getByTestId('schedule-create-admin-verify').click()
  await expect(page.getByText('관리자 코드가 확인되었습니다.')).toBeVisible()

  await page.getByTestId('schedule-create-linked-auction').selectOption('archive-alpha')
  await page.getByTestId('schedule-create-name').fill('Fixture Playwright Run')
  await page.getByTestId('schedule-create-save').click()

  await expect(
    page.getByRole('heading', { name: 'Fixture Playwright Run' }),
  ).toBeVisible()

  await page.getByTestId('schedule-row-home-0').selectOption('Blue')
  await page.getByTestId('schedule-row-away-0').selectOption('Red')
  await page.getByTestId('schedule-save-day').click()

  await page.getByTestId('schedule-row-home-score-0').fill('2')
  await page.getByTestId('schedule-row-away-score-0').fill('0')
  await page.getByTestId('schedule-row-save-result-0').click()

  await page.getByTestId('schedule-current-complete').click()
  await page.getByTestId('schedule-complete-champion').selectOption('Blue')
  await page.getByTestId('schedule-complete-submit').click()

  await expect(page.getByText('최종 우승팀: Blue')).toBeVisible()
  await expect(page.getByText('종료됨')).toBeVisible()
})

test('keeps completed schedules locked until admin verification succeeds', async ({ page }) => {
  await page.goto('/league-schedule')

  await page.getByTestId('schedule-card-fixture-completed').click()

  await expect(page.getByText('Read-Only Mode')).toBeVisible()
  await expect(page.getByTestId('schedule-save-day')).toBeDisabled()

  await page.getByTestId('schedule-editor-admin-code').fill('secret-code')
  await page.getByTestId('schedule-editor-admin-verify').click()

  await expect(
    page.getByText('관리자 코드 확인됨. 완료 일정 편집이 열렸습니다.'),
  ).toBeVisible()
  await expect(page.getByTestId('schedule-save-day')).toBeEnabled()
})
