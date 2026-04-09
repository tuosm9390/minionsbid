require("dotenv").config({ path: ".env.local" });

const admin = require("firebase-admin");
const crypto = require("crypto");
const { getFirestore } = require("firebase-admin/firestore");

const TIERS = [
  "챌린저",
  "그랜드마스터",
  "마스터",
  "다이아",
  "에메랄드",
  "플래티넘",
  "골드",
  "실버",
  "브론즈",
  "언랭",
];

const POSITIONS = ["탑", "정글", "미드", "원딜", "서포터", "무관"];

const LAST_NAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "한", "오", "서", "신", "권", "황", "안", "송", "홍", "고",
];

const FIRST_NAMES_LIST = [
  "민준", "서준", "도윤", "예준", "시우", "주원", "하준", "지호", "준서", "준혁",
  "도현", "지훈", "건우", "우진", "현우", "민재", "준우", "민호", "준영", "민규",
  "지민", "서연", "서윤", "지윤", "수아", "하윤", "소윤", "예린", "지아", "채원",
  "수빈", "다은", "지은", "예원", "나은", "수현", "지현", "유진", "다연", "아린",
];

const CAPTAIN_INTROS = [
  "팀원들을 이끌어 우승을 가져가겠습니다!",
  "최선을 다해 팀을 운영하겠습니다.",
  "좋은 팀 만들어서 꼭 우승하겠습니다!",
  "팀원을 잘 챙기는 리더가 되겠습니다.",
  "전략적으로 팀을 이끌겠습니다!",
];

const PLAYER_INTROS = [
  "열심히 하겠습니다!",
  "최선을 다하겠습니다.",
  "잘 부탁드립니다!",
  "팀에 기여하는 선수가 되겠습니다.",
  "승리를 위해 최선을 다하겠습니다!",
  "믿고 맡겨주세요!",
  "좋은 팀원 만나서 우승하고 싶습니다.",
];

function initializeAdmin() {
  if (admin.apps.length) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL.replace(/"/g, ""),
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/"/g, "").replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomStep(min, max, step = 10) {
  const count = Math.floor((max - min) / step);
  return min + Math.floor(Math.random() * (count + 1)) * step;
}

function generateKoreanName(usedNames) {
  for (let i = 0; i < 100; i += 1) {
    const name = `${randomItem(LAST_NAMES)}${randomItem(FIRST_NAMES_LIST)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  const fallback = `선수${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

function buildTemplateData(teamCount, membersPerTeam) {
  const usedNames = new Set();

  const captains = Array.from({ length: teamCount }, (_, index) => {
    const name = generateKoreanName(usedNames);
    return {
      teamName: `${name}팀`,
      name,
      position: randomItem(POSITIONS),
      description: CAPTAIN_INTROS[index % CAPTAIN_INTROS.length],
      captainPoints: 0,
    };
  });

  const playerCount = teamCount * (membersPerTeam - 1);
  const players = Array.from({ length: playerCount }, (_, index) => ({
    name: generateKoreanName(usedNames),
    tier: randomItem(TIERS),
    mainPosition: randomItem(POSITIONS),
    subPosition: randomItem(POSITIONS),
    description: PLAYER_INTROS[index % PLAYER_INTROS.length],
  }));

  return { captains, players };
}

function allocateSoldPrices(startBudget, playerCount) {
  const targetBalance = randomStep(0, Math.min(200, startBudget - playerCount * 10));
  let remaining = startBudget - targetBalance;
  const prices = [];

  for (let index = 0; index < playerCount; index += 1) {
    const remainingPlayers = playerCount - index - 1;
    if (remainingPlayers === 0) {
      prices.push(remaining);
      break;
    }

    const minForRest = remainingPlayers * 10;
    const maxForCurrent = remaining - minForRest;
    const nextPrice = randomStep(10, maxForCurrent);
    prices.push(nextPrice);
    remaining -= nextPrice;
  }

  return {
    prices,
    pointBalance: targetBalance,
  };
}

async function main() {
  initializeAdmin();
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const db = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());

  const teamCount = 8;
  const membersPerTeam = 5;
  const basePoint = 1000;
  const { captains, players } = buildTemplateData(teamCount, membersPerTeam);

  const closedAtDate = new Date();
  closedAtDate.setHours(closedAtDate.getHours() - 2);
  const createdAtDate = new Date(closedAtDate);
  createdAtDate.setHours(createdAtDate.getHours() - 3);

  const resultSnapshot = captains.map((captain, index) => {
    const captainPoints = randomStep(0, 150);
    const soldPlayers = players.slice(index * (membersPerTeam - 1), (index + 1) * (membersPerTeam - 1));
    const { prices, pointBalance } = allocateSoldPrices(basePoint - captainPoints, soldPlayers.length);

    return {
      id: crypto.randomUUID(),
      name: captain.teamName,
      leader_name: captain.name,
      point_balance: pointBalance,
      players: soldPlayers.map((player, playerIndex) => ({
        name: player.name,
        tier: player.tier,
        main_position: player.mainPosition,
        sub_position: player.subPosition,
        sold_price: prices[playerIndex],
      })),
    };
  });

  const archivePayload = {
    room_id: crypto.randomUUID(),
    room_name: `테스트 종료 경매 ${new Date().toLocaleDateString("ko-KR").replace(/\./g, "").trim()} 8팀`,
    schedule_id: null,
    schedule_name: null,
    linked_auction_id: null,
    linked_league_name: null,
    room_created_at: createdAtDate.toISOString(),
    closed_at: admin.firestore.Timestamp.fromDate(closedAtDate),
    result_snapshot: resultSnapshot,
  };

  const archiveRef = await db.collection("auction_archives").add(archivePayload);

  console.log(
    JSON.stringify(
      {
        archiveId: archiveRef.id,
        roomName: archivePayload.room_name,
        teamCount,
        membersPerTeam,
        playerCount: players.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
