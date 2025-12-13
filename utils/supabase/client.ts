import { createBrowserClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

/**
 * 브라우저(클라이언트 컴포넌트)에서 사용할 기본 Supabase 클라이언트
 * - 인증 없이 공개 데이터 접근용
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Clerk 인증과 통합된 Supabase 클라이언트 생성
 * - Clerk의 JWT 토큰을 Supabase에 전달하여 RLS 정책 적용
 * - 클라이언트 컴포넌트에서 사용
 * 
 * @example
 * ```tsx
 * "use client"
 * import { useSession } from "@clerk/nextjs"
 * import { createClerkSupabaseClient } from "@/utils/supabase/client"
 * 
 * function MyComponent() {
 *   const { session } = useSession()
 *   
 *   const fetchData = async () => {
 *     const supabase = await createClerkSupabaseClient(session)
 *     const { data } = await supabase.from("my_table").select("*")
 *   }
 * }
 * ```
 */
export async function createClerkSupabaseClient(
  session: { getToken: (options?: { template?: string }) => Promise<string | null> } | null | undefined
) {
  // Clerk 세션에서 Supabase용 JWT 토큰 가져오기
  // Clerk Dashboard에서 "supabase" JWT 템플릿을 설정해야 합니다
  const clerkToken = await session?.getToken({ template: "supabase" })

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${clerkToken}`,
        },
      },
    }
  )
}

/**
 * Clerk 인증과 통합된 Supabase 클라이언트 훅
 * - React 컴포넌트에서 사용하기 편한 형태
 * 
 * @example
 * ```tsx
 * "use client"
 * import { useClerkSupabase } from "@/utils/supabase/client"
 * 
 * function MyComponent() {
 *   const getSupabaseClient = useClerkSupabase()
 *   
 *   const fetchData = async () => {
 *     const supabase = await getSupabaseClient()
 *     const { data } = await supabase.from("my_table").select("*")
 *   }
 * }
 * ```
 */
export function useClerkSupabaseClientFactory() {
  // 이 함수는 useSession 훅과 함께 사용해야 합니다
  // hooks/use-supabase.ts에서 완전한 훅을 제공합니다
  return createClerkSupabaseClient
}
