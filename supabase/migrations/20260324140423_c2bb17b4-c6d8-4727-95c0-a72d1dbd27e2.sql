
CREATE TABLE public.product_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  factory_id uuid REFERENCES public.factories(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_message text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.product_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own product logs"
  ON public.product_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own product logs"
  ON public.product_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_product_logs_product_id ON public.product_logs(product_id);
CREATE INDEX idx_product_logs_created_at ON public.product_logs(created_at DESC);
