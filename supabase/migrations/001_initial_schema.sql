-- ============================================
-- 무비마스터 데이터베이스 스키마
-- Clerk + Supabase RLS 통합
-- ============================================

-- --------------------------------------------
-- 배우 테이블
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.actor (
  actor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nationality TEXT,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 배우 테이블은 모든 사용자가 읽기 가능
ALTER TABLE public.actor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read actors"
  ON public.actor
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 관리자만 배우 정보 수정 가능 (서비스 역할 키 사용)

-- --------------------------------------------
-- 영화 퀴즈 테이블
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.movie_quiz (
  quiz_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  actor_1 UUID REFERENCES public.actor(actor_id),
  actor_2 UUID REFERENCES public.actor(actor_id),
  actor_3 UUID REFERENCES public.actor(actor_id),
  actor_4 UUID REFERENCES public.actor(actor_id),
  actor_5 UUID REFERENCES public.actor(actor_id),
  actor_6 UUID REFERENCES public.actor(actor_id),
  actor_7 UUID REFERENCES public.actor(actor_id),
  play_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  avg_correct_position NUMERIC(3, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 퀴즈 테이블은 모든 사용자가 읽기 가능
ALTER TABLE public.movie_quiz ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read quizzes"
  ON public.movie_quiz
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- --------------------------------------------
-- 캐스팅 콘텐츠 테이블
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.casting_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'novel', 'webtoon', 'anime', 'manga', 'other')),
  thumbnail_url TEXT,
  description TEXT,
  creator_id TEXT, -- Clerk user_id
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.casting_content ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Anyone can read casting content"
  ON public.casting_content
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 로그인한 사용자만 콘텐츠 생성 가능
CREATE POLICY "Authenticated users can create casting content"
  ON public.casting_content
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Clerk의 JWT sub 클레임 (user_id)과 creator_id가 일치해야 함
    (SELECT auth.jwt() ->> 'sub') = creator_id
  );

-- 자신이 만든 콘텐츠만 수정/삭제 가능
CREATE POLICY "Users can update own casting content"
  ON public.casting_content
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = creator_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = creator_id);

CREATE POLICY "Users can delete own casting content"
  ON public.casting_content
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = creator_id);

-- --------------------------------------------
-- 캐스팅 캐릭터 테이블
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.casting_character (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES public.casting_content(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.casting_character ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Anyone can read casting characters"
  ON public.casting_character
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 콘텐츠 생성자만 캐릭터 추가/수정/삭제 가능
CREATE POLICY "Content creators can manage characters"
  ON public.casting_character
  FOR ALL
  TO authenticated
  USING (
    content_id IN (
      SELECT id FROM public.casting_content 
      WHERE creator_id = (SELECT auth.jwt() ->> 'sub')
    )
  )
  WITH CHECK (
    content_id IN (
      SELECT id FROM public.casting_content 
      WHERE creator_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

-- --------------------------------------------
-- 캐스팅 투표 테이블
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.casting_vote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Clerk user_id
  character_id UUID REFERENCES public.casting_character(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.actor(actor_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- 한 사용자가 같은 캐릭터에 여러 번 투표 방지
  UNIQUE(user_id, character_id)
);

ALTER TABLE public.casting_vote ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 투표 결과 읽기 가능
CREATE POLICY "Anyone can read casting votes"
  ON public.casting_vote
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 로그인한 사용자만 자신의 투표 생성 가능
CREATE POLICY "Authenticated users can create own votes"
  ON public.casting_vote
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

-- 자신의 투표만 수정 가능
CREATE POLICY "Users can update own votes"
  ON public.casting_vote
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);

-- 자신의 투표만 삭제 가능
CREATE POLICY "Users can delete own votes"
  ON public.casting_vote
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- --------------------------------------------
-- 퀴즈 결과 로그 테이블
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_result_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.movie_quiz(quiz_id) ON DELETE CASCADE,
  user_id TEXT, -- Clerk user_id (nullable for anonymous plays)
  result TEXT NOT NULL CHECK (result IN ('correct', 'incorrect')),
  correct_position INTEGER CHECK (correct_position >= 1 AND correct_position <= 7),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.quiz_result_log ENABLE ROW LEVEL SECURITY;

-- 집계 데이터를 위해 모든 사용자가 읽기 가능
CREATE POLICY "Anyone can read quiz results"
  ON public.quiz_result_log
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 퀴즈 결과 생성은 모든 사용자 (익명 포함) 가능
CREATE POLICY "Anyone can create quiz results"
  ON public.quiz_result_log
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- 자신의 결과만 조회 (상세)
CREATE POLICY "Users can read own detailed results"
  ON public.quiz_result_log
  FOR SELECT
  TO authenticated
  USING (
    user_id IS NULL OR (SELECT auth.jwt() ->> 'sub') = user_id
  );

-- --------------------------------------------
-- 인기 캐스팅 집계 뷰 (캐릭터별 TOP 3)
-- --------------------------------------------
CREATE OR REPLACE VIEW public.popular_castings AS
SELECT 
  cv.character_id,
  cc.name AS character_name,
  cc.content_id,
  ct.title AS content_title,
  cv.actor_id,
  a.name AS actor_name,
  a.image_url AS actor_image,
  COUNT(*) AS vote_count,
  RANK() OVER (PARTITION BY cv.character_id ORDER BY COUNT(*) DESC) AS rank
FROM public.casting_vote cv
JOIN public.casting_character cc ON cv.character_id = cc.id
JOIN public.casting_content ct ON cc.content_id = ct.id
JOIN public.actor a ON cv.actor_id = a.actor_id
GROUP BY cv.character_id, cc.name, cc.content_id, ct.title, cv.actor_id, a.name, a.image_url;

-- --------------------------------------------
-- 인덱스 생성 (성능 최적화)
-- --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_casting_vote_character ON public.casting_vote(character_id);
CREATE INDEX IF NOT EXISTS idx_casting_vote_user ON public.casting_vote(user_id);
CREATE INDEX IF NOT EXISTS idx_casting_character_content ON public.casting_character(content_id);
CREATE INDEX IF NOT EXISTS idx_quiz_result_quiz ON public.quiz_result_log(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_result_user ON public.quiz_result_log(user_id);

