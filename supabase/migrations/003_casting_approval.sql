-- ============================================
-- 가상 캐스팅 승인 시스템 마이그레이션
-- 요구사항:
-- 1. 프로젝트 승인 여부
-- 2. 캐릭터 최대 20명 제한
-- ============================================

-- --------------------------------------------
-- 1. casting_content 테이블에 승인 관련 필드 추가
-- --------------------------------------------
ALTER TABLE public.casting_content 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by TEXT, -- 관리자 user_id
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 승인된 콘텐츠만 일반 사용자에게 표시하도록 정책 수정
DROP POLICY IF EXISTS "Anyone can read casting content" ON public.casting_content;

-- 승인된 콘텐츠 또는 자신이 만든 콘텐츠만 읽기 가능
CREATE POLICY "Anyone can read approved casting content"
  ON public.casting_content
  FOR SELECT
  TO authenticated, anon
  USING (
    is_approved = TRUE 
    OR creator_id = (SELECT auth.jwt() ->> 'sub')
  );

-- 관리자용 정책 (service_role로 모든 콘텐츠 접근)

-- --------------------------------------------
-- 2. 캐릭터 20명 제한 트리거
-- --------------------------------------------
CREATE OR REPLACE FUNCTION check_character_limit()
RETURNS TRIGGER AS $$
DECLARE
  character_count INTEGER;
BEGIN
  -- 해당 콘텐츠의 현재 캐릭터 수 확인
  SELECT COUNT(*) INTO character_count
  FROM public.casting_character
  WHERE content_id = NEW.content_id;
  
  -- 20명 제한 체크
  IF character_count >= 20 THEN
    RAISE EXCEPTION '캐릭터는 프로젝트당 최대 20명까지만 등록할 수 있습니다.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 (INSERT 시에만)
DROP TRIGGER IF EXISTS enforce_character_limit ON public.casting_character;
CREATE TRIGGER enforce_character_limit
  BEFORE INSERT ON public.casting_character
  FOR EACH ROW
  EXECUTE FUNCTION check_character_limit();

-- --------------------------------------------
-- 3. 자유 배우 입력을 위한 casting_vote 테이블 수정
-- (actor 테이블 참조 대신 직접 입력 가능)
-- --------------------------------------------
-- 기존 actor_id 외래키 제약 유지, 추가 필드로 자유 입력 허용
ALTER TABLE public.casting_vote
ADD COLUMN IF NOT EXISTS custom_actor_name TEXT,
ADD COLUMN IF NOT EXISTS custom_actor_image_url TEXT;

-- actor_id가 null이면 custom 필드 사용
-- 검증: actor_id 또는 custom_actor_name 둘 중 하나는 필수
ALTER TABLE public.casting_vote
DROP CONSTRAINT IF EXISTS vote_actor_required;

ALTER TABLE public.casting_vote
ADD CONSTRAINT vote_actor_required
CHECK (
  actor_id IS NOT NULL 
  OR (custom_actor_name IS NOT NULL AND custom_actor_name != '')
);

-- --------------------------------------------
-- 4. 승인 대기 콘텐츠 조회용 인덱스
-- --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_casting_content_approval 
  ON public.casting_content(is_approved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_casting_content_creator 
  ON public.casting_content(creator_id);

-- --------------------------------------------
-- 5. updated_at 자동 업데이트 트리거
-- --------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_casting_content_updated_at ON public.casting_content;
CREATE TRIGGER update_casting_content_updated_at
  BEFORE UPDATE ON public.casting_content
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- 6. 캐릭터 순서 (display_order) 기본값 설정
-- --------------------------------------------
CREATE OR REPLACE FUNCTION set_character_order()
RETURNS TRIGGER AS $$
DECLARE
  max_order INTEGER;
BEGIN
  -- 해당 콘텐츠의 최대 순서값 조회
  SELECT COALESCE(MAX("order"), 0) INTO max_order
  FROM public.casting_character
  WHERE content_id = NEW.content_id;
  
  -- 새 캐릭터의 순서 설정
  IF NEW."order" IS NULL OR NEW."order" = 0 THEN
    NEW."order" = max_order + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_character_order_trigger ON public.casting_character;
CREATE TRIGGER set_character_order_trigger
  BEFORE INSERT ON public.casting_character
  FOR EACH ROW
  EXECUTE FUNCTION set_character_order();

-- --------------------------------------------
-- 7. 관리자 승인/거부 함수
-- (service_role 키로만 실행 가능)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION approve_casting_content(
  content_uuid UUID,
  admin_user_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.casting_content
  SET 
    is_approved = TRUE,
    approved_at = NOW(),
    approved_by = admin_user_id,
    rejection_reason = NULL
  WHERE id = content_uuid;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_casting_content(
  content_uuid UUID,
  admin_user_id TEXT,
  reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.casting_content
  SET 
    is_approved = FALSE,
    approved_at = NULL,
    approved_by = NULL,
    rejection_reason = reason
  WHERE id = content_uuid;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

