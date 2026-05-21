// Firebase Emulator 기반 8팀장 통합 Playwright 테스트를 실행한다.
const { spawn, spawnSync } = require('node:child_process')
const { generateKeyPairSync } = require('node:crypto')
const net = require('node:net')
const process = require('node:process')

const projectId = 'minionsbid-e2e'
const databaseId = 'minionsbid'
const nextPort = 3017
const nextHost = '127.0.0.1'
const baseURL = `http://${nextHost}:${nextPort}`
const nodeExec = process.execPath
const firebaseCliPath = process.env.APPDATA
  ? `${process.env.APPDATA}\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js`
  : null
const javaBinCandidates = [
  'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.11.10-hotspot\\bin',
  process.env.JAVA_HOME ? `${process.env.JAVA_HOME}\\bin` : null,
  'C:\\Program Files\\Android\\Android Studio\\jbr\\bin',
].filter(Boolean)
const pathEnvKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
const processPath = process.env[pathEnvKey] ?? ''
const runnerPath = [
  ...javaBinCandidates.filter((candidate) => !processPath.includes(candidate)),
  processPath,
].join(';')

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})

const emulatorPrivateKey = privateKey.export({
  type: 'pkcs8',
  format: 'pem',
}).replace(/\n/g, '\\n')

const sharedEnv = {
  ...process.env,
  USE_FIREBASE_EMULATOR: '1',
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: '1',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  [pathEnvKey]: runnerPath,
  Path: runnerPath,
  PATH: runnerPath,
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_CLIENT_EMAIL: `emulator-admin@${projectId}.iam.gserviceaccount.com`,
  FIREBASE_PRIVATE_KEY: emulatorPrivateKey,
  FIREBASE_DATABASE_URL: `https://${projectId}-default-rtdb.firebaseio.com`,
  FIRESTORE_DATABASE_ID: databaseId,
  FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'emulator-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: `https://${projectId}-default-rtdb.firebaseio.com`,
  NEXT_PUBLIC_FIRESTORE_DATABASE_ID: databaseId,
}

function firebaseCommand() {
  if (process.platform !== 'win32') {
    return { command: 'firebase', argsPrefix: [] }
  }
  if (!firebaseCliPath) {
    return { command: 'cmd.exe', argsPrefix: ['/d', '/s', '/c', 'firebase.cmd'] }
  }
  return { command: nodeExec, argsPrefix: [firebaseCliPath] }
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 60_000) {
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
          reject(new Error(`Timed out waiting for ${host}:${port}`))
          return
        }
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect(port, host)
    socket.once('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function assertEmulatorPortsAvailable() {
  const ports = [8080, 9000, 9099]
  const occupiedPorts = []
  for (const port of ports) {
    if (await isPortOpen(port)) {
      occupiedPorts.push(port)
    }
  }
  if (occupiedPorts.length > 0) {
    throw new Error(
      `Firebase Emulator 포트가 이미 사용 중입니다: ${occupiedPorts.join(', ')}. 기존 emulator 프로세스를 종료한 뒤 다시 실행하세요.`,
    )
  }
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

function stopChildProcess(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }
  child.kill()
}

function stopWindowsListeningPorts(ports) {
  if (process.platform !== 'win32') return
  const result = spawnSync('netstat', ['-ano'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || !result.stdout) return

  const pids = new Set()
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue
    for (const port of ports) {
      if (line.includes(`127.0.0.1:${port}`)) {
        const pid = line.trim().split(/\s+/).at(-1)
        if (pid && pid !== '0') pids.add(pid)
      }
    }
  }

  for (const pid of pids) {
    spawnSync('taskkill', ['/PID', pid, '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
}

function ensureJavaAvailable() {
  const child = spawn('java', ['-version'], {
    cwd: process.cwd(),
    env: sharedEnv,
    stdio: 'ignore',
    windowsHide: true,
  })
  return new Promise((resolve, reject) => {
    child.once('error', () => {
      reject(new Error('Firebase Emulator Suite 실행에는 Java가 필요합니다. java 명령을 PATH에 추가한 뒤 다시 실행하세요.'))
    })
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error('java -version 실행에 실패했습니다. Java 설치와 PATH를 확인하세요.'))
    })
  })
}

async function main() {
  const extraArgs = process.argv.slice(2)
  await ensureJavaAvailable().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  await assertEmulatorPortsAvailable().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  const firebase = firebaseCommand()
  const emulator = spawn(
    firebase.command,
    [
      ...firebase.argsPrefix,
      'emulators:start',
      '--only',
      'firestore,database,auth',
      '--project',
      projectId,
    ],
    {
      cwd: process.cwd(),
      env: sharedEnv,
      stdio: 'inherit',
      windowsHide: true,
    },
  )

  let shuttingDown = false
  const stop = () => {
    if (shuttingDown) return
    shuttingDown = true
    stopChildProcess(emulator)
    stopChildProcess(server)
    stopWindowsListeningPorts([8080, 9000, 9099])
  }

  let server = null

  emulator.once('error', (error) => {
    console.error(
      `Firebase CLI 실행에 실패했습니다. firebase-tools 설치와 PATH를 확인하세요: ${error.message}`,
    )
  })

  process.on('SIGINT', () => {
    stop()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    stop()
    process.exit(143)
  })

  try {
    await Promise.all([
      waitForPort(8080),
      waitForPort(9000),
      waitForPort(9099),
    ])

    const buildExitCode = await runProcess(
      nodeExec,
      ['./node_modules/next/dist/bin/next', 'build'],
      sharedEnv,
    )
    if (buildExitCode !== 0) {
      stop()
      process.exit(buildExitCode)
    }

    server = spawn(
      nodeExec,
      ['./node_modules/next/dist/bin/next', 'start', '--hostname', nextHost, '--port', String(nextPort)],
      {
        cwd: process.cwd(),
        env: sharedEnv,
        stdio: 'inherit',
        windowsHide: true,
      },
    )
    await waitForPort(nextPort, nextHost)

    const runnerExitCode = await runProcess(
      nodeExec,
      [
        './node_modules/playwright/cli.js',
        'test',
        'playwright/auction-eight-leaders-emulator.spec.ts',
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

    stop()
    process.exit(runnerExitCode)
  } catch (error) {
    stop()
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
