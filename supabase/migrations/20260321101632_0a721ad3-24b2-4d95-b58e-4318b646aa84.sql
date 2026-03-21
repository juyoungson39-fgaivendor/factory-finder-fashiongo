-- Recalculate overall_score for all factories based on inserted scoring data
UPDATE factories f SET overall_score = sub.calc_score
FROM (
  SELECT fs.factory_id,
    COALESCE(SUM(fs.score * sc.weight) / NULLIF(SUM(sc.weight * sc.max_score), 0) * 100, 0) as calc_score
  FROM factory_scores fs
  JOIN scoring_criteria sc ON sc.id = fs.criteria_id
  GROUP BY fs.factory_id
) sub
WHERE f.id = sub.factory_id;