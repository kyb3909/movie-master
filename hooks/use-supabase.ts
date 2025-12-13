"use client"

import { useCallback } from "react"
import { useSession } from "@clerk/nextjs"
import { createClerkSupabaseClient, createClient } from "@/utils/supabase/client"

/**
 * Clerk 인증과 통합된 Supabase 클라이언트를 제공하는 훅
 * 
 * @returns getClient - 인증된 Supabase 클라이언트를 반환하는 함수
 * 
 * @example
 * ```tsx
 * "use client"
 * import { useSupabase } from "@/hooks/use-supabase"
 * 
 * function MyComponent() {
 *   const { getClient, isLoaded, isSignedIn } = useSupabase()
 *   
 *   const fetchUserData = async () => {
 *     const supabase = await getClient()
 *     // RLS가 현재 로그인한 사용자의 userId를 기반으로 적용됨
 *     const { data, error } = await supabase
 *       .from("user_profiles")
 *       .select("*")
 *     
 *     if (error) console.error(error)
 *     return data
 *   }
 *   
 *   // ...
 * }
 * ```
 */
export function useSupabase() {
  const { session, isLoaded, isSignedIn } = useSession()

  /**
   * 인증된 Supabase 클라이언트 가져오기
   * - 로그인 상태: Clerk JWT 토큰을 사용한 클라이언트 반환
   * - 비로그인 상태: 기본 클라이언트 반환 (공개 데이터만 접근 가능)
   */
  const getClient = useCallback(async () => {
    if (isSignedIn && session) {
      return createClerkSupabaseClient(session)
    }
    // 비로그인 상태에서는 기본 클라이언트 반환
    return createClient()
  }, [session, isSignedIn])

  /**
   * 인증된 Supabase 클라이언트 가져오기 (인증 필수)
   * - 로그인되지 않은 경우 에러 throw
   */
  const getAuthenticatedClient = useCallback(async () => {
    if (!isSignedIn || !session) {
      throw new Error("Authentication required. Please sign in.")
    }
    return createClerkSupabaseClient(session)
  }, [session, isSignedIn])

  return {
    getClient,
    getAuthenticatedClient,
    isLoaded,
    isSignedIn,
  }
}

