// 경매 OS 호환성 검증 설정을 확인하는 테스트
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = process.cwd()

function readProjectFile(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), 'utf8')
}

describe('auction OS compatibility verification config', () => {
  it('os-compat-config exposes a focused cross-browser and cross-OS auction check', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      scripts?: Record<string, string>
    }
    const playwrightConfig = readProjectFile('playwright.config.ts')
    const workflow = readProjectFile(
      '.github',
      'workflows',
      'auction-realtime-ci.yml',
    )

    expect(packageJson.scripts?.['test:e2e:auction:compat']).toBe(
      'playwright test playwright/auction-os-compatibility.spec.ts --project=chromium --workers=1',
    )
    expect(playwrightConfig).toContain("name: 'chromium'")
    expect(playwrightConfig).toContain("name: 'firefox'")
    expect(playwrightConfig).toContain("name: 'webkit'")
    expect(playwrightConfig).toContain("name: 'mobile-chrome'")
    expect(playwrightConfig).toContain("name: 'mobile-safari'")
    expect(workflow).toContain('ubuntu-latest')
    expect(workflow).toContain('windows-latest')
    expect(workflow).toContain('macos-latest')
    expect(workflow).toContain('playwright/auction-os-compatibility.spec.ts')
  })
})
