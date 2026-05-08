ALTER TABLE public.fg_buyer_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fg_buyer_signals_insert_own" ON public.fg_buyer_signals;
CREATE POLICY "fg_buyer_signals_insert_own"
  ON public.fg_buyer_signals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fg_buyer_signals_select_own" ON public.fg_buyer_signals;
CREATE POLICY "fg_buyer_signals_select_own"
  ON public.fg_buyer_signals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);