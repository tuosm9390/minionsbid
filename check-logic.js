const fs = require('fs');
const path = require('path');

const actionFile = fs.readFileSync(path.join(__dirname, 'src/lib/auctionActions.ts'), 'utf8');
const boardFile = fs.readFileSync(path.join(__dirname, 'src/components/AuctionBoard.tsx'), 'utf8');

console.log('--- [TDD RED Phase Check] ---');

const durationMatch = actionFile.match(/const AUCTION_DURATION_MS = (\d+)/);
const currentDuration = durationMatch ? parseInt(durationMatch[1]) : 0;
console.log('Current Auction Duration:', currentDuration, 'ms');

const draftLogicPresent = boardFile.includes('needyTeams.length <= 1');
console.log('Early Draft Logic Present:', draftLogicPresent);

if (currentDuration !== 10000 || !draftLogicPresent) {
    console.log('\nResult: RED (FAIL) - Requirements not met.');
    process.exit(1);
} else {
    console.log('\nResult: GREEN (PASS)');
    process.exit(0);
}
