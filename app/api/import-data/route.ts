import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 從 PDF 擷取的資料
const figuresData = [
  { name: '索隆 三刀流虎虎婆', manufacturer: 'ShowMaker + OldTime 彪狩', price: 10000, scale: '1/6' },
  { name: '牛頭一吼咕 2.0', manufacturer: null, price: 5000, scale: '1/6' },
  { name: '花海艾倫a款', manufacturer: '名場面工作室', price: 4500, scale: null },
  { name: '壽島孝牧 火焰冥王', manufacturer: '末那末匠', price: 41000, scale: '1/4' },
  { name: '阿薩謝爾', manufacturer: '金鳥工作室', price: 2500, scale: '1/1' },
  { name: '夏油傑', manufacturer: '逆刃', price: 14500, scale: null },
  { name: 'time五條悟 頂配', manufacturer: '夢之船', price: 22000, scale: null },
  { name: '五條悟 頂配版 含特典', manufacturer: 'Time 夢之船', price: 19000, scale: null },
  { name: 'Du布羅利', manufacturer: null, price: 8750, scale: '65cm' },
  { name: '奔向山丘那棵樹', manufacturer: 'freedom studio', price: 14500, scale: null },
  { name: '刀劍神域 黑衣劍士 桐人 GK', manufacturer: 'X-工作室', price: 5000, scale: null },
  { name: '燃風自來也', manufacturer: '燃風', price: 6500, scale: null },
  { name: '大比例女帝', manufacturer: 'LSP', price: 15000, scale: '大比例' },
  { name: '貝吉塔', manufacturer: 'Kylin', price: 9500, scale: '1/4' },
  { name: 'CS 對戰', manufacturer: 'CS', price: 10500, scale: '1/4' },
  { name: '千與千尋至尊版', manufacturer: '白鹿', price: 20000, scale: null },
  { name: '夢幻 艾斯', manufacturer: '夢幻', price: 6000, scale: '1/5' },
  { name: '日向翔陽', manufacturer: 'Hikari', price: 9900, scale: null },
  { name: '月島螢', manufacturer: 'Hikari', price: 8000, scale: null },
  { name: '及川徹', manufacturer: 'Hikari', price: 5000, scale: null },
  { name: '孤爪研磨', manufacturer: 'Hikari', price: 4500, scale: null },
  { name: '瑪奇瑪', manufacturer: 'Dodomo', price: 9000, scale: null },
  { name: '約兒 豪華版A', manufacturer: 'Creation', price: 25000, scale: null },
  { name: '星輪歐米伽 低配', manufacturer: '杏極', price: 20000, scale: null },
  { name: '六道仙人 大筒木羽衣 cos安妮亞', manufacturer: 'ZH', price: 3000, scale: null },
  { name: '4檔魯夫', manufacturer: '正模BBT', price: 15000, scale: '1/6' },
  { name: '赤犬', manufacturer: null, price: 15000, scale: null },
  { name: '進擊的巨人&女巨人', manufacturer: '集美殿堂', price: 35000, scale: '66.5cm' },
  { name: '莉莉絲 LILITH', manufacturer: 'AmerFort PIJ杏極', price: 22000, scale: '1/4' },
  { name: '小普烏 七龍珠 高配版', manufacturer: '文明', price: 6000, scale: null },
  { name: '雲頂佐助', manufacturer: '雲頂', price: 110000, scale: null },
  { name: '鋼鐵人馬克7', manufacturer: null, price: 50000, scale: '1/1' },
  { name: '混沌鳴人 高配版', manufacturer: null, price: 4800, scale: null },
  { name: '白鹿油屋 至尊款', manufacturer: '白鹿', price: 19000, scale: null },
  { name: '戰損五條悟', manufacturer: 'Hero collectible', price: 17000, scale: null },
  { name: '金木研', manufacturer: 'Damocles', price: 15000, scale: null },
  { name: '雲頂摘星 佐助 須佐能乎', manufacturer: '雲頂', price: 11500, scale: '85cm' },
  { name: '超夢', manufacturer: 'UA正版授權', price: 8300, scale: null },
  { name: '索隆vs霍金斯 GK雕像', manufacturer: '集美殿堂', price: 9000, scale: null },
  { name: '巷戰兵長', manufacturer: 'model power', price: 9000, scale: null },
  { name: '凱巨vs獸巨', manufacturer: 'chikara天地之戰', price: 17000, scale: null },
  { name: '炎柱 含特典', manufacturer: '幻想屋', price: 22000, scale: null },
  { name: '安妮亞 五條悟 白髮抽象', manufacturer: null, price: 2850, scale: null },
  { name: '十年百忍鼬田', manufacturer: null, price: 2000, scale: null },
  { name: 'SRS 低配宿儺', manufacturer: 'SRS', price: 6600, scale: null },
  { name: '凱多vs魯夫', manufacturer: '幻想屋', price: 20000, scale: null },
  { name: '千尋至尊版', manufacturer: '白鹿', price: 22000, scale: null },
  { name: '漫匠女帝', manufacturer: '漫匠', price: 6000, scale: null },
  { name: '幕府索隆', manufacturer: '幕府', price: 16500, scale: null },
  { name: '噴火龍對戰組', manufacturer: '小匙鎮 漫奇', price: 6500, scale: null },
  { name: '國風女帝', manufacturer: 'Third Eye 第三隻眼', price: 6000, scale: '1/4' },
  { name: '王座暗遊戲阿圖姆 三幻神大集合', manufacturer: '第三空間', price: 15000, scale: null },
  { name: '白月魁vs馬克 靈籠', manufacturer: '靈籠', price: 23000, scale: null },
  { name: '櫻木平交道', manufacturer: '幕后x無限', price: 8000, scale: null },
  { name: '暴龍進化組 DX版', manufacturer: '暴龍社', price: 36000, scale: null },
  { name: '彈跳人魯夫', manufacturer: '魔風漫奇', price: 15000, scale: null },
  { name: '羅賓', manufacturer: '霸權社', price: 4500, scale: '1/4' },
  { name: '烏爾奇奧拉', manufacturer: 'Cross studio', price: 6000, scale: null },
  { name: '啟明女帝', manufacturer: 'Venus Studio', price: 5500, scale: null },
  { name: '鑽石 艾斯', manufacturer: null, price: 3000, scale: null },
  { name: '不知火舞', manufacturer: 'Snk 正版授權', price: 12800, scale: null },
  { name: '鼬', manufacturer: '鐵風箏', price: 20000, scale: null },
  { name: '青治', manufacturer: '天機X', price: 10000, scale: null },
  { name: '哥爾D羅傑', manufacturer: '集美殿堂', price: 26000, scale: null },
  { name: '鳳凰與三聖獸', manufacturer: '新月 Crescent-Studio', price: 8000, scale: null },
  { name: '死亡擱淺 山姆', manufacturer: 'P1S', price: 50000, scale: null },
  { name: '伏黑惠', manufacturer: '逆刃', price: 16000, scale: null },
  { name: '日本人形小紫', manufacturer: '萬代', price: 30000, scale: null },
  { name: '阿璃', manufacturer: '集美殿堂', price: 14000, scale: null },
  { name: '白鬍子', manufacturer: '模還原', price: 5000, scale: null },
  { name: '卡二', manufacturer: '天機', price: 4500, scale: null },
  { name: '黑鬍子', manufacturer: '集美殿堂', price: 20000, scale: null },
  { name: '魔導少年 納茲', manufacturer: 'L Seven', price: 6000, scale: null },
  { name: '漫奇羅 含配件包及小時候特典', manufacturer: '漫奇', price: 28000, scale: null },
  { name: '黑化小傑', manufacturer: 'PG STUDIO', price: 10000, scale: null },
  { name: '宇智波斑', manufacturer: null, price: 8500, scale: null },
  { name: '索隆高配', manufacturer: '夢幻', price: 7500, scale: null },
  { name: '星辰尼特羅', manufacturer: null, price: 3300, scale: null },
  { name: '酒龍凱多 異色版', manufacturer: 'BBF', price: 3000, scale: null },
  { name: '幻影薩波', manufacturer: '幻影', price: 8000, scale: null },
  { name: '黑鬍子女帝', manufacturer: 'Lx', price: 20000, scale: null },
  { name: '夢幻索隆', manufacturer: '夢幻', price: 3800, scale: null },
  { name: '黑魔導', manufacturer: '幻影', price: 11000, scale: null },
  { name: '女帝', manufacturer: null, price: 6000, scale: '1/6' },
  { name: '極之番宿儺', manufacturer: null, price: 9000, scale: null },
  { name: '黃猿', manufacturer: '集美', price: 23000, scale: null },
  { name: '神啟的鳴人', manufacturer: '神啟', price: 4000, scale: null },
  { name: '五條豪華版', manufacturer: null, price: 11000, scale: '1/2' },
  { name: '和之國魯夫', manufacturer: null, price: 8000, scale: '1/4' },
  { name: '白鬍子 LB版', manufacturer: 'LB', price: 4500, scale: null },
  { name: '香吉士大將版', manufacturer: 'Uking', price: 5500, scale: null },
  { name: '十年百忍須佐鼬', manufacturer: null, price: 9600, scale: null },
  { name: '羅傑', manufacturer: '集美殿堂', price: 27000, scale: null },
  { name: '回眸艾斯', manufacturer: null, price: 6900, scale: null },
  { name: '洛奇亞爆誕+三神鳥', manufacturer: '正模', price: 2000, scale: null },
  { name: 'Sx明日香', manufacturer: null, price: 8000, scale: null },
  { name: '鬼谷傑爾馬索隆電鍍版', manufacturer: null, price: 2000, scale: null },
  { name: '義勇GK', manufacturer: null, price: 10000, scale: null },
  { name: '海馬瀨人&青眼究極龍', manufacturer: 'Kitsune Statue', price: 15000, scale: null },
  { name: '十月梧桐黑魔導女孩', manufacturer: null, price: 12000, scale: null },
  { name: 'Street Fighter 豪鬼&龍', manufacturer: 'P1 studio', price: 50000, scale: null },
  { name: '卡魯夫', manufacturer: '漫匠尼', price: 5000, scale: null },
  { name: '鐵幕暗影忍者', manufacturer: null, price: 13000, scale: null },
  { name: '御三家生態 妙蛙種子妙蛙花', manufacturer: 'PPAP', price: 5500, scale: null },
  { name: '豪華版紫 索隆', manufacturer: '品匠萌奇', price: 5000, scale: null },
  { name: '霸王色紅髮', manufacturer: null, price: 22500, scale: null },
  { name: '巔峰極致艾斯', manufacturer: null, price: 22500, scale: null },
  { name: '炎帝艾斯', manufacturer: null, price: 17500, scale: null },
  { name: '渡鴉', manufacturer: '初超', price: 7000, scale: null },
  { name: '週年慶紅髮', manufacturer: null, price: 17000, scale: null },
  { name: '新月耿鬼加特典', manufacturer: '新月', price: 5000, scale: null },
  { name: '大傑vs貓女', manufacturer: null, price: 18000, scale: null },
  { name: '黃蜂貝卡斯', manufacturer: null, price: 21000, scale: null },
  { name: '流風卡卡西', manufacturer: '流風', price: 15000, scale: null },
  { name: '流風柱間', manufacturer: '流風', price: 10000, scale: null },
]

export async function GET() {
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    details: [] as string[],
  }

  for (const figure of figuresData) {
    try {
      // 檢查是否已存在（用完全匹配）
      const { data: existing } = await supabase
        .from('figures')
        .select('id')
        .eq('name', figure.name)
        .limit(1)

      if (existing && existing.length > 0) {
        results.skipped++
        results.details.push(`跳過: ${figure.name}`)
        continue
      }

      // 插入新資料
      const { data: newFigure, error } = await supabase
        .from('figures')
        .insert({
          name: figure.name,
          manufacturer: figure.manufacturer,
          series: figure.scale ? `GK ${figure.scale}` : 'GK',
          market_price_min: figure.price ? Math.round(figure.price * 0.9) : null,
          market_price_max: figure.price ? Math.round(figure.price * 1.1) : null,
        })
        .select()
        .single()

      if (error) {
        results.failed++
        results.details.push(`失敗: ${figure.name} - ${error.message}`)
      } else {
        results.success++
        results.details.push(`成功: ${figure.name}`)

        // 新增一筆成交紀錄
        if (figure.price && newFigure) {
          await supabase
            .from('transactions')
            .insert({
              figure_id: newFigure.id,
              price: figure.price,
              source: '公仔價格01.pdf',
            })
        }
      }
    } catch (err) {
      results.failed++
      results.details.push(`錯誤: ${figure.name} - ${err}`)
    }
  }

  return NextResponse.json({
    message: '匯入完成',
    總筆數: figuresData.length,
    成功: results.success,
    跳過: results.skipped,
    失敗: results.failed,
    details: results.details,
  })
}
