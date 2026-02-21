/**
 * 自動連續執行 refetch-prices.js，跑完一批自動接下一批
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(__dirname, '../ch-prices-progress.json');
const BATCH_SIZE = 200;

function getNextOffset() {
  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    return { offset: data.nextOffset || 0, total: data.total || 0 };
  } catch {
    return { offset: 0, total: 0 };
  }
}

async function main() {
  console.log('🔄 自動連續爬蟲模式啟動\n');

  while (true) {
    const { offset, total } = getNextOffset();

    if (total > 0 && offset >= total) {
      console.log(`\n✅ 全部完成！已處理 ${total} 個公仔`);
      break;
    }

    console.log(`\n========================================`);
    console.log(`📦 開始第 ${Math.floor(offset / BATCH_SIZE) + 1} 批 (offset ${offset}, batch ${BATCH_SIZE})`);
    console.log(`========================================\n`);

    try {
      execSync(
        `node scripts/refetch-prices.js --offset ${offset} --batch ${BATCH_SIZE} --all`,
        { cwd: path.join(__dirname, '..'), stdio: 'inherit', timeout: 600000 }
      );
    } catch (err) {
      if (err.killed) {
        console.error('\n⏰ 批次超時，等待 10 秒後繼續...');
        await new Promise(r => setTimeout(r, 10000));
      } else {
        console.error(`\n💥 批次錯誤: ${err.message}`);
        console.log('等待 5 秒後重試...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    // 批次間暫停 3 秒，避免過度請求
    console.log('\n⏳ 休息 3 秒...');
    await new Promise(r => setTimeout(r, 3000));
  }
}

main().catch(console.error);
