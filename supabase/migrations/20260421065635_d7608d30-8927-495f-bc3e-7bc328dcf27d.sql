-- 1. factory_logs 테이블
CREATE TABLE public.factory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  event_message text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_factory_logs_factory_id ON public.factory_logs(factory_id);
CREATE INDEX idx_factory_logs_user_id ON public.factory_logs(user_id);
CREATE INDEX idx_factory_logs_created_at ON public.factory_logs(created_at DESC);

-- 2. RLS
ALTER TABLE public.factory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own factory logs"
ON public.factory_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own factory logs"
ON public.factory_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages factory logs"
ON public.factory_logs FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- 3. Trigger function: 공장 변경 자동 로깅
CREATE OR REPLACE FUNCTION public.log_factory_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_event_message text;
  v_event_data jsonb := '{}'::jsonb;
  v_changed_fields text[] := ARRAY[]::text[];
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_actor text;
BEGIN
  -- actor 추정: 인증된 호출이면 'user', 아니면 'system'
  v_actor := CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END;

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'FACTORY_CREATED';
    v_event_message := '공장 등록: ' || COALESCE(NEW.name, '(이름 없음)');
    v_event_data := jsonb_build_object(
      'name', NEW.name,
      'source_platform', NEW.source_platform,
      'source_url', NEW.source_url,
      'country', NEW.country,
      'city', NEW.city
    );

    INSERT INTO public.factory_logs (factory_id, user_id, event_type, event_message, event_data, created_by)
    VALUES (NEW.id, NEW.user_id, v_event_type, v_event_message, v_event_data, v_actor);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- soft delete 감지
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_event_type := 'FACTORY_DELETED';
      v_event_message := '공장 삭제: ' || COALESCE(NEW.name, '(이름 없음)');
      v_event_data := jsonb_build_object(
        'reason', NEW.deleted_reason,
        'deleted_at', NEW.deleted_at
      );

      INSERT INTO public.factory_logs (factory_id, user_id, event_type, event_message, event_data, created_by)
      VALUES (NEW.id, NEW.user_id, v_event_type, v_event_message, v_event_data, v_actor);
      RETURN NEW;
    END IF;

    -- 복구 감지
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_event_type := 'FACTORY_RESTORED';
      v_event_message := '공장 복구: ' || COALESCE(NEW.name, '(이름 없음)');

      INSERT INTO public.factory_logs (factory_id, user_id, event_type, event_message, event_data, created_by)
      VALUES (NEW.id, NEW.user_id, v_event_type, v_event_message, '{}'::jsonb, v_actor);
      RETURN NEW;
    END IF;

    -- 일반 업데이트: 변경된 필드 diff
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      -- 시스템성/노이즈 필드 제외
      IF v_key IN ('updated_at', 'last_synced_at', 'sync_status',
                   'trend_score_updated_at', 'trend_match_score',
                   'trend_matched_count', 'overall_score',
                   'platform_score', 'platform_score_detail',
                   'ai_original_data', 'ai_original_score',
                   'scraped_data') THEN
        CONTINUE;
      END IF;

      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
        v_event_data := v_event_data || jsonb_build_object(
          v_key, jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key)
        );
      END IF;
    END LOOP;

    -- 의미있는 변경이 없으면 로그 스킵
    IF array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    v_event_type := 'FACTORY_UPDATED';
    v_event_message := '공장 수정: ' || COALESCE(NEW.name, '(이름 없음)') ||
                       ' (' || array_to_string(v_changed_fields, ', ') || ')';

    INSERT INTO public.factory_logs (factory_id, user_id, event_type, event_message, event_data, created_by)
    VALUES (NEW.id, NEW.user_id, v_event_type, v_event_message, v_event_data, v_actor);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- hard delete (현재 앱은 soft delete만 사용하지만 안전장치)
    INSERT INTO public.factory_logs (factory_id, user_id, event_type, event_message, event_data, created_by)
    VALUES (OLD.id, OLD.user_id, 'FACTORY_HARD_DELETED',
            '공장 영구 삭제: ' || COALESCE(OLD.name, '(이름 없음)'),
            jsonb_build_object('name', OLD.name), v_actor);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- 4. Trigger 부착
DROP TRIGGER IF EXISTS trg_log_factory_change ON public.factories;
CREATE TRIGGER trg_log_factory_change
AFTER INSERT OR UPDATE OR DELETE ON public.factories
FOR EACH ROW EXECUTE FUNCTION public.log_factory_change();
