import { getAllQuizzes } from "@/lib/actions/quiz"
import { QuizAdminClient } from "./quiz-admin-client"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { checkIsAdmin } from "@/hooks/use-admin"

export const dynamic = "force-dynamic"

export default async function QuizAdminPage() {
  const { userId } = await auth()

  // 로그인하지 않았거나 관리자가 아니면 홈으로 리다이렉트
  if (!userId || !checkIsAdmin(userId)) {
    redirect("/")
  }

  const quizzes = await getAllQuizzes()
  
  return <QuizAdminClient initialQuizzes={quizzes} />
}

