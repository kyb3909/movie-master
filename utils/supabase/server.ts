import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { auth } from "@clerk/nextjs/server"
import type { Database } from "@/types/database.types"

/**
 * 서버 컴포넌트에서 사용할 기본 Supabase 클라이언트
 * - 쿠키 기반 세션 관리 (Supabase Auth용)
 * - Clerk 인증 없이 공개 데이터 접근 시 사용
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서 setAll이 호출될 경우 무시
          }
        },
      },
    }
  )
}

/**
 * Clerk 인증과 통합된 서버 사이드 Supabase 클라이언트
 * - Server Components, Server Actions, Route Handlers에서 사용
 * - Clerk의 JWT 토큰을 사용하여 RLS 정책 적용
 * 
 * @example
 * ```tsx
 * // Server Component
 * import { createClerkSupabaseClientSsr } from "@/utils/supabase/server"
 * 
 * export default async function Page() {
 *   const supabase = await createClerkSupabaseClientSsr()
 *   const { data } = await supabase.from("my_table").select("*")
 *   // RLS 정책이 Clerk userId를 기반으로 적용됨
 * }
 * ```
 */
export async function createClerkSupabaseClientSsr() {
  // Clerk에서 인증 정보 가져오기
  const { getToken } = await auth()
  
  // Supabase용 JWT 토큰 가져오기
  // Clerk Dashboard에서 "supabase" JWT 템플릿을 설정해야 합니다
  const clerkToken = await getToken({ template: "supabase" })

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
 * Service Role Key를 사용하는 관리자용 Supabase 클라이언트
 * - RLS를 우회하여 모든 데이터에 접근 가능
 * - 서버 사이드에서만 사용 (절대로 클라이언트에 노출하지 마세요!)
 * 
 * @example
 * ```tsx
 * // Server Action or Route Handler
 * import { createAdminClient } from "@/utils/supabase/server"
 * 
 * async function adminOperation() {
 *   const supabase = createAdminClient()
 *   // RLS를 우회하여 모든 데이터 접근
 *   const { data } = await supabase.from("users").select("*")
 * }
 * ```
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Admin client requires service role key."
    )
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
