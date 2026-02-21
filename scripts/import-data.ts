// 匯入公仔價格資料到 Supabase
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

// 從 PDF 擷取的資料
const figuresData = [
  { name: '索隆 三刀流虎虎婆', manufacturer: 'ShowMaker + OldTime 彪狩', price: 10000, condition: '全新未拆', scale: '1/6' },
  { name: '牛頭一吼咕 2.0', manufacturer: null, price: 5000, condition: '無損雙盒都在', scale: '1/6' },
  { name: '花海艾倫a款', manufacturer: '名場面工作室', price: 4500, condition: '拆擺無損無雙盒', scale: null },
  { name: '壽島孝牧 火焰冥王', manufacturer: '末那末匠', price: 41000, condition: '全新未拆', scale: '1/4' },
  { name: '阿薩謝爾', manufacturer: '金鳥工作室', price: 2500, condition: '很大隻', scale: '1/1' },
  { name: '夏油傑', manufacturer: '逆刃', price: 14500, condition: '拆擺回盒，無損', scale: null },
  { name: 'time五條悟 頂配', manufacturer: '夢之船', price: 22000, condition: '全新未拆', scale: null },
  { name: '五條悟 頂配版 含特典', manufacturer: 'Time 夢之船', price: 19000, condition: '拆擺無損燈效正常', scale: null },
  { name: 'Du布羅利', manufacturer: null, price: 8750, condition: '拆擺無損有雙盒', scale: '65cm' },
  { name: '奔向山丘那棵樹', manufacturer: 'freedom studio', price: 14500, condition: '拆擺無損', scale: null },
  { name: '刀劍神域 黑衣劍士 桐人 GK', manufacturer: 'X-工作室', price: 5000, condition: '拆檢內容物全新', scale: null },
  { name: '燃風自來也', manufacturer: '燃風', price: 6500, condition: '拆擺無損已回盒', scale: null },
  { name: '大比例女帝', manufacturer: 'LSP', price: 15000, condition: null, scale: '大比例' },
  { name: '貝吉塔', manufacturer: 'Kylin', price: 9500, condition: '僅有彩盒', scale: '1/4' },
  { name: 'CS 對戰', manufacturer: 'CS', price: 10500, condition: null, scale: '1/4' },
  { name: '千與千尋至尊版', manufacturer: '白鹿', price: 20000, condition: '全新未拆', scale: null },
  { name: '夢幻 艾斯', manufacturer: '夢幻', price: 6000, condition: '拆擺無缺損', scale: '1/5' },
  { name: '日向翔陽', manufacturer: 'Hikari', price: 9900, condition: '全新未拆', scale: null },
  { name: '月島螢', manufacturer: 'Hikari', price: 8000, condition: '全新未拆', scale: null },
  { name: '及川徹', manufacturer: 'Hikari', price: 5000, condition: '全新未拆', scale: null },
  { name: '孤爪研磨', manufacturer: 'Hikari', price: 4500, condition: '全新未拆', scale: null },
  { name: '瑪奇瑪', manufacturer: 'Dodomo', price: 9000, condition: '全新未拆', scale: null },
  { name: '約兒 豪華版A', manufacturer: 'Creation', price: 25000, condition: '全新未拆', scale: null },
  { name: '星輪歐米伽 低配', manufacturer: '杏極', price: 20000, condition: '全新未拆', scale: null },
  { name: '六道仙人 大筒木羽衣 cos安妮亞', manufacturer: 'ZH', price: 3000, condition: '全新入手連外箱都沒拆', scale: null },
  { name: '4檔魯夫', manufacturer: '正模BBT', price: 15000, condition: null, scale: '1/6' },
  { name: '赤犬', manufacturer: null, price: 15000, condition: '無盒 會亮 無損', scale: null },
  { name: '進擊的巨人&女巨人', manufacturer: '集美殿堂', price: 35000, condition: '全新未拆', scale: '66.5cm' },
  { name: '莉莉絲 LILITH', manufacturer: 'AmerFort PIJ杏極', price: 22000, condition: '拆檢無損', scale: '1/4' },
  { name: '小普烏 七龍珠 高配版', manufacturer: '文明', price: 6000, condition: null, scale: null },
  { name: '雲頂佐助', manufacturer: '雲頂', price: 110000, condition: '全新未拆', scale: null },
  { name: '鋼鐵人馬克7', manufacturer: null, price: 50000, condition: '拆擺無盒', scale: '1/1' },
  { name: '混沌鳴人 高配版', manufacturer: null, price: 4800, condition: '腳有損已修復雙盒都在', scale: null },
  { name: '白鹿油屋 至尊款', manufacturer: '白鹿', price: 19000, condition: '拆擺回盒，無損', scale: null },
  { name: '戰損五條悟', manufacturer: 'Hero collectible', price: 17000, condition: '拆擺無損', scale: null },
  { name: '金木研', manufacturer: 'Damocles', price: 15000, condition: '拆擺微損，已修復', scale: null },
  { name: '雲頂摘星 佐助 須佐能乎', manufacturer: '雲頂', price: 11500, condition: '拆擺無損', scale: '85cm' },
  { name: '超夢', manufacturer: 'UA正版授權', price: 8300, condition: '全新未拆', scale: null },
  { name: '索隆vs霍金斯 GK雕像', manufacturer: '集美殿堂', price: 9000, condition: '拆擺無損無缺', scale: null },
  { name: '巷戰兵長', manufacturer: 'model power', price: 9000, condition: '拆擺無損', scale: null },
  { name: '凱巨vs獸巨', manufacturer: 'chikara天地之戰', price: 17000, condition: '拆擺無損', scale: null },
  { name: '炎柱 含特典', manufacturer: '幻想屋', price: 22000, condition: '拆擺無損', scale: null },
  { name: '安妮亞 五條悟 白髮抽象', manufacturer: null, price: 2850, condition: '全新未拆', scale: null },
  { name: '十年百忍鼬田', manufacturer: null, price: 2000, condition: '拆擺 無損 無盒', scale: null },
  { name: 'SRS 低配宿儺', manufacturer: 'SRS', price: 6600, condition: '拆擺無損 雙盒', scale: null },
  { name: '凱多vs魯夫', manufacturer: '幻想屋', price: 20000, condition: null, scale: null },
  { name: '千尋至尊版', manufacturer: '白鹿', price: 22000, condition: '全新', scale: null },
  { name: '漫匠女帝', manufacturer: '漫匠', price: 6000, condition: '全新', scale: null },
  { name: '幕府索隆', manufacturer: '幕府', price: 16500, condition: null, scale: null },
  { name: '噴火龍對戰組', manufacturer: '小匙鎮 漫奇', price: 6500, condition: '僅拆檢', scale: null },
  { name: '國風女帝', manufacturer: 'Third Eye 第三隻眼', price: 6000, condition: null, scale: '1/4' },
  { name: '王座暗遊戲阿圖姆、三幻神大集合', manufacturer: '第三空間', price: 15000, condition: null, scale: null },
  { name: '白月魁vs馬克 靈籠', manufacturer: '靈籠', price: 23000, condition: '全新未拆', scale: null },
  { name: '雲頂佐助', manufacturer: '雲頂', price: 19000, condition: '無損', scale: null },
  { name: '櫻木平交道', manufacturer: '幕后x無限', price: 8000, condition: null, scale: null },
  { name: '暴龍進化組 DX版', manufacturer: '暴龍社', price: 36000, condition: '拆擺無損 雙盒', scale: null },
  { name: '彈跳人魯夫', manufacturer: '魔風漫奇', price: 15000, condition: '全新未拆', scale: null },
  { name: '羅賓', manufacturer: '霸權社', price: 4500, condition: null, scale: '1/4' },
  { name: '烏爾奇奧拉', manufacturer: 'Cross studio', price: 6000, condition: '全新未拆', scale: null },
  { name: '啟明女帝', manufacturer: 'Venus Studio', price: 5500, condition: '全新未拆', scale: null },
  { name: '鑽石 艾斯', manufacturer: null, price: 3000, condition: '無損', scale: null },
  { name: '不知火舞', manufacturer: 'Snk 正版授權', price: 12800, condition: '全新未拆', scale: null },
  { name: '鼬', manufacturer: '鐵風箏', price: 20000, condition: '拆擺無損 雙盒都在', scale: null },
  { name: '青治', manufacturer: '天機X', price: 10000, condition: null, scale: null },
  { name: '赤犬', manufacturer: '天機X', price: 6000, condition: null, scale: null },
  { name: '哥爾‧D‧羅傑', manufacturer: '集美殿堂', price: 26000, condition: '拆檢無損', scale: null },
  { name: '鳳凰與三聖獸', manufacturer: '新月 Crescent-Studio', price: 8000, condition: '拆檢無損', scale: null },
  { name: '死亡擱淺 山姆', manufacturer: 'P1S', price: 50000, condition: '全新未拆兩大箱', scale: null },
  { name: '伏黑惠', manufacturer: '逆刃', price: 16000, condition: '拆檢無損無擺', scale: null },
  { name: '日本人形小紫', manufacturer: '萬代', price: 30000, condition: '全新', scale: null },
  { name: '阿璃', manufacturer: '集美殿堂', price: 14000, condition: '全新未拆', scale: null },
  { name: '白鬍子', manufacturer: '模還原', price: 5000, condition: '拆擺無損（雙盒）', scale: null },
  { name: '卡二', manufacturer: '天機', price: 4500, condition: '拆擺無損（雙盒）', scale: null },
  { name: '黑鬍子', manufacturer: '集美殿堂', price: 20000, condition: '拆擺無損僅彩盒', scale: null },
  { name: '魔導少年 納茲', manufacturer: 'L Seven', price: 6000, condition: null, scale: null },
  { name: '漫奇羅 含配件包及小時候特典', manufacturer: '漫奇', price: 28000, condition: '拆擺無損燈效正常', scale: null },
  { name: '黑化小傑', manufacturer: 'PG STUDIO', price: 10000, condition: null, scale: null },
  { name: '宇智波斑', manufacturer: null, price: 8500, condition: '有一點點小斷件', scale: null },
  { name: '索隆高配', manufacturer: '夢幻', price: 7500, condition: '無損雙盒', scale: null },
  { name: '星辰尼特羅', manufacturer: null, price: 3300, condition: '拆擺有損 雙盒', scale: null },
  { name: '酒龍凱多 異色版', manufacturer: 'BBF', price: 3000, condition: null, scale: null },
  { name: '幻影薩波', manufacturer: '幻影', price: 8000, condition: null, scale: null },
  { name: '黑鬍子女帝', manufacturer: 'Lx', price: 20000, condition: null, scale: null },
  { name: '夢幻索隆', manufacturer: '夢幻', price: 3800, condition: null, scale: null },
  { name: '黑魔導', manufacturer: '幻影', price: 11000, condition: null, scale: null },
  { name: '女帝', manufacturer: null, price: 6000, condition: null, scale: '1/6' },
  { name: '極之番宿儺', manufacturer: null, price: 9000, condition: '無損雙盒', scale: null },
  { name: '黃猿', manufacturer: '集美', price: 23000, condition: null, scale: null },
  { name: '神啟的鳴人', manufacturer: '神啟', price: 4000, condition: null, scale: null },
  { name: '獵天使魔女-貝優妮塔 豪華版', manufacturer: 'ZZDD 工作室', price: null, condition: '全新未拆', scale: null },
  { name: '五條豪華版', manufacturer: null, price: 11000, condition: null, scale: '1/2' },
  { name: '和之國魯夫', manufacturer: null, price: 8000, condition: null, scale: '1/4' },
  { name: '白鬍子', manufacturer: 'LB', price: 4500, condition: null, scale: null },
  { name: '香吉士大將版', manufacturer: 'Uking', price: 5500, condition: null, scale: null },
  { name: '十年百忍須佐鼬', manufacturer: null, price: 9600, condition: '拆擺微損', scale: null },
  { name: '羅傑', manufacturer: '集美殿堂', price: 27000, condition: null, scale: null },
  { name: '回眸艾斯', manufacturer: null, price: 6900, condition: '拆擺無損', scale: null },
  { name: '洛奇亞爆誕+三神鳥', manufacturer: '正模', price: 2000, condition: null, scale: null },
  { name: 'Sx明日香', manufacturer: null, price: 8000, condition: '全新未拆', scale: null },
  { name: '鬼谷傑爾馬索隆電鍍版', manufacturer: null, price: 2000, condition: '全新未拆', scale: null },
  { name: '義勇GK', manufacturer: null, price: 10000, condition: '拆擺微損已回盒', scale: null },
  { name: '海馬瀨人&青眼究極龍', manufacturer: 'Kitsune Statue', price: 15000, condition: null, scale: null },
  { name: '十月梧桐黑魔導女孩', manufacturer: null, price: 12000, condition: '全新未拆', scale: null },
  { name: 'Street Fighter 豪鬼&龍', manufacturer: 'P1 studio', price: 50000, condition: null, scale: null },
  { name: '卡魯夫', manufacturer: '漫匠尼', price: 5000, condition: null, scale: null },
  { name: '鐵幕暗影忍者', manufacturer: null, price: 13000, condition: '全新未拆', scale: null },
  { name: '御三家生態 妙蛙種子妙蛙花', manufacturer: 'PPAP', price: 5500, condition: null, scale: null },
  { name: '豪華版紫 索隆', manufacturer: '品匠萌奇', price: 5000, condition: null, scale: null },
  { name: '霸王色紅髮', manufacturer: null, price: 22500, condition: null, scale: null },
  { name: '巔峰極致艾斯', manufacturer: null, price: 22500, condition: null, scale: null },
  { name: '炎帝艾斯', manufacturer: null, price: 17500, condition: null, scale: null },
  { name: '渡鴉', manufacturer: '初超', price: 7000, condition: null, scale: null },
  { name: '週年慶紅髮', manufacturer: null, price: 17000, condition: null, scale: null },
  { name: '新月耿鬼加特典', manufacturer: '新月', price: 5000, condition: null, scale: null },
  { name: '大傑vs貓女', manufacturer: null, price: 18000, condition: null, scale: null },
  { name: '黃蜂貝卡斯', manufacturer: null, price: 21000, condition: null, scale: null },
  { name: '流風卡卡西', manufacturer: '流風', price: 15000, condition: null, scale: null },
  { name: '流風柱間', manufacturer: '流風', price: 10000, condition: null, scale: null },
]

async function importData() {
  console.log('開始匯入資料...')
  console.log(`共 ${figuresData.length} 筆資料`)

  let successCount = 0
  let errorCount = 0

  for (const figure of figuresData) {
    try {
      // 檢查是否已存在
      const { data: existing } = await supabase
        .from('figures')
        .select('id')
        .ilike('name', figure.name)
        .limit(1)

      if (existing && existing.length > 0) {
        console.log(`跳過已存在: ${figure.name}`)
        continue
      }

      // 插入新資料
      const { error } = await supabase
        .from('figures')
        .insert({
          name: figure.name,
          manufacturer: figure.manufacturer,
          series: figure.scale ? `GK ${figure.scale}` : 'GK',
          market_price_min: figure.price ? Math.round(figure.price * 0.9) : null,
          market_price_max: figure.price ? Math.round(figure.price * 1.1) : null,
        })

      if (error) {
        console.error(`匯入失敗 ${figure.name}:`, error.message)
        errorCount++
      } else {
        console.log(`匯入成功: ${figure.name}`)
        successCount++

        // 如果有價格，也新增一筆成交紀錄
        if (figure.price) {
          const { data: newFigure } = await supabase
            .from('figures')
            .select('id')
            .ilike('name', figure.name)
            .limit(1)
            .single()

          if (newFigure) {
            await supabase
              .from('transactions')
              .insert({
                figure_id: newFigure.id,
                price: figure.price,
                source: '公仔價格01.pdf 匯入',
              })
          }
        }
      }
    } catch (err) {
      console.error(`處理失敗 ${figure.name}:`, err)
      errorCount++
    }
  }

  console.log('\n匯入完成!')
  console.log(`成功: ${successCount} 筆`)
  console.log(`失敗: ${errorCount} 筆`)
}

importData()
