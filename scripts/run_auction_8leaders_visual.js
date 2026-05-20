// 8팀장 visual Playwright 테스트를 production 서버에서 실행한다.
const { spawn } = require('node:child_process')
const net = require('node:net')
const process = require('node:process')

const port = 3016
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`
const nodeExec = process.execPath

const sharedEnv = {
  ...process.env,
  E2E_SCHEDULE_FIXTURE: '1',
  E2E_AUCTION_FIXTURE: '1',
  NEXT_PUBLIC_E2E_AUCTION_FIXTURE: '1',
  HALL_OF_FAME_ADMIN_CODE: 'secret-code',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.local',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-project',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-bucket',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'demo-sender',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://demo.local',
  NEXT_PUBLIC_FIRESTORE_DATABASE_ID: '(default)',
  FIREBASE_PROJECT_ID: 'demo-project',
  FIREBASE_CLIENT_EMAIL: 'demo@example.com',
  FIREBASE_PRIVATE_KEY: 'demo-key',
  FIREBASE_DATABASE_URL: 'https://demo.local',
  FIRESTORE_DATABASE_ID: '(default)',
}

function waitForServer(timeoutMs = 30_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect(port, host)
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${baseURL}`))
          return
        }
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

function runProcess(command, args, env = sharedEnv) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

async function main() {
  const extraArgs = process.argv.slice(2)
  const buildExitCode = await runProcess(nodeExec, ['./node_modules/next/dist/bin/next', 'build'])
  if (buildExitCode !== 0) {
    process.exit(buildExitCode)
  }

  const server = spawn(
    nodeExec,
    ['./node_modules/next/dist/bin/next', 'start', '--hostname', host, '--port', String(port)],
    {
      cwd: process.cwd(),
      env: sharedEnv,
      stdio: 'inherit',
      windowsHide: true,
    },
  )

  let shuttingDown = false
  const stopServer = () => {
    if (shuttingDown) return
    shuttingDown = true
    if (!server.killed) {
      server.kill()
    }
  }

  process.on('SIGINT', () => {
    stopServer()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    stopServer()
    process.exit(143)
  })

  try {
    await waitForServer()

    const runnerExitCode = await runProcess(
      nodeExec,
      [
        './node_modules/playwright/cli.js',
        'test',
        'playwright/auction-eight-leaders-visual.spec.ts',
        '--project=chromium',
        '--workers=1',
        ...extraArgs,
      ],
      {
        ...sharedEnv,
        PLAYWRIGHT_EXTERNAL_SERVER: '1',
        PLAYWRIGHT_BASE_URL: baseURL,
      },
    )

    stopServer()
    process.exit(runnerExitCode)
  } catch (error) {
    stopServer()
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
