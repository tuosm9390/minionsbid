const xlsx = require('xlsx');

const teams = [];
for (let i = 1; i <= 8; i++) {
  teams.push({
    '팀명': `Team Alpha ${i}`,
    '팀장 롤닉': `Leader_${i}`,
    '티어': '다이아'
  });
}

const players = [];
const roles = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];
for (let i = 1; i <= 32; i++) {
  players.push({
    '롤닉': `Player_${i}`,
    '주포지션': roles[i % 5],
    '티어': '골드',
    '주챔프': '가렌'
  });
}

const wb = xlsx.utils.book_new();
const wsTeams = xlsx.utils.json_to_sheet(teams);
const wsPlayers = xlsx.utils.json_to_sheet(players);

xlsx.utils.book_append_sheet(wb, wsTeams, "팀");
xlsx.utils.book_append_sheet(wb, wsPlayers, "선수");

xlsx.writeFile(wb, "mock_auction.xlsx");
console.log("mock_auction.xlsx created with 8 teams and 32 players.");
