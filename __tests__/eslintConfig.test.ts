// ESLint 설정과 `.omo` evidence 정책을 확인하는 테스트
import { describe, expect, it } from 'vitest'

describe('eslint config', () => {
  it(
    'ignores .omo evidence and relaxes require imports for operational scripts',
    async () => {
      const configModule = await import('../eslint.config.mjs')
      const eslintConfig = configModule.default as Array<{
        ignores?: string[]
        files?: string | string[]
        rules?: Record<string, unknown>
      }>

      const ignoreGroups = eslintConfig.flatMap((entry) => entry.ignores ?? [])
      expect(ignoreGroups).toContain('.omo/**')

      const scriptOverride = eslintConfig.find((entry) => {
        if (!entry.files) return false
        return Array.isArray(entry.files)
          ? entry.files.includes('scripts/**/*.js')
          : entry.files === 'scripts/**/*.js'
      })

      expect(
        scriptOverride?.rules?.['@typescript-eslint/no-require-imports'],
      ).toBe('off')
    },
    10000,
  )
})
