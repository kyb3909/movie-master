/**
 * 영화 퀴즈 관련 타입 정의
 * 
 * 테이블 구조:
 * - quiz_actor: 배우 정보 (독립적, 여러 퀴즈에서 재사용 가능)
 * - quiz: 퀴즈 정보 + hint1~7 (quiz_actor FK 참조)
 */

// ============================================
// 데이터베이스 테이블 타입
// ============================================

/** 배우 테이블 */
export interface QuizActor {
  id: string
  name: string
  image_url: string | null
  created_at: string
}

/** 퀴즈 테이블 */
export interface Quiz {
  id: string
  title: string
  hint1: string | null
  hint2: string | null
  hint3: string | null
  hint4: string | null
  hint5: string | null
  hint6: string | null
  hint7: string | null
  is_active: boolean
  play_count: number
  correct_count: number
  created_at: string
  updated_at: string
}

/** 퀴즈 플레이 로그 테이블 */
export interface QuizPlayLog {
  id: string
  quiz_id: string
  user_id: string | null
  is_correct: boolean
  hints_used: number
  created_at: string
}

// ============================================
// 조회용 타입 (JOIN 결과)
// ============================================

/** 퀴즈 + 힌트 배우 정보 (Admin 조회용) */
export interface QuizWithActors {
  id: string
  title: string
  is_active: boolean
  play_count: number
  correct_count: number
  created_at: string
  updated_at: string
  hints: {
    order: number
    actor: QuizActor | null
  }[]
}

/** 클라이언트 플레이용 퀴즈 타입 */
export interface QuizForPlay {
  id: string
  title: string
  actors: {
    name: string
    photo: string
    order: number
  }[]
}

// ============================================
// Form 타입
// ============================================

/** Admin 퀴즈 생성/수정 폼 */
export interface QuizFormData {
  title: string
  /** 배우 ID 배열 (hint1~7 순서대로) */
  actorIds: (string | null)[]
}

// ============================================
// Insert/Update 타입
// ============================================

export interface QuizInsert {
  title: string
  hint1?: string | null
  hint2?: string | null
  hint3?: string | null
  hint4?: string | null
  hint5?: string | null
  hint6?: string | null
  hint7?: string | null
  is_active?: boolean
}

export interface QuizUpdate {
  title?: string
  hint1?: string | null
  hint2?: string | null
  hint3?: string | null
  hint4?: string | null
  hint5?: string | null
  hint6?: string | null
  hint7?: string | null
  is_active?: boolean
}

export interface QuizActorInsert {
  name: string
  image_url?: string | null
}

export interface QuizActorUpdate {
  name?: string
  image_url?: string | null
}
