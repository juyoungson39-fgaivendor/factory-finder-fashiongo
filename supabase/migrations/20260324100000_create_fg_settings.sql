-- Create fg_settings table for persistent cross-device user settings
CREATE TABLE IF NOT EXISTS public.fg_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index on user_id for fast lookup
CREATE INDEX idx_fg_settings_user_id ON public.fg_settings(user_id);

-- Enable RLS
ALTER TABLE public.fg_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own settings"
    ON public.fg_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
    ON public.fg_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
    ON public.fg_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER set_fg_settings_updated_at
    BEFORE UPDATE ON public.fg_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
