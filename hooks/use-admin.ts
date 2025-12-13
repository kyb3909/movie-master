"use client"

import { useAuth } from "@clerk/nextjs"

/**
 * 현재 사용자가 관리자인지 확인하는 훅
 * 환경 변수 NEXT_PUBLIC_ADMIN_USER_IDS에 설정된 User ID와 비교
 */
export function useAdmin() {
  const { userId, isLoaded, isSignedIn } = useAuth()

  const adminUserIds = process.env.NEXT_PUBLIC_ADMIN_USER_IDS?.split(",").map(id => id.trim()) || []
  
  const isAdmin = isLoaded && isSignedIn && userId ? adminUserIds.includes(userId) : false

  return {
    isAdmin,
    isLoaded,
    isSignedIn,
    userId,
  }
}

/**
 * 서버 사이드에서 관리자 확인
 */
export function checkIsAdmin(userId: string | null): boolean {
  if (!userId) return false
  
  const adminUserIds = process.env.NEXT_PUBLIC_ADMIN_USER_IDS?.split(",").map(id => id.trim()) || []
  return adminUserIds.includes(userId)
}

