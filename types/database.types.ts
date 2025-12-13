/**
 * Supabase 데이터베이스 타입 정의
 * 
 * 이 파일은 Supabase CLI를 통해 자동 생성할 수 있습니다:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.types.ts
 * 
 * 아래는 PRD에 정의된 테이블 구조에 따른 수동 타입 정의입니다.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // 배우 테이블
      actor: {
        Row: {
          actor_id: string
          name: string
          nationality: string | null
          gender: string | null
          image_url: string | null
          created_at: string
        }
        Insert: {
          actor_id?: string
          name: string
          nationality?: string | null
          gender?: string | null
          image_url?: string | null
          created_at?: string
        }
        Update: {
          actor_id?: string
          name?: string
          nationality?: string | null
          gender?: string | null
          image_url?: string | null
          created_at?: string
        }
      }
      // 영화 퀴즈 테이블
      movie_quiz: {
        Row: {
          quiz_id: string
          title: string
          actor_1: string
          actor_2: string
          actor_3: string
          actor_4: string
          actor_5: string
          actor_6: string
          actor_7: string
          play_count: number
          correct_count: number
          avg_correct_position: number | null
          created_at: string
        }
        Insert: {
          quiz_id?: string
          title: string
          actor_1: string
          actor_2: string
          actor_3: string
          actor_4: string
          actor_5: string
          actor_6: string
          actor_7: string
          play_count?: number
          correct_count?: number
          avg_correct_position?: number | null
          created_at?: string
        }
        Update: {
          quiz_id?: string
          title?: string
          actor_1?: string
          actor_2?: string
          actor_3?: string
          actor_4?: string
          actor_5?: string
          actor_6?: string
          actor_7?: string
          play_count?: number
          correct_count?: number
          avg_correct_position?: number | null
          created_at?: string
        }
      }
      // 캐스팅 콘텐츠 테이블
      casting_content: {
        Row: {
          id: string
          title: string
          type: string
          thumbnail_url: string | null
          description: string | null
          creator_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          type: string
          thumbnail_url?: string | null
          description?: string | null
          creator_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          type?: string
          thumbnail_url?: string | null
          description?: string | null
          creator_id?: string | null
          created_at?: string
        }
      }
      // 캐스팅 캐릭터 테이블
      casting_character: {
        Row: {
          id: string
          content_id: string
          name: string
          image_url: string | null
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          content_id: string
          name: string
          image_url?: string | null
          order?: number
          created_at?: string
        }
        Update: {
          id?: string
          content_id?: string
          name?: string
          image_url?: string | null
          order?: number
          created_at?: string
        }
      }
      // 캐스팅 투표 테이블
      casting_vote: {
        Row: {
          id: string
          user_id: string
          character_id: string
          actor_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id: string
          actor_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          character_id?: string
          actor_id?: string
          created_at?: string
        }
      }
      // 퀴즈 결과 로그 테이블
      quiz_result_log: {
        Row: {
          id: string
          quiz_id: string
          user_id: string | null
          result: "correct" | "incorrect"
          correct_position: number | null
          created_at: string
        }
        Insert: {
          id?: string
          quiz_id: string
          user_id?: string | null
          result: "correct" | "incorrect"
          correct_position?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          quiz_id?: string
          user_id?: string | null
          result?: "correct" | "incorrect"
          correct_position?: number | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// 타입 헬퍼
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]

// 개별 테이블 타입 export
export type Actor = Tables<"actor">
export type MovieQuiz = Tables<"movie_quiz">
export type CastingContent = Tables<"casting_content">
export type CastingCharacter = Tables<"casting_character">
export type CastingVote = Tables<"casting_vote">
export type QuizResultLog = Tables<"quiz_result_log">

