-- Wrapper functions over supabase_vault extension for use by edge functions via PostgREST RPC.
-- All run as SECURITY DEFINER and are restricted to the service_role.

CREATE OR REPLACE FUNCTION public.vault_create_secret(new_secret text, new_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT vault.create_secret(new_secret, new_name) INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_read_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_update_secret(secret_name text, new_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = secret_name LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(new_secret, secret_name);
  ELSE
    PERFORM vault.update_secret(v_id, new_secret, secret_name);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_create_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_read_secret(text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_update_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_delete_secret(uuid)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.vault_create_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_read_secret(text)         TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_update_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret(uuid)       TO service_role;