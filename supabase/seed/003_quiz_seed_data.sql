-- ============================================
-- 영화 퀴즈 초기 시드 데이터
-- 기존 더미 데이터를 Supabase에 삽입
-- ============================================

-- 기존 데이터 삭제 (개발 환경에서만 사용)
-- TRUNCATE public.quiz_actor CASCADE;
-- TRUNCATE public.quiz CASCADE;

-- --------------------------------------------
-- 퀴즈 데이터 삽입
-- --------------------------------------------

-- 1. 기생충
INSERT INTO public.quiz (id, title, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', '기생충', true);

INSERT INTO public.quiz_actor (quiz_id, actor_name, actor_image_url, hint_order) VALUES
  ('11111111-1111-1111-1111-111111111111', '송강호', '/placeholder.svg?height=80&width=80', 1),
  ('11111111-1111-1111-1111-111111111111', '이선균', '/placeholder.svg?height=80&width=80', 2),
  ('11111111-1111-1111-1111-111111111111', '조여정', '/placeholder.svg?height=80&width=80', 3),
  ('11111111-1111-1111-1111-111111111111', '최우식', '/placeholder.svg?height=80&width=80', 4),
  ('11111111-1111-1111-1111-111111111111', '박소담', '/placeholder.svg?height=80&width=80', 5),
  ('11111111-1111-1111-1111-111111111111', '이정은', '/placeholder.svg?height=80&width=80', 6),
  ('11111111-1111-1111-1111-111111111111', '장혜진', '/placeholder.svg?height=80&width=80', 7);

-- 2. 범죄도시
INSERT INTO public.quiz (id, title, is_active) VALUES
  ('22222222-2222-2222-2222-222222222222', '범죄도시', true);

INSERT INTO public.quiz_actor (quiz_id, actor_name, actor_image_url, hint_order) VALUES
  ('22222222-2222-2222-2222-222222222222', '마동석', '/placeholder.svg?height=80&width=80', 1),
  ('22222222-2222-2222-2222-222222222222', '윤계상', '/placeholder.svg?height=80&width=80', 2),
  ('22222222-2222-2222-2222-222222222222', '조재윤', '/placeholder.svg?height=80&width=80', 3),
  ('22222222-2222-2222-2222-222222222222', '최귀화', '/placeholder.svg?height=80&width=80', 4),
  ('22222222-2222-2222-2222-222222222222', '임형준', '/placeholder.svg?height=80&width=80', 5),
  ('22222222-2222-2222-2222-222222222222', '박지환', '/placeholder.svg?height=80&width=80', 6),
  ('22222222-2222-2222-2222-222222222222', '하준', '/placeholder.svg?height=80&width=80', 7);

-- 3. 올드보이
INSERT INTO public.quiz (id, title, is_active) VALUES
  ('33333333-3333-3333-3333-333333333333', '올드보이', true);

INSERT INTO public.quiz_actor (quiz_id, actor_name, actor_image_url, hint_order) VALUES
  ('33333333-3333-3333-3333-333333333333', '최민식', '/placeholder.svg?height=80&width=80', 1),
  ('33333333-3333-3333-3333-333333333333', '유지태', '/placeholder.svg?height=80&width=80', 2),
  ('33333333-3333-3333-3333-333333333333', '강혜정', '/placeholder.svg?height=80&width=80', 3),
  ('33333333-3333-3333-3333-333333333333', '지대한', '/placeholder.svg?height=80&width=80', 4),
  ('33333333-3333-3333-3333-333333333333', '김병옥', '/placeholder.svg?height=80&width=80', 5),
  ('33333333-3333-3333-3333-333333333333', '오달수', '/placeholder.svg?height=80&width=80', 6),
  ('33333333-3333-3333-3333-333333333333', '윤진서', '/placeholder.svg?height=80&width=80', 7);

-- 4. 부산행
INSERT INTO public.quiz (id, title, is_active) VALUES
  ('44444444-4444-4444-4444-444444444444', '부산행', true);

INSERT INTO public.quiz_actor (quiz_id, actor_name, actor_image_url, hint_order) VALUES
  ('44444444-4444-4444-4444-444444444444', '공유', '/placeholder.svg?height=80&width=80', 1),
  ('44444444-4444-4444-4444-444444444444', '정유미', '/placeholder.svg?height=80&width=80', 2),
  ('44444444-4444-4444-4444-444444444444', '마동석', '/placeholder.svg?height=80&width=80', 3),
  ('44444444-4444-4444-4444-444444444444', '김수안', '/placeholder.svg?height=80&width=80', 4),
  ('44444444-4444-4444-4444-444444444444', '김의성', '/placeholder.svg?height=80&width=80', 5),
  ('44444444-4444-4444-4444-444444444444', '최우식', '/placeholder.svg?height=80&width=80', 6),
  ('44444444-4444-4444-4444-444444444444', '안소희', '/placeholder.svg?height=80&width=80', 7);

-- 5. 타짜
INSERT INTO public.quiz (id, title, is_active) VALUES
  ('55555555-5555-5555-5555-555555555555', '타짜', true);

INSERT INTO public.quiz_actor (quiz_id, actor_name, actor_image_url, hint_order) VALUES
  ('55555555-5555-5555-5555-555555555555', '조승우', '/placeholder.svg?height=80&width=80', 1),
  ('55555555-5555-5555-5555-555555555555', '김혜수', '/placeholder.svg?height=80&width=80', 2),
  ('55555555-5555-5555-5555-555555555555', '백윤식', '/placeholder.svg?height=80&width=80', 3),
  ('55555555-5555-5555-5555-555555555555', '유해진', '/placeholder.svg?height=80&width=80', 4),
  ('55555555-5555-5555-5555-555555555555', '김응수', '/placeholder.svg?height=80&width=80', 5),
  ('55555555-5555-5555-5555-555555555555', '윤지민', '/placeholder.svg?height=80&width=80', 6),
  ('55555555-5555-5555-5555-555555555555', '김일우', '/placeholder.svg?height=80&width=80', 7);

-- ============================================
-- 시드 데이터 확인
-- ============================================
-- SELECT q.title, COUNT(qa.id) as actor_count 
-- FROM public.quiz q 
-- LEFT JOIN public.quiz_actor qa ON q.id = qa.quiz_id 
-- GROUP BY q.id, q.title;

