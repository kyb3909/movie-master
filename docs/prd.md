<context> # Overview 이 사이트는 영화 팬들이 심심할 때 가볍게 들어와 즐길 수 있는 미니 게임 플랫폼으로, 팬들이 영화 지식을 테스트하거나, 자신만의 배우 취향을 공유하며 놀 수 있는 공간을 제공합니다. 사이트에는 크게 두 가지 게임이 존재합니다.

영화 제목 맞추기 게임은 ‘영잘알 퀴즈 시리즈’의 첫 번째 콘텐츠로, 배우들의 이름만 보고 영화 제목을 맞히는 퀴즈 형식의 게임입니다. 영화에 대한 기억력과 지식을 테스트하며 자부심을 느낄 수 있습니다.

가상 캐스팅 게임은 소설, 웹툰, 만화, 애니메이션 등을 영화로 가정하고, 각 캐릭터에 어울리는 배우를 직접 캐스팅해보는 놀이입니다. 팬들 사이의 의견과 취향을 공유하고, 각 캐릭터별 인기 배우 순위도 확인할 수 있어 재미와 커뮤니티 소통이 어우러지는 경험을 제공합니다.

이 플랫폼은 영화 팬들에게 짧고 가벼운 오락 경험과 동시에 자신만의 영화 세계관을 펼칠 수 있는 공간이 되는 것을 목표로 합니다.

Core Features
1. 영화 제목 맞추기 퀴즈

기능: 배우 정보를 하나씩 공개하며 영화 제목을 맞추는 퀴즈

중요성: 팬들의 영화 지식과 기억력을 자극하여 도전욕구와 몰입을 유도

작동 방식:

DB에서 랜덤 영화 선택 → 배우 7인 정보 순차 공개

한 명 공개 후 사용자 입력 → 정답 또는 오답 판별

오답 시 다음 배우 추가 공개 (최대 7명)

정답 시 게임 종료 및 결과 표시

2. 가상 캐스팅 게임

기능: 팬들이 다양한 콘텐츠의 캐릭터에 어울리는 배우를 직접 캐스팅

중요성: 팬들 간의 소통, 취향 공유, 이상적인 실사화 상상 놀이 유도

작동 방식:

콘텐츠(예: 슬램덩크) 선택 시 캐릭터 목록 노출

각 캐릭터 옆 “캐스팅” 버튼 클릭 → 배우 검색 및 선택

유저의 선택은 DB에 저장

각 캐릭터별 가장 많이 캐스팅된 배우 TOP 3 순위 공개

다른 유저들의 캐스팅 결과도 열람 가능

User Experience
사용자 페르소나

20대 영화광 대학생 – 민재 (24세, 남)

웹툰 실사화 상상을 즐기는 30대 여성 팬 – 수진 (32세, 여)

배우 팬덤 활동 중인 고등학생 – 다현 (18세, 여)

주요 유저 플로우

메인 페이지에서 원하는 게임을 선택 가능

‘영화 제목 맞추기’ → 즉시 게임 시작

‘가상 캐스팅 게임’ → 콘텐츠 목록 표시 → 콘텐츠 선택 → 캐릭터 선택

로그인 없이도 게임 참여 가능 (1일 2회 제한)

로그인 시 제한 해제 + 게임 기록 저장

영화 퀴즈는 배우 순차 공개 → 정답 시도 → 결과 확인

캐스팅 게임은 배우 검색 및 선택 → 인기 순위 집계 → 공유

UI/UX 고려사항

모바일 중심의 반응형 디자인

직관적인 검색 및 선택 인터페이스

게임 횟수 제한에 대한 명확한 안내

결과/순위는 시각적으로 매력적이게 표현 (공유 유도)

</context> <PRD> # Technical Architecture
시스템 구성요소

Frontend: Next.js

Backend: Supabase (DB, Auth, Edge Functions)

Database: Supabase PostgreSQL

Storage: Supabase Storage 또는 외부 CDN (배우/캐릭터 이미지)

데이터 모델
영화 퀴즈 테이블: movie_quiz

quiz_id, title, actor_1 ~ actor_7 (배우 ID, FK), play_count, correct_count, avg_correct_position

배우 테이블: actor

actor_id, name, nationality, gender, image_url

캐스팅 콘텐츠 테이블: casting_content

id, title, type, thumbnail_url, description

캐릭터 테이블: casting_character

id, content_id, name, image_url, order

캐스팅 기록 테이블: casting_vote

id, user_id, character_id, actor_id, created_at

퀴즈 결과 로그 (선택): quiz_result_log

id, quiz_id, user_id, result, correct_position, timestamp

Development Roadmap
MVP Requirements
공통

메인 페이지 게임 선택

로그인 기능 (Supabase Auth)

비로그인 참여 제한 (1일 2회)

영화 제목 맞추기

배우 순차 공개 퀴즈

정답 결과 저장 및 통계 표시

관리자 전용 퀴즈 등록/관리 도구 (영화 제목 + 배우 ID 입력/수정/삭제)

가상 캐스팅 게임

콘텐츠 리스트 → 캐릭터별 캐스팅 인터페이스

배우 검색 및 선택 기능

인기 배우 순위 집계

사용자 생성 콘텐츠/캐릭터 등록 기능

캐스팅 결과 저장 및 열람