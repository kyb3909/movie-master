/**
 * 가상 캐스팅 게임 관련 타입 정의
 */

// ============================================
// 캐스팅 콘텐츠 (프로젝트)
// ============================================
export interface CastingContent {
  id: string
  title: string
  type: "movie" | "novel" | "webtoon" | "anime" | "manga" | "other"
  thumbnail_url: string | null
  description: string | null
  creator_id: string | null
  is_approved: boolean
  approved_at: string | null
  approved_by: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

// 프로젝트 생성 시 필요한 데이터
export interface CreateCastingContentInput {
  title: string
  type: CastingContent["type"]
  thumbnail_url?: string
  description?: string
  characters: CreateCastingCharacterInput[]
}

// 프로젝트 수정 시 필요한 데이터
export interface UpdateCastingContentInput {
  id: string
  title?: string
  type?: CastingContent["type"]
  thumbnail_url?: string
  description?: string
}

// ============================================
// 캐스팅 캐릭터
// ============================================
export interface CastingCharacter {
  id: string
  content_id: string
  name: string
  image_url: string | null
  order: number
  created_at: string
}

// 캐릭터 생성 시 필요한 데이터
export interface CreateCastingCharacterInput {
  name: string
  image_url?: string
  order?: number
}

// ============================================
// 캐스팅 투표
// ============================================
export interface CastingVote {
  id: string
  user_id: string
  character_id: string
  actor_id: string | null
  custom_actor_name: string | null
  custom_actor_image_url: string | null
  created_at: string
}

// 투표 생성/수정 시 필요한 데이터
export interface CastingVoteInput {
  character_id: string
  // actor 테이블에서 선택하거나
  actor_id?: string
  // 직접 입력하거나
  custom_actor_name?: string
  custom_actor_image_url?: string
}

// ============================================
// 배우
// ============================================
export interface Actor {
  actor_id: string
  name: string
  nationality: string | null
  gender: "male" | "female" | "other" | null
  image_url: string | null
  created_at: string
}

// ============================================
// 조합 타입 (조회용)
// ============================================

// 캐릭터와 함께 조회된 프로젝트
export interface CastingContentWithCharacters extends CastingContent {
  characters: CastingCharacter[]
}

// 투표 정보와 배우 정보가 포함된 캐릭터
export interface CastingCharacterWithVotes extends CastingCharacter {
  votes: CastingVoteWithActor[]
  top_actors: TopCastedActor[]
}

// 배우 정보가 포함된 투표
export interface CastingVoteWithActor extends CastingVote {
  actor?: Actor | null
  // 투표에 사용된 배우 정보 (actor_id 또는 custom 필드에서)
  actor_name: string
  actor_image: string | null
}

// 인기 캐스팅 (캐릭터별 TOP 배우)
export interface TopCastedActor {
  actor_name: string
  actor_image: string | null
  vote_count: number
  rank: number
}

// 프로젝트 목록 조회용 (간략 정보)
export interface CastingContentSummary {
  id: string
  title: string
  type: CastingContent["type"]
  thumbnail_url: string | null
  is_approved: boolean
  character_count: number
  vote_count: number
  creator_id: string | null
  created_at: string
}

// ============================================
// 관리자용 타입
// ============================================

// 승인 대기 프로젝트
export interface PendingCastingContent extends CastingContent {
  characters: CastingCharacter[]
  creator_name?: string
}

// 승인/거부 액션
export interface ApprovalAction {
  content_id: string
  action: "approve" | "reject"
  reason?: string // 거부 시 사유
}

// ============================================
// API 응답 타입
// ============================================
export interface CastingApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// 페이지네이션 응답
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ============================================
// 상수
// ============================================
export const MAX_CHARACTERS_PER_PROJECT = 20

export const CONTENT_TYPE_LABELS: Record<CastingContent["type"], string> = {
  movie: "영화",
  novel: "소설",
  webtoon: "웹툰",
  anime: "애니메이션",
  manga: "만화",
  other: "기타",
}

