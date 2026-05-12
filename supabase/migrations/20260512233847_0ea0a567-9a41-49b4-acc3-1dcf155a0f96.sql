DELETE FROM trend_analyses
WHERE source_platform='wwd' AND (trend_keywords IS NULL OR cardinality(trend_keywords)=0);

DELETE FROM trend_analyses
WHERE source_platform IN ('hypebeast','footwearnews','highsnobiety','tiktok')
  AND EXISTS (SELECT 1 FROM unnest(trend_keywords) k WHERE lower(k) IN (
    'gaming','game','survival','roguelike','esports',
    'food','recipe','restaurant','cooking','beverage','dining',
    'tech','crypto','blockchain','software','hardware','semiconductor','headphone','earphone',
    'politics','news','finance','economy','election',
    'movie','film','tv','anime','manga','sekiro','skeletor','comics','marvel','dc',
    'football','baseball','nba','mlb','nfl','soccer','tennis','golf','pop culture'
  ));

DELETE FROM trend_sourceable_matches m
WHERE NOT EXISTS (SELECT 1 FROM trend_analyses t WHERE t.id = m.trend_analysis_id);

DELETE FROM target_products tp
WHERE tp.trend_analysis_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM trend_analyses t WHERE t.id = tp.trend_analysis_id);