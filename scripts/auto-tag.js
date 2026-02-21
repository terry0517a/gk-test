/**
 * 自動標記腳本 - 為公仔加上動漫系列標籤
 *
 * 使用方式：
 * 1. node scripts/auto-tag.js --dry-run    # 預覽標記結果（不寫入）
 * 2. node scripts/auto-tag.js              # 執行標記
 * 3. node scripts/auto-tag.js --all        # 重新標記所有（含已有 tag 的）
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 請設定 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TAG_ALL = args.includes('--all');

// ====== 系列關鍵字對照表 ======
// 順序很重要：越具體的放越前面，避免被通用詞先匹配
const TAG_RULES = [
  {
    tag: '海賊王',
    keywords: [
      '海賊王', 'ONE PIECE', 'ONEPIECE',
      '魯夫', '索隆', '香吉士', '娜美', '羅賓', '喬巴', '騙人布', '佛朗乔', '布魯克',
      '凱多', '白鬍子', '紅髮', '黑鬍子', '艾斯', '薩波',
      '羅', '甚平', '女帝', '蛇姬', '漢庫克',
      '大媽', '多佛朗明哥', '明哥',
      '草帽', '和之國', '鬼島',
      '尼卡', '五檔', '四檔', '太陽神',
      'LUFFY', 'ZORO', 'SANJI', 'NAMI', 'KAIDO', 'SHANKS',
      'WHITEBEARD', 'BLACKBEARD', 'TRAFALGAR', 'NIKA',
      '羅傑', '戰國', '卡普', '赤犬', '青雉', '黃猿',
      '巴乔', '甚平', '罗宾', '弗兰奇',
    ],
  },
  {
    tag: '七龍珠',
    keywords: [
      '七龍珠', '龍珠', 'DRAGON BALL', 'DRAGONBALL', 'DBZ',
      '悟空', '悟飯', '悟天', '弗利沙', '弗力札', '布羅利', '布洛利',
      '貝吉塔', '達爾', '比克', '比魯斯', '全王',
      '賽亞人', '超級賽亞', '自在極意',
      '特南克斯', '短笛', '天津飯', '克林',
      '人造人', '賽魯', '魔人普烏', '布歐',
      'GOKU', 'VEGETA', 'FRIEZA', 'BROLY', 'GOHAN', 'BEERUS',
      '龜仙人', '亞莫斯', '琪琪', '布瑪',
    ],
  },
  {
    tag: '火影忍者',
    keywords: [
      '火影忍者', '火影', 'NARUTO', 'BORUTO',
      '鳴人', '佐助', '卡卡西', '小櫻', '綱手', '自來也', '大蛇丸',
      '曉', '木葉', '忍者', '須佐能乎', '寫輪眼', '輪迴眼',
      '宇智波', '旋渦', '我愛羅', '鼬', '斑', '帶土',
      '六道', '仙人模式', '尾獸', '九尾', '九喇嘛',
      '佐井', '雛田', '日向',
      'SASUKE', 'KAKASHI', 'ITACHI', 'MADARA', 'MINATO',
      '四代目', '波風', '水門',
    ],
  },
  {
    tag: '鬼滅之刃',
    keywords: [
      '鬼滅之刃', '鬼滅', 'DEMON SLAYER', 'KIMETSU',
      '炭治郎', '禰豆子', '善逸', '伊之助',
      '煉獄', '義勇', '蟲柱', '胡蝶', '甘露寺', '戀柱',
      '時透', '霞柱', '悲鳴', '岩柱', '蛇柱', '風柱', '不死川',
      '猗窩座', '無慘', '鬼舞辻', '黑死牟', '童磨', '堕姬', '妓夫太郎',
      '竈門', '柱',
      'TANJIRO', 'NEZUKO', 'ZENITSU', 'RENGOKU',
    ],
  },
  {
    tag: '咒術回戰',
    keywords: [
      '咒術回戰', '咒術', 'JUJUTSU KAISEN', 'JJK',
      '五條悟', '五条悟', '虎杖', '伏黑', '釘崎',
      '兩面宿儺', '宿儺', '夏油', '乙骨',
      '七海', '東堂', '禪院', '真人', '漏瑚',
      '領域展開', '無量空處', '無下限',
      'GOJO', 'ITADORI', 'SUKUNA', 'FUSHIGURO',
    ],
  },
  {
    tag: '進擊的巨人',
    keywords: [
      '進擊的巨人', '進擊', 'ATTACK ON TITAN', 'AOT', 'SHINGEKI',
      '艾倫', '三笠', '米卡莎', '里維', '兵長', '利威爾',
      '阿爾敏', '巨人', '始祖巨人', '進擊巨人',
      '立體機動', '調查兵團',
      'EREN', 'MIKASA', 'LEVI', 'ARMIN',
    ],
  },
  {
    tag: '鏈鋸人',
    keywords: [
      '鏈鋸人', '鏈鎖人', '鏈鋸', 'CHAINSAW MAN', 'CHAINSAWMAN',
      '淀治', '電次', '瑪奇瑪', '帕瓦', '早川秋',
      '蕾塞', '姬野', '惡魔獵人',
      'DENJI', 'MAKIMA', 'POWER', 'POCHITA',
      '波奇塔',
    ],
  },
  {
    tag: '間諜家家酒',
    keywords: [
      '間諜家家酒', 'SPY.*FAMILY', 'SPY×FAMILY', 'SPYFAMILY',
      '安妮亞', '佛傑', '約爾', '阿尼亞',
      'ANYA', 'LOID', 'YOR',
    ],
  },
  {
    tag: '葬送的芙莉蓮',
    keywords: [
      '芙莉蓮', '葬送', 'FRIEREN',
      '費倫', '欣梅爾', '海塔', '修塔爾克',
      'FERN', 'HIMMEL', 'STARK',
    ],
  },
  {
    tag: '寶可夢',
    keywords: [
      '寶可夢', '寶可', '神奇寶貝', 'POKEMON', 'POKÉMON',
      '皮卡丘', '噴火龍', '超夢', '夢幻', '水箭龜', '妙蛙種子',
      '伊布', '卡比獸', '快龍', '耿鬼',
      '甲賀忍蛙', '路卡利歐', '噴火龍',
      'PIKACHU', 'CHARIZARD', 'MEWTWO', 'MEW', 'EEVEE',
    ],
  },
  {
    tag: '原神',
    keywords: [
      '原神', 'GENSHIN', 'GENSHIN IMPACT',
      '胡桃', '雷電將軍', '鐘離', '甘雨', '魈',
      '可莉', '溫迪', '刻晴', '莫娜', '八重神子', '宵宮',
      '神里', '綾華', '楓原', '行秋', '公子', '達達利亞',
      '納西妲', '提瓦特', '璃月', '蒙德', '稻妻',
      '夜蘭', '妮露', '流浪者', '芙寧娜', '那維萊特',
    ],
  },
  {
    tag: '碧藍航線',
    keywords: [
      '碧藍航線', 'AZUR LANE', 'AZURLANE',
      '企業', '光輝', '貝爾法斯特', '大鳳', '愛宕', '高雄',
      '信濃', '可畏', '歐根親王', '俾斯麥',
      '蒼龍', '赤城', '加賀',
    ],
  },
  {
    tag: '明日方舟',
    keywords: [
      '明日方舟', 'ARKNIGHTS',
      '阿米婭', '陳', '銀灰', '艾雅法拉', '能天使',
      '德克薩斯', '拉普蘭德', '棘刺', '浊心斯卡蒂',
      '整合運動', '羅德島',
    ],
  },
  {
    tag: '我的英雄學院',
    keywords: [
      '我的英雄', '英雄學院', 'MY HERO ACADEMIA', 'BOKU NO HERO', 'MHA',
      '綠谷', '爆豪', '轟', '歐爾麥特', 'ALL MIGHT',
      '出久', '勝己', '焦凍',
      'DEKU', 'BAKUGO', 'TODOROKI',
    ],
  },
  {
    tag: '獵人',
    keywords: [
      '獵人', 'HUNTER.*HUNTER', 'HXH',
      '小傑', '奇犽', '酷拉皮卡', '西索', '幻影旅團',
      '尼特羅', '金', '會長', '螞蟻篇', '嵌合蟻',
      'GON', 'KILLUA', 'HISOKA', 'KURAPIKA',
    ],
  },
  {
    tag: '刀劍神域',
    keywords: [
      '刀劍神域', 'SWORD ART ONLINE', 'SAO',
      '桐人', '亞絲娜', '愛麗絲', '尤吉歐',
      'KIRITO', 'ASUNA', 'ALICE',
    ],
  },
  {
    tag: 'JOJO的奇妙冒險',
    keywords: [
      'JOJO', '奇妙冒險',
      '承太郎', '迪奧', 'DIO', '喬魯諾', '白金之星',
      '替身', 'STAND', 'JOESTAR',
      '布乔', '吉良',
    ],
  },
  {
    tag: '東京復仇者',
    keywords: [
      '東京復仇者', '東卍', 'TOKYO REVENGERS',
      '花垣', '佐野', '瓦武', '馬場',
      'MIKEY', 'DRAKEN',
    ],
  },
  {
    tag: '蠟筆小新',
    keywords: [
      '蠟筆小新', '小新', 'CRAYON SHIN',
      '野原新之助', '野原', '春日部',
    ],
  },
  {
    tag: '哆啦A夢',
    keywords: [
      '哆啦A夢', '哆啦', '多啦A夢', 'DORAEMON',
      '大雄', '靜香', '胖虎', '小夫',
      '竹蜻蜓', '任意門',
    ],
  },
  {
    tag: '新世紀福音戰士',
    keywords: [
      'EVA', 'EVANGELION', '福音戰士', '新世紀',
      '碇真嗣', '綾波零', '明日香', '渚薰',
      '初號機', '貳號機', 'NERV',
      'REI', 'ASUKA', 'SHINJI',
    ],
  },
  {
    tag: '排球少年',
    keywords: [
      '排球少年', 'HAIKYUU',
      '日向', '影山', '烏野', '及川',
    ],
  },
  {
    tag: '死神',
    keywords: [
      '死神', 'BLEACH',
      '黑崎一護', '一護', '朽木露琪亞', '朽木白哉',
      '藍染', '日番谷', '斬魄刀', '卍解',
      'ICHIGO', 'RUKIA', 'AIZEN',
    ],
  },
  {
    tag: '航海王',
    keywords: [
      // 航海王是海賊王的別名，但放在最後作為備用
    ],
  },
  {
    tag: '初音未來',
    keywords: [
      '初音', '初音未來', 'HATSUNE MIKU', 'MIKU',
      'VOCALOID',
    ],
  },
  {
    tag: '命運系列',
    keywords: [
      'FATE', 'FGO',
      'SABER', '貞德', '阿爾托莉雅', '遠坂凛', '間桐',
      '聖杯戰爭', 'SERVANT', 'MASTER',
      '金閃閃', '吉爾伽美什',
    ],
  },
  {
    tag: 'Re:從零開始',
    keywords: [
      'RE:ZERO', 'RE：ZERO', 'RE0', '從零開始',
      '愛蜜莉雅', '雷姆', '拉姆', '艾蜜莉亞',
      'EMILIA', 'REM', 'RAM',
    ],
  },
  {
    tag: '刃牙',
    keywords: [
      '刃牙', 'BAKI',
      '範馬', '花山', '愚地',
    ],
  },
  {
    tag: '灌籃高手',
    keywords: [
      '灌籃高手', 'SLAM DUNK',
      '櫻木花道', '流川楓', '赤木', '三井',
      '湘北', '陵南',
    ],
  },
];

// 移除「航海王」空規則（已合併到海賊王）
const ACTIVE_RULES = TAG_RULES.filter(r => r.keywords.length > 0);

/**
 * 根據名稱匹配標籤
 */
function matchTag(name) {
  const upperName = name.toUpperCase();

  for (const rule of ACTIVE_RULES) {
    for (const keyword of rule.keywords) {
      const upperKeyword = keyword.toUpperCase();
      // 如果 keyword 包含 .* (正則)，使用正則匹配
      if (keyword.includes('.*')) {
        try {
          const regex = new RegExp(upperKeyword, 'i');
          if (regex.test(upperName)) return rule.tag;
        } catch {
          // 正則無效，跳過
        }
      } else if (upperName.includes(upperKeyword)) {
        return rule.tag;
      }
    }
  }

  return null;
}

async function main() {
  console.log('🏷️  自動標記腳本');
  console.log(`   模式: ${DRY_RUN ? '預覽（dry-run）' : '執行寫入'}`);
  console.log(`   範圍: ${TAG_ALL ? '所有公仔' : '僅 tag=NULL 的公仔'}`);
  console.log('');

  // 分批讀取公仔
  const PAGE_SIZE = 1000;
  let offset = 0;
  let totalTagged = 0;
  let totalSkipped = 0;
  const tagCounts = {};

  while (true) {
    let query = supabase
      .from('figures')
      .select('id, name')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (!TAG_ALL) {
      query = query.is('tag', null);
    }

    const { data: figures, error } = await query;

    if (error) {
      console.error('❌ 查詢失敗:', error.message);
      process.exit(1);
    }

    if (!figures || figures.length === 0) break;

    console.log(`📦 處理第 ${offset + 1} - ${offset + figures.length} 筆...`);

    const updates = []; // batch updates

    for (const figure of figures) {
      const tag = matchTag(figure.name);

      if (tag) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        totalTagged++;

        if (!DRY_RUN) {
          updates.push({ id: figure.id, tag });
        }
      } else {
        totalSkipped++;
      }
    }

    // 批次寫入
    if (!DRY_RUN && updates.length > 0) {
      // Supabase 不支援批次 update，逐筆更新
      for (const u of updates) {
        const { error: updateError } = await supabase
          .from('figures')
          .update({ tag: u.tag })
          .eq('id', u.id);

        if (updateError) {
          console.error(`  ❌ 更新失敗 (${u.id}):`, updateError.message);
        }
      }
      console.log(`  ✅ 寫入 ${updates.length} 筆標籤`);
    }

    offset += PAGE_SIZE;

    // 如果回傳不滿一頁，表示已到最後
    if (figures.length < PAGE_SIZE) break;
  }

  // 印出結果
  console.log('\n📊 標記結果統計：');
  console.log(`   已標記: ${totalTagged}`);
  console.log(`   未匹配: ${totalSkipped}`);
  console.log('');

  // 按數量排序顯示
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  console.log('📋 各標籤數量：');
  for (const [tag, count] of sorted) {
    console.log(`   ${tag}: ${count}`);
  }

  if (DRY_RUN) {
    console.log('\n⚠️  以上為預覽結果，實際未寫入。移除 --dry-run 參數即可執行寫入。');
  }
}

main().catch(console.error);
