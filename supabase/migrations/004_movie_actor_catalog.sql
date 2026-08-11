-- ============================================
-- 영화/배우 카탈로그 스키마
--
-- 목적: 세 게임이 공유하는 단일 데이터 백본을 구축한다.
--   1) 영화 퀴즈      → movie_credit 의 cast_order 로 힌트 1~7 자동 생성
--   2) 가상 캐스팅     → actor 를 정식 참조 (문자열 집계 대신)
--   3) 로튼 하이로우   → movie.rt_score
--
-- 원칙: 기존 테이블(quiz, quiz_actor, casting_*)은 건드리지 않는다.
--       actor 는 casting_vote FK 와 popular_castings 뷰가 참조 중이므로
--       재생성하지 않고 컬럼만 추가한다.
-- ============================================

-- --------------------------------------------
-- 1. actor 테이블 확장
-- --------------------------------------------
ALTER TABLE public.actor
  ADD COLUMN IF NOT EXISTS tmdb_id              INTEGER,
  ADD COLUMN IF NOT EXISTS name_en              TEXT,
  ADD COLUMN IF NOT EXISTS profile_path         TEXT,
  ADD COLUMN IF NOT EXISTS popularity           NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS birthday             DATE,
  ADD COLUMN IF NOT EXISTS place_of_birth       TEXT,
  ADD COLUMN IF NOT EXISTS known_for_department TEXT,
  ADD COLUMN IF NOT EXISTS enriched_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.actor.enriched_at IS
  '배우 상세(한글 이름, 출생 정보)를 보강한 시각. NULL 이면 미보강 — 재실행 시 건너뛸 대상 판별용';

COMMENT ON COLUMN public.actor.tmdb_id      IS 'TMDB person id. 재수집 시 중복 방지 및 동명이인 구분 키';
COMMENT ON COLUMN public.actor.name         IS '표시용 이름. 한글 표기가 있으면 한글 우선';
COMMENT ON COLUMN public.actor.name_en      IS 'TMDB 원본 표기(주로 로마자). 검색 폴백용';
COMMENT ON COLUMN public.actor.profile_path IS 'TMDB 상대 경로(/xxx.jpg). 렌더 시점에 크기 선택 가능';
COMMENT ON COLUMN public.actor.image_url    IS 'profile_path 로부터 만든 전체 URL. 기존 뷰 호환용';

-- 전체 유니크 인덱스를 쓴다. Postgres 는 유니크 인덱스에서 NULL 을 서로 다른 값으로
-- 취급하므로 tmdb_id 가 NULL 인 기존 수동 입력 행이 여러 개 있어도 충돌하지 않는다.
-- (부분 인덱스로 만들면 ON CONFLICT (tmdb_id) 추론이 실패해 upsert 가 깨진다.)
CREATE UNIQUE INDEX IF NOT EXISTS actor_tmdb_id_key
  ON public.actor (tmdb_id);

-- 캐스팅 검색 자동완성: 인기순 정렬
CREATE INDEX IF NOT EXISTS idx_actor_popularity
  ON public.actor (popularity DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_actor_name ON public.actor (name);

-- --------------------------------------------
-- 2. 영화 테이블
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.movie (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id           INTEGER NOT NULL UNIQUE,
  imdb_id           TEXT UNIQUE,                 -- OMDb 조회 브릿지 (tt0000000)
  title             TEXT NOT NULL,               -- ko-KR 제목 (퀴즈 정답)
  original_title    TEXT,
  original_language TEXT,                        -- 'ko', 'en' ...
  release_date      DATE,
  poster_path       TEXT,
  overview          TEXT,
  runtime           INTEGER,
  popularity        NUMERIC(10, 3),
  tmdb_vote_average NUMERIC(4, 2),               -- TMDB 자체 유저 평점 (10점 만점)
  tmdb_vote_count   INTEGER,

  -- 로튼 하이로우 정답값
  rt_score          SMALLINT CHECK (rt_score BETWEEN 0 AND 100),
  rt_checked_at     TIMESTAMPTZ,                 -- 조회 시도 시각

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- rt_score IS NULL 만으로는 "아직 안 받아옴"과 "받아왔는데 RT 지수가 없음"을
-- 구분할 수 없다. rt_checked_at 이 그 구분을 담당한다.
-- OMDb 무료 티어가 하루 1,000 요청이므로 이미 확인한 영화를 다시 조회하지 않는 것이 중요하다.
COMMENT ON COLUMN public.movie.rt_checked_at IS
  'OMDb 조회를 시도한 시각. NULL 이면 미조회, NOT NULL 인데 rt_score 가 NULL 이면 RT 지수 없음';

ALTER TABLE public.movie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read movies"
  ON public.movie
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 쓰기는 service_role 전용 (수집 스크립트). service_role 은 RLS 를 우회한다.

CREATE INDEX IF NOT EXISTS idx_movie_popularity
  ON public.movie (popularity DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_movie_language
  ON public.movie (original_language);

-- 하이로우 후보 조회 및 미조회분 탐색용
CREATE INDEX IF NOT EXISTS idx_movie_rt_score
  ON public.movie (rt_score)
  WHERE rt_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movie_rt_unchecked
  ON public.movie (rt_checked_at)
  WHERE rt_checked_at IS NULL;

-- --------------------------------------------
-- 3. 영화 ↔ 배우 크레딧
--
-- cast_order 는 TMDB 의 출연 비중 순서(0 = 주연)를 그대로 보존한다.
-- 퀴즈의 힌트 순서가 여기서 바로 나온다.
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.movie_credit (
  movie_id       UUID    NOT NULL REFERENCES public.movie(id)       ON DELETE CASCADE,
  actor_id       UUID    NOT NULL REFERENCES public.actor(actor_id) ON DELETE CASCADE,
  cast_order     SMALLINT NOT NULL,
  character_name TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (movie_id, actor_id)
);

ALTER TABLE public.movie_credit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read movie credits"
  ON public.movie_credit
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_movie_credit_movie
  ON public.movie_credit (movie_id, cast_order);

CREATE INDEX IF NOT EXISTS idx_movie_credit_actor
  ON public.movie_credit (actor_id);

-- --------------------------------------------
-- 4. updated_at 자동 갱신
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS movie_updated_at_trigger ON public.movie;
CREATE TRIGGER movie_updated_at_trigger
  BEFORE UPDATE ON public.movie
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS actor_updated_at_trigger ON public.actor;
CREATE TRIGGER actor_updated_at_trigger
  BEFORE UPDATE ON public.actor
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- --------------------------------------------
-- 5. 로튼 하이로우 출제 풀
--
-- RT 지수가 있는 영화만. 하이로우는 두 영화를 비교하므로
-- 동점이 나오면 게임이 성립하지 않는 점을 클라이언트에서 처리해야 한다.
-- --------------------------------------------
CREATE OR REPLACE VIEW public.highlow_pool AS
SELECT
  m.id,
  m.tmdb_id,
  m.title,
  m.original_title,
  m.poster_path,
  m.release_date,
  m.original_language,
  m.rt_score
FROM public.movie m
WHERE m.rt_score IS NOT NULL
  AND m.poster_path IS NOT NULL;

-- --------------------------------------------
-- 6. 퀴즈 출제 가능 영화 (배우 7명 이상 확보된 영화)
-- --------------------------------------------
CREATE OR REPLACE VIEW public.quiz_ready_movies AS
SELECT
  m.id,
  m.tmdb_id,
  m.title,
  m.original_language,
  m.popularity,
  COUNT(mc.actor_id) AS credit_count
FROM public.movie m
JOIN public.movie_credit mc ON mc.movie_id = m.id
GROUP BY m.id, m.tmdb_id, m.title, m.original_language, m.popularity
HAVING COUNT(mc.actor_id) >= 7;
