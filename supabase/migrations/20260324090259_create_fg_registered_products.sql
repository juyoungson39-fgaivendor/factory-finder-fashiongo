-- Create table to track products registered from FFF to FashionGo via VA API
CREATE TABLE IF NOT EXISTS public.fg_registered_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fg_product_id INTEGER NOT NULL,
    wholesaler_id BIGINT NOT NULL,
    vendor_key TEXT NOT NULL,
    style_no TEXT,
    item_name TEXT NOT NULL,
    category_id INTEGER,
    unit_price NUMERIC,
    status TEXT NOT NULL DEFAULT 'registered',
    color_id INTEGER,
    image_url TEXT,
    source_type TEXT,
    source_id UUID,
    error_message TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    registered_at TIMESTAMPTZ DEFAULT now(),
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_fg_registered_products_fg_product_id ON public.fg_registered_products(fg_product_id);
CREATE INDEX idx_fg_registered_products_wholesaler_id ON public.fg_registered_products(wholesaler_id);
CREATE INDEX idx_fg_registered_products_vendor_key ON public.fg_registered_products(vendor_key);
CREATE INDEX idx_fg_registered_products_status ON public.fg_registered_products(status);
CREATE INDEX idx_fg_registered_products_user_id ON public.fg_registered_products(user_id);

-- Enable RLS
ALTER TABLE public.fg_registered_products ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own registered products"
    ON public.fg_registered_products FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own registered products"
    ON public.fg_registered_products FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own registered products"
    ON public.fg_registered_products FOR UPDATE
    USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER set_fg_registered_products_updated_at
    BEFORE UPDATE ON public.fg_registered_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
