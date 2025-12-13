# 무비마스터 프로젝트 TODO

## 📌 프로젝트 개요
영화 팬들을 위한 미니 게임 플랫폼 - 영화 제목 맞추기 퀴즈 + 가상 캐스팅 게임

---

## ✅ 완료된 작업

### 프로젝트 초기 설정
- [x] Next.js 프로젝트 생성 및 기본 설정
- [x] Tailwind CSS 및 shadcn/ui 컴포넌트 라이브러리 설치
- [x] 기본 레이아웃 및 테마 설정 (`app/layout.tsx`)
- [x] Vercel Analytics 연동

### 메인 페이지 (`app/page.tsx`)
- [x] 로고 및 헤더 구현
- [x] 게임 선택 카드 UI (영화 퀴즈 / 가상 캐스팅)
- [x] 탭 기반 네비게이션

### 영화 제목 맞추기 퀴즈
- [x] 기본 게임 UI 구현
- [x] 배우 순차 공개 로직 (최대 7명)
- [x] 정답 입력 및 판별 기능
- [x] 힌트 진행 상태 표시 (프로그레스 바)
- [x] 게임 결과 화면 (정답/오답)
- [x] 게임 재시작 기능
- [x] 샘플 영화 데이터 (하드코딩: 기생충, 범죄도시, 올드보이, 부산행, 타짜)

### 가상 캐스팅 게임 (`components/virtual-casting-view.tsx`)
- [x] 프로젝트 목록 탭 UI
- [x] 프로젝트 검색 기능
- [x] 프로젝트 카드 디자인
- [x] 캐스팅 게임 시작 모달
- [x] 인기 캐스팅 랭킹 보기
- [x] 모든 캐스팅 갤러리 보기
- [x] 내 프로젝트 만들기 탭

### Clerk 인증 시스템 ✅
- [x] `@clerk/nextjs@latest` 패키지 설치
- [x] `@clerk/localizations` 패키지 설치
- [x] `middleware.ts`에 `clerkMiddleware()` 적용
- [x] `app/layout.tsx`에 `<ClerkProvider>` 래핑
- [x] 헤더에 로그인/회원가입/UserButton 추가
- [x] 한국어 로컬라이제이션 적용 (`koKR`)

### Clerk + Supabase 통합 ✅
- [x] `@supabase/ssr`, `@supabase/supabase-js` 패키지 설치
- [x] Clerk JWT 토큰 연동 클라이언트 (`utils/supabase/client.ts`)
- [x] 서버 사이드 통합 클라이언트 (`utils/supabase/server.ts`)
- [x] Supabase 훅 생성 (`hooks/use-supabase.ts`)
- [x] 환경 변수 템플릿 업데이트 (`env.local.example`)
- [x] RLS 정책 포함 DB 스키마 (`supabase/migrations/001_initial_schema.sql`)
- [x] TypeScript 타입 정의 (`types/database.types.ts`)

### 영화 퀴즈 Supabase 연동 ✅ (NEW)
- [x] 퀴즈 테이블 스키마 (`supabase/migrations/002_quiz_schema.sql`)
  - `quiz`: 영화 제목, 활성화 여부, 플레이/정답 통계
  - `quiz_actor`: 퀴즈별 배우 정보 (힌트 1~7)
  - `quiz_play_log`: 플레이 기록
- [x] RLS 정책: 읽기는 public, 쓰기는 admin (service_role)
- [x] 퀴즈 타입 정의 (`types/quiz.types.ts`)
- [x] 서버 액션 (`lib/actions/quiz.ts`)
  - `getRandomQuiz()`: 랜덤 퀴즈 조회
  - `recordQuizResult()`: 퀴즈 결과 기록
  - `getAllQuizzes()`: 전체 퀴즈 목록 (Admin)
  - `createQuiz()`, `updateQuiz()`, `deleteQuiz()`: CRUD
- [x] 퀴즈 컴포넌트 분리 (`components/movie-quiz.tsx`)
- [x] Admin 페이지 (`app/admin/quiz/`)
- [x] Seed 데이터 SQL (`supabase/seed/003_quiz_seed_data.sql`)

### 비로그인 참여 제한 ✅ (NEW)
- [x] 플레이 제한 훅 (`hooks/use-play-limit.ts`)
  - localStorage 기반 일일 플레이 횟수 추적
  - 게임 종류별(quiz/casting) 각각 1일 2회 제한
  - 날짜가 바뀌면 자동 리셋
  - 로그인 사용자는 무제한
- [x] 로그인 유도 모달 (`components/login-prompt-modal.tsx`)
  - 제한 초과 시 표시
  - 로그인/회원가입 버튼 연동
  - 로그인 혜택 안내
- [x] MovieQuiz 컴포넌트에 제한 로직 적용
- [x] VirtualCastingView 컴포넌트에 제한 로직 적용

### SEO 최적화 ✅ (NEW)
- [x] 메타데이터 최적화 (`app/layout.tsx`)
  - Title Template 패턴 적용
  - Open Graph (Facebook, KakaoTalk) 메타태그
  - Twitter Card 메타태그
  - 한국 검색엔진(네이버, 다음) 최적화
  - robots 메타태그 설정
  - 키워드 및 설명 최적화
- [x] JSON-LD 구조화 데이터 (`app/layout.tsx`)
  - Schema.org WebSite 타입
  - Schema.org Organization 타입
  - Schema.org WebApplication 타입
  - 검색 액션 정의
- [x] 사이트맵 (`app/sitemap.ts`)
  - 메인 페이지, 퀴즈, 캐스팅 URL 포함
  - changeFrequency, priority 설정
- [x] robots.txt (`app/robots.ts`)
  - 관리자 페이지 크롤링 방지
  - Google, Bing, 네이버, 다음 크롤러 규칙
  - sitemap 위치 명시
- [x] PWA Manifest (`app/manifest.ts`)
  - 앱 아이콘 및 테마 설정
  - 바로가기(Shortcuts) 정의
  - 스크린샷 메타데이터
- [x] OG 이미지 동적 생성 (`app/opengraph-image.tsx`)
  - 브랜드 일관성 있는 디자인
  - Edge Runtime 최적화
- [x] Twitter 이미지 동적 생성 (`app/twitter-image.tsx`)

---

## 🚧 진행 중인 작업

*(현재 진행 중인 작업 없음)*

---

## 📋 미완료 작업 (MVP 요구사항 기준)

### 1. 환경 설정 (사용자 작업 필요 ⚠️)

#### Clerk 설정
- [ ] [Clerk Dashboard](https://dashboard.clerk.com)에서 애플리케이션 생성
- [ ] **JWT Templates 생성** (중요!)
  - Clerk Dashboard → JWT Templates → New template → "Supabase" 선택
  - 템플릿 이름: `supabase`
  - Supabase JWT Secret 입력 (Supabase Dashboard → Settings → API → JWT Secret)

#### Supabase 설정
- [ ] [Supabase Dashboard](https://supabase.com/dashboard)에서 프로젝트 생성
- [ ] **Clerk를 Third-party Auth Provider로 추가** (중요!)
  - Supabase Dashboard → Authentication → Providers → Third-party Auth
  - Clerk 도메인 입력 (예: `your-app.clerk.accounts.dev`)
- [ ] 마이그레이션 SQL 실행 (`supabase/migrations/001_initial_schema.sql`)

#### 환경 변수 설정
```bash
cp env.local.example .env.local
```

### 2. 비로그인 참여 제한 ✅ (NEW)
- [x] 비로그인 사용자 1일 2회 참여 제한 로직
- [x] localStorage 기반 플레이 횟수 추적 (`hooks/use-play-limit.ts`)
- [x] 제한 초과 시 로그인 유도 모달 (`components/login-prompt-modal.tsx`)
- [x] MovieQuiz 컴포넌트에 제한 로직 적용
- [x] VirtualCastingView 컴포넌트에 제한 로직 적용

### 3. 가상 캐스팅 - DB 스키마 및 API ✅ (NEW)
- [x] 마이그레이션 (`supabase/migrations/003_casting_approval.sql`)
  - `casting_content`에 승인 필드 추가 (`is_approved`, `approved_at`, `rejection_reason`)
  - 캐릭터 20명 제한 트리거
  - 자유 배우 입력 필드 (`custom_actor_name`, `custom_actor_image_url`)
- [x] TypeScript 타입 정의 (`types/casting.types.ts`)
- [x] 서버 액션 (`lib/actions/casting.ts`)
  - 프로젝트 CRUD: `createProject()`, `updateProject()`, `deleteProject()`
  - 캐릭터 CRUD: `addCharacter()`, `updateCharacter()`, `deleteCharacter()`
  - 투표: `castActor()`, `getMyCastings()`, `getTopCastings()`
  - 조회: `getApprovedProjects()`, `getMyProjects()`, `getProjectWithCharacters()`
  - 관리자: `getPendingProjects()`, `approveProject()`, `rejectProject()`
- [x] 관리자 승인 페이지 (`app/admin/casting/`)
- [x] VirtualCastingView 컴포넌트 DB 연동 (더미 → 실제 데이터)

### 5. 관리자 기능 (부분 완료)
- [x] 관리자 전용 페이지 (`/admin/quiz`, `/admin/casting`)
- [x] 영화 퀴즈 등록/수정/삭제
- [x] 배우 정보 등록/수정/삭제
- [x] 캐스팅 프로젝트 승인/거부
- [ ] 캐스팅 콘텐츠/캐릭터 직접 편집 (Admin)

### 6. Storage 설정 (부분 완료)
- [x] 이미지 업로드 서버 액션 (`lib/actions/storage.ts`)
- [x] 이미지 드래그 앤 드롭 컴포넌트 (`components/image-drop-zone.tsx`)
- [x] 프로젝트 생성 시 캐릭터 이미지 업로드 UI
- [ ] **Supabase Storage 버킷 생성** (사용자 작업 필요 ⚠️)

#### Supabase Storage 버킷 설정 가이드
1. [Supabase Dashboard](https://supabase.com/dashboard) → Storage로 이동
2. "New bucket" 클릭
3. 버킷 설정:
   - **Name**: `character-images`
   - **Public bucket**: ✅ 체크 (공개 읽기 허용)
   - **File size limit**: 5MB
   - **Allowed MIME types**: `image/*`
4. RLS 정책 설정:
   ```sql
   -- 누구나 읽기 가능
   CREATE POLICY "Public read access"
     ON storage.objects FOR SELECT
     USING (bucket_id = 'character-images');
   
   -- 로그인 사용자만 업로드 가능
   CREATE POLICY "Authenticated users can upload"
     ON storage.objects FOR INSERT
     TO authenticated
     WITH CHECK (bucket_id = 'character-images');
   ```

---

## 📁 프로젝트 구조

```
Movie/
├── app/
│   ├── globals.css
│   ├── layout.tsx             # ClerkProvider 래핑
│   └── page.tsx               # Clerk 인증 버튼 포함
├── app/
│   └── admin/
│       ├── quiz/              # 퀴즈 관리
│       └── casting/           # 캐스팅 관리 (NEW)
├── components/
│   ├── ui/                    # shadcn/ui 컴포넌트
│   ├── login-prompt-modal.tsx # 로그인 유도 모달
│   ├── movie-quiz.tsx         # 영화 퀴즈 게임
│   └── virtual-casting-view.tsx
├── hooks/
│   ├── use-auth.ts            # Clerk 인증 훅
│   ├── use-play-limit.ts      # 비로그인 플레이 제한 훅 (NEW)
│   ├── use-supabase.ts        # Clerk+Supabase 통합 훅
│   └── use-toast.ts
├── lib/
│   ├── actions/
│   │   ├── quiz.ts            # 퀴즈 서버 액션
│   │   └── casting.ts         # 캐스팅 서버 액션 (NEW)
│   └── utils.ts
├── types/
│   ├── database.types.ts      # Supabase 타입 정의
│   ├── quiz.types.ts          # 퀴즈 타입 정의
│   └── casting.types.ts       # 캐스팅 타입 정의 (NEW)
├── utils/
│   └── supabase/
│       ├── client.ts          # Clerk JWT 통합 클라이언트
│       └── server.ts          # 서버 사이드 클라이언트
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql  # DB 스키마 + RLS
│   │   ├── 002_quiz_schema.sql     # 퀴즈 스키마
│   │   └── 003_casting_approval.sql # 캐스팅 승인 스키마 (NEW)
│   └── seed/
│       └── 003_quiz_seed_data.sql  # 퀴즈 시드 데이터
├── docs/
│   ├── prd.md
│   └── todo.md
├── middleware.ts              # Clerk clerkMiddleware()
└── env.local.example          # 환경 변수 템플릿
```

---

## 📝 기술 스택

| 분류 | 기술 |
|------|------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui |
| Auth | **Clerk** ✅ |
| Database | **Supabase (PostgreSQL)** ✅ |
| Auth + DB 통합 | **Clerk JWT → Supabase RLS** ✅ |
| Storage | Supabase Storage (예정) |
| 패키지 관리 | pnpm |

---

## 🚀 Clerk + Supabase 통합 가이드

### 아키텍처

```
┌─────────────────┐     JWT Token      ┌─────────────────┐
│                 │  ───────────────►  │                 │
│     Clerk       │                    │    Supabase     │
│  (인증 서버)     │  ◄───────────────  │   (데이터베이스)  │
│                 │   RLS Policy Check │                 │
└─────────────────┘                    └─────────────────┘
        │                                      │
        │ Session Token                        │ Data
        ▼                                      ▼
┌─────────────────────────────────────────────────────────┐
│                    Next.js App                          │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ ClerkProvider   │    │ useSupabase() Hook          │ │
│  │ (인증 상태 관리)  │───►│ (Clerk JWT로 Supabase 접근)  │ │
│  └─────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1. Clerk JWT 템플릿 설정 (필수!)

1. [Clerk Dashboard](https://dashboard.clerk.com) → JWT Templates
2. "New template" → "Supabase" 선택
3. 설정:
   - **Name**: `supabase` (코드에서 이 이름 사용)
   - **Signing algorithm**: `HS256`
   - **Signing key**: Supabase JWT Secret 입력

Supabase JWT Secret 찾기:
- Supabase Dashboard → Settings → API → JWT Secret

### 2. Supabase Third-party Auth 설정

1. Supabase Dashboard → Authentication → Providers
2. "Third Party Auth" 섹션에서 "Add provider"
3. **Clerk** 선택 후 도메인 입력:
   - 예: `your-app.clerk.accounts.dev`

### 3. 환경 변수 설정

```bash
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # 관리자 기능용
```

### 4. 데이터베이스 마이그레이션

Supabase SQL Editor에서 실행:
```sql
-- supabase/migrations/001_initial_schema.sql 내용 실행
```

---

## 💡 사용 예시

### 클라이언트 컴포넌트에서:
```typescript
"use client"
import { useSupabase } from "@/hooks/use-supabase"

function MyComponent() {
  const { getClient, isSignedIn } = useSupabase()
  
  const fetchData = async () => {
    const supabase = await getClient()
    // Clerk userId 기반 RLS가 자동 적용됨
    const { data } = await supabase
      .from("casting_vote")
      .select("*")
  }
}
```

### 서버 컴포넌트에서:
```typescript
import { createClerkSupabaseClientSsr } from "@/utils/supabase/server"

export default async function Page() {
  const supabase = await createClerkSupabaseClientSsr()
  
  // Clerk JWT가 자동으로 포함됨
  const { data } = await supabase
    .from("casting_content")
    .select("*")
  
  return <div>...</div>
}
```

### RLS 정책 작동 방식:
```sql
-- Clerk의 user_id (JWT sub 클레임)를 사용
CREATE POLICY "Users can read own votes"
  ON public.casting_vote
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.jwt() ->> 'sub') = user_id);
```

---

*마지막 업데이트: 2025-12-13 (가상 캐스팅 DB 스키마 및 관리자 승인 페이지 추가)*
