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
  const viewport = { width: 1400, height: 900 };

  // ✅ 핵심 변경: 각 참가자를 독립된 context로 분리하여 WebSocket 스로틀링 방지
  // Create Organizer in its own context
  const orgContext = await browser.newContext({ viewport });
  const orgPage = await orgContext.newPage();
  orgPage.on('console', msg => console.log(`[Org Console] ${msg.text()}`));
  orgPage.on('pageerror', err => console.log(`[Org Error] ${err.message}`));
  await orgPage.goto(`http://localhost:3000/room/${room.id}?role=ORGANIZER&token=${room.organizer_token}`);
  console.log('Organizer logged in.');

  // Create Captain Pages - each in its OWN context (prevents background tab throttling)
  const capPages = [];
  const capContexts = [];
  for (let i = 0; i < 8; i++) {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    p.on('console', msg => console.log(`[Cap${i + 1} Console] ${msg.text()}`));
    await p.goto(`http://localhost:3000/room/${room.id}?role=LEADER&teamId=${teams[i].id}&token=${teams[i].leader_token}`);
    await p.bringToFront();
    await p.waitForTimeout(500);
    capPages.push(p);
    capContexts.push(ctx);
  }

  console.log('All 8 captains logged in. Switching to Organizer view.');
  await orgPage.bringToFront();

  console.log('Waiting for all captains to be registered... (this might take a few seconds)');
  await orgPage.waitForSelector('text=모든 팀장이 입장했습니다!', { timeout: 60000 });
  console.log('Starting auction loop...');

  let actionCount = 0;
  while (actionCount < 100) {
    actionCount++;
    await orgPage.waitForTimeout(1000);

    // 경매 종료 확인
    const isDone = await orgPage.isVisible('text=모든 경매가 종료되었습니다!');
    if (isDone) {
      console.log('Auction fully completed!');
      break;
    }

    // 버튼 찾기 (느슨한 매칭)
    const drawBtn = await orgPage.$('button:has-text("추첨")');
    const reAuctionBtn = await orgPage.$('button:has-text("재경매")');
    const draftBtn = await orgPage.$('button:has-text("배정")');

    if (reAuctionBtn) {
      const isEnabled = await reAuctionBtn.isEnabled();
      if (isEnabled) {
        console.log(`[Action ${actionCount}] Re-auction needed, starting re-auction...`);
        await reAuctionBtn.click({ force: true });
        await orgPage.waitForTimeout(1000);
        continue;
      }
    }

    if (draftBtn) {
      const isEnabled = await draftBtn.isEnabled();
      if (isEnabled) {
        console.log(`[Action ${actionCount}] Draft phase, assigning player...`);
        await draftBtn.click({ force: true });
        await orgPage.waitForTimeout(1000);
        continue;
      }
    }

    if (drawBtn) {
      const isEnabled = await drawBtn.isEnabled();
      if (isEnabled) {
        console.log(`[Action ${actionCount}] Drawing player...`);
        await drawBtn.click({ force: true });

        // 선수 추첨 후 중앙 보드에서 애니메이션 진행
        // 하단 컨트롤 패널의 "▶ 경매 시작" 버튼 대기 및 클릭
        console.log(`[Action ${actionCount}] Waiting for animation and Start button...`);
        const startBtn = await orgPage.waitForSelector('button:has-text("경매 시작")', { state: 'visible', timeout: 8000 }).catch(() => null);
        
        if (startBtn) {
          await orgPage.waitForTimeout(3500); // 추첨 애니메이션 감상 시간
          await startBtn.click({ force: true });
          console.log(`[Action ${actionCount}] Auction started from control panel!`);
        } else {
          console.log(`[Action ${actionCount}] Could not find Start Auction button.`);
        }

        // Wait a bit and simulate bids
        await orgPage.waitForTimeout(2000);

        // Randomly 0 to 4 bids
        const bidsTotal = Math.floor(Math.random() * 5);
        console.log(`[Action ${actionCount}] Simulating ${bidsTotal} bids...`);

        for (let b = 0; b < bidsTotal; b++) {
          const capPage = capPages[Math.floor(Math.random() * 8)];
          await capPage.bringToFront();
          const bidBtn = await capPage.$('button:has-text("입찰 🔥")');
          if (bidBtn && (await bidBtn.isEnabled())) {
            await bidBtn.click({ force: true });
            await capPage.waitForTimeout(500);
          }
          await orgPage.bringToFront();
          await orgPage.waitForTimeout(500);
        }

        console.log(`[Action ${actionCount}] Waiting for round to end...`);
        // Polling: check every second for next action buttons (45s max)
        let waited = 0;
        while (waited < 45) {
          await orgPage.waitForTimeout(1000);
          waited++;
          const drawVis = await orgPage.isVisible('button:has-text("추첨")').catch(() => false);
          const draftVis = await orgPage.isVisible('button:has-text("배정")').catch(() => false);
          const reaucVis = await orgPage.isVisible('button:has-text("재경매")').catch(() => false);
          const finishVis = await orgPage.isVisible('text=모든 경매가 종료되었습니다!').catch(() => false);

          if (drawVis || draftVis || reaucVis || finishVis) {
            break;
          }
        }
        if (waited >= 45) {
          console.log(`[Action ${actionCount}] Wait timeout, continuing loop...`);
        }
      }
    }
  }

  // 방 종료 로직
  console.log('Clicking End Room...');
  const endRoomBtn = await orgPage.$('button:has-text("방 종료")');
  if (endRoomBtn) {
    await endRoomBtn.click();
    await orgPage.waitForTimeout(500);

    const saveBtn = await orgPage.waitForSelector('button:has-text("결과 저장 후 방 종료")', { state: 'visible', timeout: 5000 }).catch(() => null);
    if (saveBtn) {
      console.log('Saving result and closing room...');
      await saveBtn.click();
    } else {
      console.log('Save button not found, looking for alternative...');
      const alternativeBtn = await orgPage.$('button:has-text("저장")');
      if (alternativeBtn) await alternativeBtn.click();
    }
  }

  console.log('Done!');
  await orgPage.waitForTimeout(5000);

  // Cleanup all contexts
  for (const ctx of capContexts) {
    await ctx.close();
  }
  await orgContext.close();
  await browser.close();
}

runTest().catch(console.error);
