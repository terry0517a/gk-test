-- 先刪除模擬資料
DELETE FROM transactions WHERE figure_id IN (
  SELECT id FROM figures WHERE name LIKE '%五條悟%' AND manufacturer = '測試工作室'
);
DELETE FROM figures WHERE name LIKE '%五條悟%' AND manufacturer = '測試工作室';

-- 匯入公仔價格01.pdf 資料
-- 每筆資料都會新增到 figures 表，並建立一筆成交紀錄

DO $$
DECLARE
  new_figure_id uuid;
BEGIN
  -- 1. 索隆 三刀流虎虎婆
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('索隆 三刀流虎虎婆', 'ShowMaker + OldTime 彪狩', 'GK 1/6', 9000, 11000)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 10000, '公仔價格01.pdf');
  END IF;

  -- 2. 牛頭一吼咕 2.0
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('牛頭一吼咕 2.0', NULL, 'GK 1/6', 4500, 5500)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 5000, '公仔價格01.pdf');
  END IF;

  -- 3. 花海艾倫a款
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('花海艾倫a款', '名場面工作室', 'GK', 4050, 4950)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 4500, '公仔價格01.pdf');
  END IF;

  -- 4. 壽島孝牧 火焰冥王
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('壽島孝牧 火焰冥王', '末那末匠', 'GK 1/4', 36900, 45100)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 41000, '公仔價格01.pdf');
  END IF;

  -- 5. 阿薩謝爾
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('阿薩謝爾', '金鳥工作室', 'GK 1/1', 2250, 2750)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 2500, '公仔價格01.pdf');
  END IF;

  -- 6. 夏油傑
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('夏油傑', '逆刃', 'GK', 13050, 15950)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 14500, '公仔價格01.pdf');
  END IF;

  -- 7. time五條悟 頂配
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('time五條悟 頂配', '夢之船', 'GK', 19800, 24200)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 22000, '公仔價格01.pdf');
  END IF;

  -- 8. 五條悟 頂配版 含特典
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('五條悟 頂配版 含特典', 'Time 夢之船', 'GK', 17100, 20900)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 19000, '公仔價格01.pdf');
  END IF;

  -- 9. Du布羅利
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('Du布羅利', NULL, 'GK 65cm', 7875, 9625)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 8750, '公仔價格01.pdf');
  END IF;

  -- 10. 奔向山丘那棵樹
  INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max)
  VALUES ('奔向山丘那棵樹', 'freedom studio', 'GK', 13050, 15950)
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_figure_id;
  IF new_figure_id IS NOT NULL THEN
    INSERT INTO transactions (figure_id, price, source) VALUES (new_figure_id, 14500, '公仔價格01.pdf');
  END IF;

END $$;

-- 簡化版：直接 INSERT 所有資料（如果上面的 DO 區塊有問題）

INSERT INTO figures (name, manufacturer, series, market_price_min, market_price_max) VALUES
('刀劍神域 黑衣劍士 桐人 GK', 'X-工作室', 'GK', 4500, 5500),
('燃風自來也', '燃風', 'GK', 5850, 7150),
('大比例女帝', 'LSP', 'GK 大比例', 13500, 16500),
('貝吉塔', 'Kylin', 'GK 1/4', 8550, 10450),
('CS 對戰', 'CS', 'GK 1/4', 9450, 11550),
('千與千尋至尊版', '白鹿', 'GK', 18000, 22000),
('夢幻 艾斯', '夢幻', 'GK 1/5', 5400, 6600),
('日向翔陽', 'Hikari', 'GK', 8910, 10890),
('月島螢', 'Hikari', 'GK', 7200, 8800),
('及川徹', 'Hikari', 'GK', 4500, 5500),
('孤爪研磨', 'Hikari', 'GK', 4050, 4950),
('瑪奇瑪', 'Dodomo', 'GK', 8100, 9900),
('約兒 豪華版A', 'Creation', 'GK', 22500, 27500),
('星輪歐米伽 低配', '杏極', 'GK', 18000, 22000),
('六道仙人 大筒木羽衣 cos安妮亞', 'ZH', 'GK', 2700, 3300),
('4檔魯夫', '正模BBT', 'GK 1/6', 13500, 16500),
('進擊的巨人&女巨人', '集美殿堂', 'GK 66.5cm', 31500, 38500),
('莉莉絲 LILITH', 'AmerFort PIJ杏極', 'GK 1/4', 19800, 24200),
('小普烏 七龍珠 高配版', '文明', 'GK', 5400, 6600),
('雲頂佐助', '雲頂', 'GK', 99000, 121000),
('鋼鐵人馬克7', NULL, 'GK 1/1', 45000, 55000),
('混沌鳴人 高配版', NULL, 'GK', 4320, 5280),
('白鹿油屋 至尊款', '白鹿', 'GK', 17100, 20900),
('戰損五條悟', 'Hero collectible', 'GK', 15300, 18700),
('金木研', 'Damocles', 'GK', 13500, 16500),
('雲頂摘星 佐助 須佐能乎', '雲頂', 'GK 85cm', 10350, 12650),
('超夢', 'UA正版授權', 'GK', 7470, 9130),
('索隆vs霍金斯 GK雕像', '集美殿堂', 'GK', 8100, 9900),
('巷戰兵長', 'model power', 'GK', 8100, 9900),
('凱巨vs獸巨', 'chikara天地之戰', 'GK', 15300, 18700),
('炎柱 含特典', '幻想屋', 'GK', 19800, 24200),
('安妮亞 五條悟 白髮抽象', NULL, 'GK', 2565, 3135),
('十年百忍鼬田', NULL, 'GK', 1800, 2200),
('SRS 低配宿儺', 'SRS', 'GK', 5940, 7260),
('凱多vs魯夫', '幻想屋', 'GK', 18000, 22000),
('千尋至尊版', '白鹿', 'GK', 19800, 24200),
('漫匠女帝', '漫匠', 'GK', 5400, 6600),
('幕府索隆', '幕府', 'GK', 14850, 18150),
('噴火龍對戰組', '小匙鎮 漫奇', 'GK', 5850, 7150),
('國風女帝', 'Third Eye 第三隻眼', 'GK 1/4', 5400, 6600),
('王座暗遊戲阿圖姆 三幻神大集合', '第三空間', 'GK', 13500, 16500),
('白月魁vs馬克 靈籠', '靈籠', 'GK', 20700, 25300),
('櫻木平交道', '幕后x無限', 'GK', 7200, 8800),
('暴龍進化組 DX版', '暴龍社', 'GK', 32400, 39600),
('彈跳人魯夫', '魔風漫奇', 'GK', 13500, 16500),
('羅賓', '霸權社', 'GK 1/4', 4050, 4950),
('烏爾奇奧拉', 'Cross studio', 'GK', 5400, 6600),
('啟明女帝', 'Venus Studio', 'GK', 4950, 6050),
('鑽石 艾斯', NULL, 'GK', 2700, 3300),
('不知火舞', 'Snk 正版授權', 'GK', 11520, 14080),
('鼬', '鐵風箏', 'GK', 18000, 22000),
('青治', '天機X', 'GK', 9000, 11000),
('哥爾D羅傑', '集美殿堂', 'GK', 23400, 28600),
('鳳凰與三聖獸', '新月 Crescent-Studio', 'GK', 7200, 8800),
('死亡擱淺 山姆', 'P1S', 'GK', 45000, 55000),
('伏黑惠', '逆刃', 'GK', 14400, 17600),
('日本人形小紫', '萬代', 'GK', 27000, 33000),
('阿璃', '集美殿堂', 'GK', 12600, 15400),
('白鬍子', '模還原', 'GK', 4500, 5500),
('卡二', '天機', 'GK', 4050, 4950),
('黑鬍子', '集美殿堂', 'GK', 18000, 22000),
('魔導少年 納茲', 'L Seven', 'GK', 5400, 6600),
('漫奇羅 含配件包及小時候特典', '漫奇', 'GK', 25200, 30800),
('黑化小傑', 'PG STUDIO', 'GK', 9000, 11000),
('宇智波斑', NULL, 'GK', 7650, 9350),
('索隆高配', '夢幻', 'GK', 6750, 8250),
('星辰尼特羅', NULL, 'GK', 2970, 3630),
('酒龍凱多 異色版', 'BBF', 'GK', 2700, 3300),
('幻影薩波', '幻影', 'GK', 7200, 8800),
('黑鬍子女帝', 'Lx', 'GK', 18000, 22000),
('夢幻索隆', '夢幻', 'GK', 3420, 4180),
('黑魔導', '幻影', 'GK', 9900, 12100),
('女帝', NULL, 'GK 1/6', 5400, 6600),
('極之番宿儺', NULL, 'GK', 8100, 9900),
('黃猿', '集美', 'GK', 20700, 25300),
('神啟的鳴人', '神啟', 'GK', 3600, 4400),
('五條豪華版', NULL, 'GK 1/2', 9900, 12100),
('和之國魯夫', NULL, 'GK 1/4', 7200, 8800),
('白鬍子 LB版', 'LB', 'GK', 4050, 4950),
('香吉士大將版', 'Uking', 'GK', 4950, 6050),
('十年百忍須佐鼬', NULL, 'GK', 8640, 10560),
('羅傑', '集美殿堂', 'GK', 24300, 29700),
('回眸艾斯', NULL, 'GK', 6210, 7590),
('洛奇亞爆誕+三神鳥', '正模', 'GK', 1800, 2200),
('Sx明日香', NULL, 'GK', 7200, 8800),
('鬼谷傑爾馬索隆電鍍版', NULL, 'GK', 1800, 2200),
('義勇GK', NULL, 'GK', 9000, 11000),
('海馬瀨人&青眼究極龍', 'Kitsune Statue', 'GK', 13500, 16500),
('十月梧桐黑魔導女孩', NULL, 'GK', 10800, 13200),
('Street Fighter 豪鬼&龍', 'P1 studio', 'GK', 45000, 55000),
('卡魯夫', '漫匠尼', 'GK', 4500, 5500),
('鐵幕暗影忍者', NULL, 'GK', 11700, 14300),
('御三家生態 妙蛙種子妙蛙花', 'PPAP', 'GK', 4950, 6050),
('豪華版紫 索隆', '品匠萌奇', 'GK', 4500, 5500),
('霸王色紅髮', NULL, 'GK', 20250, 24750),
('巔峰極致艾斯', NULL, 'GK', 20250, 24750),
('炎帝艾斯', NULL, 'GK', 15750, 19250),
('渡鴉', '初超', 'GK', 6300, 7700),
('週年慶紅髮', NULL, 'GK', 15300, 18700),
('新月耿鬼加特典', '新月', 'GK', 4500, 5500),
('大傑vs貓女', NULL, 'GK', 16200, 19800),
('黃蜂貝卡斯', NULL, 'GK', 18900, 23100),
('流風卡卡西', '流風', 'GK', 13500, 16500),
('流風柱間', '流風', 'GK', 9000, 11000),
('赤犬', NULL, 'GK', 13500, 16500),
('赤犬', '天機X', 'GK', 5400, 6600)
ON CONFLICT DO NOTHING;

-- 為每筆資料建立成交紀錄
INSERT INTO transactions (figure_id, price, source)
SELECT id, (market_price_min + market_price_max) / 2, '公仔價格01.pdf'
FROM figures
WHERE series LIKE 'GK%'
AND NOT EXISTS (
  SELECT 1 FROM transactions t WHERE t.figure_id = figures.id AND t.source = '公仔價格01.pdf'
);

-- 顯示匯入結果
SELECT COUNT(*) as "匯入公仔數量" FROM figures WHERE series LIKE 'GK%';
