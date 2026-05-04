-- [1] Canonicalize source_url for all 1688 factories
UPDATE factories
SET source_url = 'https://' || shop_id || '.1688.com/page/offerlist.htm',
    source_platform = '1688'
WHERE source_platform = '1688'
  AND shop_id IS NOT NULL
  AND shop_id <> ''
  AND shop_id NOT LIKE 'PENDING_%';

-- [3] Sync crawl queue: clear pending/failed, enqueue all canonical URLs
DELETE FROM manual_crawl_queue WHERE status IN ('pending','failed');

INSERT INTO manual_crawl_queue (url, status)
SELECT source_url, 'pending'
FROM factories
WHERE source_url IS NOT NULL
  AND source_url LIKE 'https://%.1688.com/page/offerlist.htm';