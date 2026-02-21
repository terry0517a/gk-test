/**
 * 調試 NightWind 網站的分頁機制
 */

const puppeteer = require('puppeteer');

async function debug() {
  console.log('🔍 調試 NightWind 分頁機制...\n');

  const browser = await puppeteer.launch({
    headless: false, // 顯示瀏覽器方便調試
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // 攔截所有網路請求
  const apiCalls = [];
  await page.setRequestInterception(true);

  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('product') || url.includes('fetch') || url.includes('ajax')) {
      console.log(`📤 請求: ${request.method()} ${url.substring(0, 100)}`);
      apiCalls.push({
        method: request.method(),
        url: url,
        postData: request.postData(),
      });
    }
    request.continue();
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('product') || url.includes('fetch') || url.includes('ajax')) {
      console.log(`📥 回應: ${response.status()} ${url.substring(0, 100)}`);
    }
  });

  // 進入頁面
  console.log('載入頁面...');
  await page.goto('https://www.nightwindshop.com/product/all', { waitUntil: 'networkidle2' });

  console.log('\n等待 3 秒...\n');
  await new Promise(r => setTimeout(r, 3000));

  // 取得頁面上的分頁資訊
  const paginationInfo = await page.evaluate(() => {
    const result = {
      paginationHtml: '',
      allLinks: [],
      pageButtons: [],
    };

    // 找分頁區域
    const pagers = document.querySelectorAll('ul, .pagination, .pager, [class*="page"]');
    pagers.forEach(p => {
      if (p.innerHTML.includes('1') && p.innerHTML.includes('2')) {
        result.paginationHtml = p.outerHTML.substring(0, 500);
      }
    });

    // 找所有看起來像頁碼的連結
    document.querySelectorAll('a').forEach(a => {
      const text = a.textContent.trim();
      const href = a.getAttribute('href') || '';
      const onclick = a.getAttribute('onclick') || '';
      if (/^[0-9]+$/.test(text) && parseInt(text) <= 10) {
        result.pageButtons.push({
          text,
          href,
          onclick,
          className: a.className,
        });
      }
    });

    return result;
  });

  console.log('=== 分頁資訊 ===');
  console.log('分頁 HTML:', paginationInfo.paginationHtml);
  console.log('\n頁碼按鈕:');
  paginationInfo.pageButtons.forEach(btn => {
    console.log(`  ${btn.text}: href="${btn.href}" onclick="${btn.onclick}" class="${btn.className}"`);
  });

  // 嘗試點擊第 2 頁
  console.log('\n嘗試點擊第 2 頁...');

  const clicked = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (link.textContent.trim() === '2') {
        console.log('找到第 2 頁按鈕:', link.outerHTML);
        link.click();
        return link.outerHTML;
      }
    }
    return null;
  });

  console.log('點擊結果:', clicked ? '成功' : '找不到按鈕');

  // 等待看是否有 API 請求
  console.log('\n等待 API 請求...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n=== 捕獲到的 API 請求 ===');
  apiCalls.forEach((call, i) => {
    console.log(`${i + 1}. ${call.method} ${call.url}`);
    if (call.postData) console.log(`   POST data: ${call.postData.substring(0, 200)}`);
  });

  // 檢查 URL 變化
  console.log('\n當前 URL:', page.url());

  // 取得新的商品清單
  const products = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.pt_title, .pt_items_block .pt_title').forEach(el => {
      items.push(el.textContent.trim());
    });
    return items.slice(0, 5);
  });

  console.log('\n前 5 個商品:', products);

  console.log('\n按 Enter 關閉瀏覽器...');
  await new Promise(r => setTimeout(r, 30000));

  await browser.close();
}

debug().catch(console.error);
