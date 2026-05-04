DELETE FROM public.factories
WHERE shop_id IS NULL
   OR shop_id NOT IN (
     'shop1423500310394','1618fs','PENDING_0012',
     'shop7729487h00e63','PENDING_0006','aosizhefashion','heimeiren',
     'weiluosifuzhuang','shanrong0769','shop196946621s8f0'
   );

SELECT COUNT(*) AS remaining FROM public.factories;