-- ============================================
-- 영화 퀴즈 테이블 스키마 (Simplified)
-- 영화 퀴즈 기능만을 위한 독립적인 스키마
-- ============================================

-- --------------------------------------------
-- 퀴즈 테이블
-- 영화 제목과 출연 배우 정보를 저장
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                    -- 영화 제목 (정답)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  play_count INTEGER DEFAULT 0,           -- 플레이 횟수
  correct_count INTEGER DEFAULT 0,        -- 정답 횟수
  is_active BOOLEAN DEFAULT true          -- 활성화 여부
);

-- 퀴즈 업데이트 시 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_quiz_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quiz_updated_at_trigger
  BEFORE UPDATE ON public.quiz
  FOR EACH ROW
  EXECUTE FUNCTION update_quiz_updated_at();

-- --------------------------------------------
-- 퀴즈 배우 테이블
-- 각 퀴즈에 연결된 배우 정보 (1~7번 힌트)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_actor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quiz(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,               -- 배우 이름
  actor_image_url TEXT,                   -- 배우 이미지 URL
  hint_order INTEGER NOT NULL CHECK (hint_order >= 1 AND hint_order <= 7),  -- 힌트 순서 (1~7)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 같은 퀴즈에 같은 순서의 힌트가 중복되지 않도록
  UNIQUE(quiz_id, hint_order)
);

-- --------------------------------------------
-- 퀴즈 결과 로그 테이블 (선택적)
-- 사용자별 퀴즈 플레이 기록
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_play_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quiz(id) ON DELETE CASCADE,
  user_id TEXT,                           -- Clerk user_id (nullable for anonymous)
  is_correct BOOLEAN NOT NULL,            -- 정답 여부
  hints_used INTEGER NOT NULL CHECK (hints_used >= 1 AND hints_used <= 7),  -- 사용한 힌트 수
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------
-- RLS 정책 설정
-- --------------------------------------------

-- Quiz 테이블 RLS
ALTER TABLE public.quiz ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 활성화된 퀴즈 읽기 가능
CREATE POLICY "Anyone can read active quizzes"
  ON public.quiz
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- 관리자(service_role)만 퀴즈 생성/수정/삭제 가능
-- 참고: service_role은 RLS를 우회하므로 별도 정책 불필요

-- Quiz Actor 테이블 RLS
ALTER TABLE public.quiz_actor ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 배우 정보 읽기 가능
CREATE POLICY "Anyone can read quiz actors"
  ON public.quiz_actor
  FOR SELECT
  TO authenticated, anon
  USING (
    quiz_id IN (SELECT id FROM public.quiz WHERE is_active = true)
  );

-- Quiz Play Log 테이블 RLS
ALTER TABLE public.quiz_play_log ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 플레이 로그 생성 가능
CREATE POLICY "Anyone can create play logs"
  ON public.quiz_play_log
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- 자신의 플레이 로그만 조회 가능
CREATE POLICY "Users can read own play logs"
  ON public.quiz_play_log
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- 익명 사용자는 플레이 로그 조회 불가 (집계만 가능하도록 별도 함수 사용)

-- --------------------------------------------
-- 인덱스 생성
-- --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_quiz_is_active ON public.quiz(is_active);
CREATE INDEX IF NOT EXISTS idx_quiz_actor_quiz_id ON public.quiz_actor(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_actor_hint_order ON public.quiz_actor(quiz_id, hint_order);
CREATE INDEX IF NOT EXISTS idx_quiz_play_log_quiz_id ON public.quiz_play_log(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_play_log_user_id ON public.quiz_play_log(user_id);

-- --------------------------------------------
-- 통계 업데이트 함수
-- 퀴즈 플레이 후 통계 자동 업데이트
-- --------------------------------------------
CREATE OR REPLACE FUNCTION update_quiz_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.quiz
  SET 
    play_count = play_count + 1,
    correct_count = correct_count + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END
  WHERE id = NEW.quiz_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER quiz_stats_trigger
  AFTER INSERT ON public.quiz_play_log
  FOR EACH ROW
  EXECUTE FUNCTION update_quiz_stats();

-- --------------------------------------------
-- 랜덤 퀴즈 선택 함수
-- --------------------------------------------
CREATE OR REPLACE FUNCTION get_random_quiz()
RETURNS TABLE (
  id UUID,
  title TEXT,
  play_count INTEGER,
  correct_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.title, q.play_count, q.correct_count
  FROM public.quiz q
  WHERE q.is_active = true
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

