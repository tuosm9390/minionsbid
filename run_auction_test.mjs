import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const url = urlMatch ? urlMatch[1].trim() : '';
const key = keyMatch ? keyMatch[1].trim() : '';
const supabase = createClient(url, key);

async function runTest() {
  console.log('Seeding mock data for E2E testing...');

  // 1. Create Room
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert([{
      name: 'E2E Full Frontend UI Validation',
      total_teams: 8,
      base_point: 1000,
      members_per_team: 5,
      order_public: true,
    }]).select().single();

  if (roomError) throw roomError;

  // 2. Create Teams
  const teamsData = [];
  for (let i = 1; i <= 8; i++) {
    teamsData.push({
      room_id: room.id,
      name: `T1 Alpha ${i}`,
      leader_name: `Captain_${i}`,
      point_balance: 1000,
      leader_position: 'TOP',
      leader_description: '',
      captain_points: 0,
    });
  }
  const { data: teams, error: teamsError } = await supabase.from('teams').insert(teamsData).select();
  if (teamsError) throw teamsError;

  // 3. Create Players
  const playersData = [];
  const roles = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];
  for (let i = 1; i <= 32; i++) {
    playersData.push({
      room_id: room.id,
      name: `Player_${i}`,
      tier: '골드',
      main_position: roles[i % 5],
    });
  }
  const { error: playersError } = await supabase.from('players').insert(playersData);
  if (playersError) throw playersError;

  console.log(`Room created: ${room.id}. Launching browser...`);

  // Launch browser prominently
  const browser = await chromium.launch({ headless: false, slowMo: 60 });

  // We specify viewport to be large so user can see it
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

  // Create Organizer Page
  const orgPage = await context.newPage();
  orgPage.on('console', msg => console.log(`[Org Console] ${msg.text()}`));
  orgPage.on('pageerror', err => console.log(`[Org Error] ${err.message}`));
  await orgPage.goto(`http://localhost:3000/room/${room.id}?role=ORGANIZER&token=${room.organizer_token}`);
  console.log('Organizer logged in.');

  // Create Captain Pages in background
  const capPages = [];
  for (let i = 0; i < 8; i++) {
    const p = await context.newPage();
    p.on('console', msg => console.log(`[Cap${i + 1} Console] ${msg.text()}`));
    await p.goto(`http://localhost:3000/room/${room.id}?role=LEADER&teamId=${teams[i].id}&token=${teams[i].leader_token}`);
    await p.bringToFront(); // 탭 활성화 로직 추가 (브라우저 백그라운드 스로틀링 우회)
    await p.waitForTimeout(500);
    capPages.push(p);
  }

  console.log('All 8 captains logged in. Switching to Organizer view.');
  await orgPage.bringToFront();

  console.log('Waiting for all captains to be registered... (this might take a few seconds)');
  // 타임아웃을 60초로 넉넉하게
  await orgPage.waitForSelector('text=모든 팀장이 입장했습니다!', { timeout: 60000 });
  console.log('Starting auction loop...');

  let actionCount = 0;
  // Maximum possible actions to prevent infinite loop
  while (actionCount < 100) {
    actionCount++;
    await orgPage.waitForTimeout(1000); // 1초 대기 후 상태 판별

    // 경매 종료 확인
    const isDone = await orgPage.isVisible('text=모든 경매가 종료되었습니다!');
    if (isDone) {
      console.log('Auction fully completed!');
      break;
    }

    // 버튼 찾기
    const drawBtn = await orgPage.$('button:has-text("추첨")');
    const reAuctionBtn = await orgPage.$('button:has-text("유찰 선수 전체 재경매 시작")');
    const draftBtn = await orgPage.$('button:has-text("배정 (→")');

    if (reAuctionBtn) {
      const isEnabled = await reAuctionBtn.isEnabled();
      if (isEnabled) {
        console.log(`[Action ${actionCount}] Re-auction needed, starting re-auction...`);
        await reAuctionBtn.click();
        await orgPage.waitForTimeout(1000);
        continue;
      }
    }

    if (draftBtn) {
      const isEnabled = await draftBtn.isEnabled();
      if (isEnabled) {
        console.log(`[Action ${actionCount}] Draft phase, assigning player...`);
        await draftBtn.click();
        continue;
      }
    }

    if (drawBtn) {
      const isEnabled = await drawBtn.isEnabled();
      if (isEnabled) {
        console.log(`[Action ${actionCount}] Drawing player...`);
        await drawBtn.click();

        // Wait for '바로 경매 시작'
        const startBtn = await orgPage.waitForSelector('button:has-text("바로 경매 시작")', { state: 'visible', timeout: 8000 });
        if (startBtn) {
          await orgPage.waitForTimeout(500);
          await startBtn.click();
          console.log(`[Action ${actionCount}] Auction started!`);
        }

        // Wait a bit and simulate bids
        await orgPage.waitForTimeout(2000);

        // Randomly 0 to 4 bids
        const bidsTotal = Math.floor(Math.random() * 5);
        console.log(`[Action ${actionCount}] Simulating ${bidsTotal} bids...`);

        for (let b = 0; b < bidsTotal; b++) {
          const capPage = capPages[Math.floor(Math.random() * 8)];
          const bidBtn = await capPage.$('button:has-text("입찰 🔥")');
          if (bidBtn && (await bidBtn.isEnabled())) {
            await bidBtn.click();
            await orgPage.waitForTimeout(1000);
          }
        }

        console.log(`[Action ${actionCount}] Waiting for round to end...`);
        // The center timer is 15 seconds. Let's wait until one of the next action buttons reappears.
        await Promise.race([
          orgPage.waitForSelector('button:has-text("추첨")', { state: 'attached', timeout: 25000 }),
          orgPage.waitForSelector('button:has-text("배정 (→")', { state: 'attached', timeout: 25000 }),
          orgPage.waitForSelector('button:has-text("유찰 선수 전체 재경매 시작")', { state: 'attached', timeout: 25000 }),
          orgPage.waitForSelector('text=모든 경매가 종료되었습니다!', { state: 'visible', timeout: 25000 })
        ]).catch(() => console.log('Wait timeout, continuing loop...'));
      }
    }
  }

  // 방 종료 로직
  console.log('Clicking End Room...');
  // 방 종료 버튼은 상단 어딘가에 있음 ("🚪 방 종료")
  const endRoomBtn = await orgPage.$('button:has-text("방 종료")');
  if (endRoomBtn) {
    await endRoomBtn.click();
    const saveBtn = await orgPage.waitForSelector('button:has-text("결과 저장 및 방 닫기")', { timeout: 5000 }).catch(() => null);
    if (saveBtn) {
      console.log('Saving result and closing room...');
      await saveBtn.click();
    } else {
      // In case the button text is different
      const alternativeBtn = await orgPage.$('button:has-text("저장")');
      if (alternativeBtn) await alternativeBtn.click();
    }
  }

  console.log('Done!');
  await orgPage.waitForTimeout(5000); // 5초간 최종 화면 띄워줌
  await browser.close();
}

runTest().catch(console.error);
