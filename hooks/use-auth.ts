"use client"

import { useUser, useAuth as useClerkAuth } from "@clerk/nextjs"

/**
 * Clerk 인증 상태를 관리하는 커스텀 훅
 * - useUser: 현재 로그인한 사용자 정보
 * - useAuth: 인증 관련 메서드 (signOut 등)
 */
export function useAuth() {
  const { user, isLoaded, isSignedIn } = useUser()
  const { signOut, userId, sessionId } = useClerkAuth()

  return {
    // 사용자 정보
    user,
    userId,
    sessionId,
    
    // 상태
    isLoaded,
    isSignedIn,
    isAuthenticated: isSignedIn,
    loading: !isLoaded,
    
    // 메서드
    signOut,
  }
}

/**
 * 서버 컴포넌트에서 인증 정보를 가져오는 유틸리티
 * 
 * 사용 예시 (Server Component):
 * ```typescript
 * import { auth } from "@clerk/nextjs/server"
 * 
 * export default async function Page() {
 *   const { userId } = await auth()
 *   if (!userId) {
 *     return <div>로그인이 필요합니다</div>
 *   }
 *   // ...
 * }
 * ```
 */
