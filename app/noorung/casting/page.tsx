import { getPendingProjects, getAllProjects } from "@/lib/actions/casting"
import { CastingAdminClient } from "./casting-admin-client"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { checkIsAdmin } from "@/hooks/use-admin"

export const dynamic = "force-dynamic"

export default async function CastingAdminPage() {
  const { userId } = await auth()

  // 로그인하지 않았거나 관리자가 아니면 홈으로 리다이렉트
  if (!userId || !checkIsAdmin(userId)) {
    redirect("/")
  }

  const [pendingProjects, allProjects] = await Promise.all([
    getPendingProjects(),
    getAllProjects(),
  ])

  return (
    <CastingAdminClient
      initialPendingProjects={pendingProjects}
      initialAllProjects={allProjects}
    />
  )
}

