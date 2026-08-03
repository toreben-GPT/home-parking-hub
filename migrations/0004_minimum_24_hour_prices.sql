-- Preserve the previous current pricing row as history, then promote a copied
-- row whose 24-hour fields follow the minimum-over-all-entry-times rule.
-- Historical seed names are included so local/imported data is corrected too.
INSERT INTO pricing_versions (
  id, parking_lot_id, source_text, base_rate, weekday_maximum,
  holiday_maximum, night_maximum, night_hours, maximum_repeat,
  exceptions, pattern_prices, change_note, is_current, created_at
)
SELECT
  'pricing-24h-audit-20260803-' || current.parking_lot_id,
  current.parking_lot_id,
  current.source_text,
  current.base_rate,
  current.weekday_maximum,
  current.holiday_maximum,
  current.night_maximum,
  current.night_hours,
  current.maximum_repeat,
  CASE lot.name
    WHEN 'セイワパーク比恵町4' THEN '24時間最安の算出に必要な基本時間料金が看板写真にないため要確認。'
    ELSE '24時間料金は、特定の入庫時刻に固定せず、24時間利用できる全入庫時刻のうち最安となる料金を算出。'
  END,
  json_set(
    current.pattern_prices,
    '$."W-24".amountYen',
    CASE lot.name
      WHEN 'DパーキンググレースK博多PS第1' THEN 900
      WHEN 'IBパーク駅東' THEN 2900
      WHEN 'IBパーク 駅東' THEN 2900
      WHEN 'PARKS PARK福岡博多駅東3丁目' THEN 2000
      WHEN 'PARKS PARK 福岡博多駅東3丁目' THEN 2000
      WHEN 'あるあるパーキング博多駅東2丁目' THEN 2800
      WHEN 'セイワパーク博多駅東' THEN 1800
      WHEN 'セイワパーク博多駅東2丁目2' THEN 1500
      WHEN 'セイワパーク比恵町4' THEN json('null')
      WHEN 'タイムスペース 博多駅東第6駐車場' THEN 2700
      WHEN 'タイムスペース 博多駅東第7駐車場' THEN 1500
      WHEN 'タイムパーク 駅東エヌアイパーキング' THEN 1700
      WHEN 'ライオンパーキング東F' THEN 1700
      WHEN 'ラッキーパーキング東F' THEN 1700
      WHEN 'ライオンパーク駅東7' THEN 1900
    END,
    '$."W-24".needsConfirmation',
    CASE WHEN lot.name = 'セイワパーク比恵町4' THEN json('true') ELSE json('false') END,
    '$."H-24".amountYen',
    CASE lot.name
      WHEN 'DパーキンググレースK博多PS第1' THEN 900
      WHEN 'IBパーク駅東' THEN 1600
      WHEN 'IBパーク 駅東' THEN 1600
      WHEN 'PARKS PARK福岡博多駅東3丁目' THEN 1400
      WHEN 'PARKS PARK 福岡博多駅東3丁目' THEN 1400
      WHEN 'あるあるパーキング博多駅東2丁目' THEN 2200
      WHEN 'セイワパーク博多駅東' THEN 1300
      WHEN 'セイワパーク博多駅東2丁目2' THEN 800
      WHEN 'セイワパーク比恵町4' THEN json('null')
      WHEN 'タイムスペース 博多駅東第6駐車場' THEN 1500
      WHEN 'タイムスペース 博多駅東第7駐車場' THEN 1500
      WHEN 'タイムパーク 駅東エヌアイパーキング' THEN 1000
      WHEN 'ライオンパーキング東F' THEN 900
      WHEN 'ラッキーパーキング東F' THEN 900
      WHEN 'ライオンパーク駅東7' THEN 1100
    END,
    '$."H-24".needsConfirmation',
    CASE WHEN lot.name = 'セイワパーク比恵町4' THEN json('true') ELSE json('false') END
  ),
  CASE lot.name
    WHEN 'セイワパーク比恵町4' THEN '料金看板の判断材料不足により24時間料金を要確認へ変更（2026-08-03監査）。'
    ELSE '24時間料金を全入庫時刻の最安料金として再計算（2026-08-03監査）。'
  END,
  0,
  '2026-08-03T10:30:00.000Z'
FROM pricing_versions AS current
JOIN parking_lots AS lot ON lot.id = current.parking_lot_id
WHERE current.is_current = 1
  AND lot.name IN (
    'DパーキンググレースK博多PS第1',
    'IBパーク駅東', 'IBパーク 駅東',
    'PARKS PARK福岡博多駅東3丁目', 'PARKS PARK 福岡博多駅東3丁目',
    'あるあるパーキング博多駅東2丁目',
    'セイワパーク博多駅東',
    'セイワパーク博多駅東2丁目2',
    'セイワパーク比恵町4',
    'タイムスペース 博多駅東第6駐車場',
    'タイムスペース 博多駅東第7駐車場',
    'タイムパーク 駅東エヌアイパーキング',
    'ライオンパーキング東F', 'ラッキーパーキング東F',
    'ライオンパーク駅東7'
  );

UPDATE pricing_versions
SET is_current = 0
WHERE is_current = 1
  AND parking_lot_id IN (
    SELECT id FROM parking_lots
    WHERE name IN (
      'DパーキンググレースK博多PS第1',
      'IBパーク駅東', 'IBパーク 駅東',
      'PARKS PARK福岡博多駅東3丁目', 'PARKS PARK 福岡博多駅東3丁目',
      'あるあるパーキング博多駅東2丁目',
      'セイワパーク博多駅東',
      'セイワパーク博多駅東2丁目2',
      'セイワパーク比恵町4',
      'タイムスペース 博多駅東第6駐車場',
      'タイムスペース 博多駅東第7駐車場',
      'タイムパーク 駅東エヌアイパーキング',
      'ライオンパーキング東F', 'ラッキーパーキング東F',
      'ライオンパーク駅東7'
    )
  );

UPDATE pricing_versions
SET is_current = 1
WHERE id LIKE 'pricing-24h-audit-20260803-%';

UPDATE parking_lots
SET updated_at = '2026-08-03T10:30:00.000Z'
WHERE name IN (
  'DパーキンググレースK博多PS第1',
  'IBパーク駅東', 'IBパーク 駅東',
  'PARKS PARK福岡博多駅東3丁目', 'PARKS PARK 福岡博多駅東3丁目',
  'あるあるパーキング博多駅東2丁目',
  'セイワパーク博多駅東',
  'セイワパーク博多駅東2丁目2',
  'セイワパーク比恵町4',
  'タイムスペース 博多駅東第6駐車場',
  'タイムスペース 博多駅東第7駐車場',
  'タイムパーク 駅東エヌアイパーキング',
  'ライオンパーキング東F', 'ラッキーパーキング東F',
  'ライオンパーク駅東7'
);
