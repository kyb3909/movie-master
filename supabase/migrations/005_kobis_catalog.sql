-- ============================================
-- KOBIS 카탈로그 연동
--
-- 004 에서 만든 movie / actor / movie_credit 에 KOBIS 식별자와
-- 박스오피스 성적을 얹는다.
--
-- KOBIS(영화진흥위원회)가 제공하는 것: 한글 제목, 개봉일, 관객수, 배우 한글·영문
--                                     이름, 배역명, 출연 비중 순서, 생년월일
-- KOBIS 가 제공하지 않는 것: 인물 사진, 포스터 이미지
--                            → 사진은 TMDB 등 별도 소스로 채워야 한다.
-- ============================================

-- --------------------------------------------
-- 1. movie 에 KOBIS 필드 추가
--
-- 004 의 movie.tmdb_id 는 NOT NULL 이라 KOBIS 단독 적재를 막는다.
-- KOBIS 로 먼저 쌓고 TMDB 는 나중에 매칭해 붙이는 순서를 지원하기 위해
-- NULL 을 허용하도록 완화한다. 대신 두 외부 ID 중 최소 하나는 있어야 한다.
-- --------------------------------------------
ALTER TABLE public.movie
  ADD COLUMN IF NOT EXISTS kobis_movie_cd TEXT,
  ADD COLUMN IF NOT EXISTS audi_acc       BIGINT,   -- 누적 관객수
  ADD COLUMN IF NOT EXISTS sales_acc      BIGINT,   -- 누적 매출액(원)
  ADD COLUMN IF NOT EXISTS box_year       SMALLINT, -- 박스오피스 집계 연도
  ADD COLUMN IF NOT EXISTS box_rank       SMALLINT; -- 해당 연도 순위

ALTER TABLE public.movie ALTER COLUMN tmdb_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS movie_kobis_movie_cd_key
  ON public.movie (kobis_movie_cd);

ALTER TABLE public.movie
  DROP CONSTRAINT IF EXISTS movie_has_external_id;
ALTER TABLE public.movie
  ADD CONSTRAINT movie_has_external_id
  CHECK (tmdb_id IS NOT NULL OR kobis_movie_cd IS NOT NULL);

COMMENT ON COLUMN public.movie.kobis_movie_cd IS
  'KOBIS movieCd. 연도별 박스오피스 및 출연진 조회의 키';
COMMENT ON COLUMN public.movie.box_year IS
  '해당 연도 박스오피스 순위 기준 연도. 연말 개봉작은 두 해에 걸쳐 순위에 오르므로 최고 순위 연도를 기록';

CREATE INDEX IF NOT EXISTS idx_movie_audi_acc
  ON public.movie (audi_acc DESC NULLS LAST);

-- --------------------------------------------
-- 2. actor 에 KOBIS 필드 추가
--
-- KOBIS peopleCd 가 동명이인을 구분하는 권위 있는 키다.
-- (예: '이하늬'가 서로 다른 peopleCd 로 두 명 존재한다.)
-- --------------------------------------------
ALTER TABLE public.actor
  ADD COLUMN IF NOT EXISTS kobis_people_cd TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS actor_kobis_people_cd_key
  ON public.actor (kobis_people_cd);

COMMENT ON COLUMN public.actor.kobis_people_cd IS
  'KOBIS peopleCd. 한글 이름이 같은 다른 배우를 구분하는 키';

-- 004 는 tmdb_id 기준 upsert 를 전제했다. KOBIS 로만 적재한 배우는
-- tmdb_id 가 NULL 이므로, 사진 매칭 대상을 빠르게 찾기 위한 인덱스를 둔다.
CREATE INDEX IF NOT EXISTS idx_actor_needs_photo
  ON public.actor (kobis_people_cd)
  WHERE tmdb_id IS NULL;

-- --------------------------------------------
-- 3. movie_credit 에 KOBIS 크레딧 정보 추가
--
-- actor_gb: 1=주연, 2=조연, 3=기타, 5=단역
-- 수집 단계에서는 단역까지 모두 저장하고, 게임별로 쿼리에서 걸러 쓴다.
-- --------------------------------------------
ALTER TABLE public.movie_credit
  ADD COLUMN IF NOT EXISTS actor_gb TEXT;

COMMENT ON COLUMN public.movie_credit.actor_gb IS
  'KOBIS actorGb — 1=주연, 2=조연, 3=기타, 5=단역. 퀴즈/캐스팅은 보통 1~2 만 사용';

COMMENT ON COLUMN public.movie_credit.cast_order IS
  'KOBIS sortSeq 또는 TMDB order 기반 출연 비중 순서(0부터). 퀴즈 힌트 순서로 사용';

CREATE INDEX IF NOT EXISTS idx_movie_credit_gb
  ON public.movie_credit (movie_id, actor_gb, cast_order);

-- --------------------------------------------
-- 4. 퀴즈 출제 가능 영화 뷰 갱신
--
-- 004 의 quiz_ready_movies 는 전체 크레딧 7명 이상을 조건으로 했다.
-- 단역까지 저장하게 되면서 그 조건이 무의미해졌으므로
-- 주연·조연(actor_gb 1~2)이 7명 이상인 영화로 바꾼다.
-- --------------------------------------------
DROP VIEW IF EXISTS public.quiz_ready_movies;
CREATE VIEW public.quiz_ready_movies AS
SELECT
  m.id,
  m.kobis_movie_cd,
  m.tmdb_id,
  m.title,
  m.release_date,
  m.audi_acc,
  m.original_language,
  COUNT(mc.actor_id) FILTER (WHERE mc.actor_gb IN ('1', '2')) AS main_cast_count,
  COUNT(mc.actor_id) FILTER (
    WHERE mc.actor_gb IN ('1', '2') AND a.image_url IS NOT NULL
  ) AS main_cast_with_photo
FROM public.movie m
JOIN public.movie_credit mc ON mc.movie_id = m.id
JOIN public.actor a ON a.actor_id = mc.actor_id
GROUP BY m.id, m.kobis_movie_cd, m.tmdb_id, m.title, m.release_date, m.audi_acc, m.original_language
HAVING COUNT(mc.actor_id) FILTER (WHERE mc.actor_gb IN ('1', '2')) >= 7;

COMMENT ON VIEW public.quiz_ready_movies IS
  '퀴즈 출제 후보. main_cast_with_photo 가 7 이상이어야 사진 힌트까지 완성된다';
