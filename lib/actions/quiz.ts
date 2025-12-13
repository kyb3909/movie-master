"use server"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import type { 
  Quiz, 
  QuizActor, 
  QuizWithActors, 
  QuizForPlay,
  QuizFormData 
} from "@/types/quiz.types"

// ============================================
// 퀴즈 조회 (Public)
// ============================================

/**
 * 랜덤 퀴즈 하나를 가져옵니다 (플레이용)
 */
export async function getRandomQuiz(): Promise<QuizForPlay | null> {
  const supabase = await createClient()
  
  // 활성화된 퀴즈 중 랜덤으로 하나 선택
  const { data: quizzes, error: quizError } = await supabase
    .from("quiz")
    .select(`
      id, 
      title,
      hint1,
      hint2,
      hint3,
      hint4,
      hint5,
      hint6,
      hint7
    `)
    .eq("is_active", true)
  
  if (quizError || !quizzes || quizzes.length === 0) {
    console.error("Error fetching quizzes:", quizError)
    return null
  }
  
  // 랜덤 선택
  const randomQuiz = quizzes[Math.floor(Math.random() * quizzes.length)]
  
  // hint1~7의 배우 ID 수집
  const hintActorIds = [
    randomQuiz.hint1,
    randomQuiz.hint2,
    randomQuiz.hint3,
    randomQuiz.hint4,
    randomQuiz.hint5,
    randomQuiz.hint6,
    randomQuiz.hint7,
  ].filter((id): id is string => id !== null)
  
  // 배우 정보 가져오기
  const { data: actors, error: actorsError } = await supabase
    .from("quiz_actor")
    .select("id, name, image_url")
    .in("id", hintActorIds)
  
  if (actorsError) {
    console.error("Error fetching actors:", actorsError)
    return null
  }
  
  // 배우 ID → 배우 정보 맵
  const actorMap = new Map(actors?.map(a => [a.id, a]) || [])
  
  // hint 순서대로 배우 정보 매핑
  const orderedActors = [
    randomQuiz.hint1,
    randomQuiz.hint2,
    randomQuiz.hint3,
    randomQuiz.hint4,
    randomQuiz.hint5,
    randomQuiz.hint6,
    randomQuiz.hint7,
  ]
    .map((actorId, index) => {
      if (!actorId) return null
      const actor = actorMap.get(actorId)
      if (!actor) return null
      return {
        name: actor.name,
        photo: actor.image_url || "/placeholder.svg?height=80&width=80",
        order: index + 1,
      }
    })
    .filter((actor): actor is NonNullable<typeof actor> => actor !== null)
  
  return {
    id: randomQuiz.id,
    title: randomQuiz.title,
    actors: orderedActors,
  }
}

/**
 * 퀴즈 결과를 기록합니다
 */
export async function recordQuizResult(
  quizId: string,
  isCorrect: boolean,
  hintsUsed: number,
  userId?: string | null
): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("quiz_play_log")
    .insert({
      quiz_id: quizId,
      user_id: userId || null,
      is_correct: isCorrect,
      hints_used: hintsUsed,
    })
  
  if (error) {
    console.error("Error recording quiz result:", error)
    return false
  }
  
  return true
}

// ============================================
// 배우 조회 (Admin/Public)
// ============================================

/**
 * 모든 배우 목록을 가져옵니다
 */
export async function getAllActors(): Promise<QuizActor[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("quiz_actor")
    .select("*")
    .order("name", { ascending: true })
  
  if (error) {
    console.error("Error fetching actors:", error)
    return []
  }
  
  return data || []
}

/**
 * 배우를 검색합니다
 */
export async function searchActors(query: string): Promise<QuizActor[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("quiz_actor")
    .select("*")
    .ilike("name", `%${query}%`)
    .order("name", { ascending: true })
    .limit(20)
  
  if (error) {
    console.error("Error searching actors:", error)
    return []
  }
  
  return data || []
}

// ============================================
// Admin CRUD 기능 - 퀴즈
// ============================================

/**
 * 모든 퀴즈 목록을 가져옵니다 (Admin용)
 */
export async function getAllQuizzes(): Promise<QuizWithActors[]> {
  const supabase = createAdminClient()
  
  const { data: quizzes, error: quizError } = await supabase
    .from("quiz")
    .select("*")
    .order("created_at", { ascending: false })
  
  if (quizError || !quizzes) {
    console.error("Error fetching all quizzes:", quizError)
    return []
  }
  
  // 모든 퀴즈에서 참조된 배우 ID 수집
  const allActorIds = new Set<string>()
  quizzes.forEach(quiz => {
    [quiz.hint1, quiz.hint2, quiz.hint3, quiz.hint4, quiz.hint5, quiz.hint6, quiz.hint7]
      .filter((id): id is string => id !== null)
      .forEach(id => allActorIds.add(id))
  })
  
  // 배우 정보 일괄 조회
  const { data: actors } = await supabase
    .from("quiz_actor")
    .select("*")
    .in("id", Array.from(allActorIds))
  
  const actorMap = new Map(actors?.map(a => [a.id, a]) || [])
  
  // 퀴즈별 힌트 배우 정보 매핑
  return quizzes.map(quiz => ({
    id: quiz.id,
    title: quiz.title,
    is_active: quiz.is_active,
    play_count: quiz.play_count,
    correct_count: quiz.correct_count,
    created_at: quiz.created_at,
    updated_at: quiz.updated_at,
    hints: [
      { order: 1, actor: quiz.hint1 ? actorMap.get(quiz.hint1) || null : null },
      { order: 2, actor: quiz.hint2 ? actorMap.get(quiz.hint2) || null : null },
      { order: 3, actor: quiz.hint3 ? actorMap.get(quiz.hint3) || null : null },
      { order: 4, actor: quiz.hint4 ? actorMap.get(quiz.hint4) || null : null },
      { order: 5, actor: quiz.hint5 ? actorMap.get(quiz.hint5) || null : null },
      { order: 6, actor: quiz.hint6 ? actorMap.get(quiz.hint6) || null : null },
      { order: 7, actor: quiz.hint7 ? actorMap.get(quiz.hint7) || null : null },
    ],
  }))
}

/**
 * 특정 퀴즈를 가져옵니다 (Admin용)
 */
export async function getQuizById(quizId: string): Promise<QuizWithActors | null> {
  const supabase = createAdminClient()
  
  const { data: quiz, error: quizError } = await supabase
    .from("quiz")
    .select("*")
    .eq("id", quizId)
    .single()
  
  if (quizError || !quiz) {
    console.error("Error fetching quiz:", quizError)
    return null
  }
  
  // 배우 ID 수집
  const actorIds = [quiz.hint1, quiz.hint2, quiz.hint3, quiz.hint4, quiz.hint5, quiz.hint6, quiz.hint7]
    .filter((id): id is string => id !== null)
  
  // 배우 정보 조회
  const { data: actors } = await supabase
    .from("quiz_actor")
    .select("*")
    .in("id", actorIds)
  
  const actorMap = new Map(actors?.map(a => [a.id, a]) || [])
  
  return {
    id: quiz.id,
    title: quiz.title,
    is_active: quiz.is_active,
    play_count: quiz.play_count,
    correct_count: quiz.correct_count,
    created_at: quiz.created_at,
    updated_at: quiz.updated_at,
    hints: [
      { order: 1, actor: quiz.hint1 ? actorMap.get(quiz.hint1) || null : null },
      { order: 2, actor: quiz.hint2 ? actorMap.get(quiz.hint2) || null : null },
      { order: 3, actor: quiz.hint3 ? actorMap.get(quiz.hint3) || null : null },
      { order: 4, actor: quiz.hint4 ? actorMap.get(quiz.hint4) || null : null },
      { order: 5, actor: quiz.hint5 ? actorMap.get(quiz.hint5) || null : null },
      { order: 6, actor: quiz.hint6 ? actorMap.get(quiz.hint6) || null : null },
      { order: 7, actor: quiz.hint7 ? actorMap.get(quiz.hint7) || null : null },
    ],
  }
}

/**
 * 새 퀴즈를 생성합니다 (Admin용)
 */
export async function createQuiz(formData: QuizFormData): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  // actorIds 배열에서 hint1~7 추출
  const [hint1, hint2, hint3, hint4, hint5, hint6, hint7] = formData.actorIds
  
  const { error: quizError } = await supabase
    .from("quiz")
    .insert({ 
      title: formData.title,
      hint1: hint1 || null,
      hint2: hint2 || null,
      hint3: hint3 || null,
      hint4: hint4 || null,
      hint5: hint5 || null,
      hint6: hint6 || null,
      hint7: hint7 || null,
    })
  
  if (quizError) {
    console.error("Error creating quiz:", quizError)
    return { success: false, error: quizError.message }
  }
  
  revalidatePath("/admin/quiz")
  return { success: true }
}

/**
 * 퀴즈를 수정합니다 (Admin용)
 */
export async function updateQuiz(
  quizId: string, 
  formData: QuizFormData
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  const [hint1, hint2, hint3, hint4, hint5, hint6, hint7] = formData.actorIds
  
  const { error: quizError } = await supabase
    .from("quiz")
    .update({ 
      title: formData.title,
      hint1: hint1 || null,
      hint2: hint2 || null,
      hint3: hint3 || null,
      hint4: hint4 || null,
      hint5: hint5 || null,
      hint6: hint6 || null,
      hint7: hint7 || null,
    })
    .eq("id", quizId)
  
  if (quizError) {
    console.error("Error updating quiz:", quizError)
    return { success: false, error: quizError.message }
  }
  
  revalidatePath("/admin/quiz")
  return { success: true }
}

/**
 * 퀴즈를 삭제합니다 (Admin용)
 */
export async function deleteQuiz(quizId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from("quiz")
    .delete()
    .eq("id", quizId)
  
  if (error) {
    console.error("Error deleting quiz:", error)
    return { success: false, error: error.message }
  }
  
  revalidatePath("/admin/quiz")
  return { success: true }
}

/**
 * 퀴즈 활성화/비활성화 토글 (Admin용)
 */
export async function toggleQuizActive(
  quizId: string, 
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from("quiz")
    .update({ is_active: isActive })
    .eq("id", quizId)
  
  if (error) {
    console.error("Error toggling quiz:", error)
    return { success: false, error: error.message }
  }
  
  revalidatePath("/admin/quiz")
  return { success: true }
}

// ============================================
// Admin CRUD 기능 - 배우
// ============================================

/**
 * 새 배우를 생성합니다 (Admin용)
 */
export async function createActor(
  name: string, 
  imageUrl?: string
): Promise<{ success: boolean; actor?: QuizActor; error?: string }> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from("quiz_actor")
    .insert({ 
      name, 
      image_url: imageUrl || null 
    })
    .select()
    .single()
  
  if (error) {
    console.error("Error creating actor:", error)
    return { success: false, error: error.message }
  }
  
  revalidatePath("/admin/quiz")
  return { success: true, actor: data }
}

/**
 * 배우 정보를 수정합니다 (Admin용)
 */
export async function updateActor(
  actorId: string,
  name: string, 
  imageUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from("quiz_actor")
    .update({ 
      name, 
      image_url: imageUrl || null 
    })
    .eq("id", actorId)
  
  if (error) {
    console.error("Error updating actor:", error)
    return { success: false, error: error.message }
  }
  
  revalidatePath("/admin/quiz")
  return { success: true }
}

/**
 * 배우를 삭제합니다 (Admin용)
 * 주의: 해당 배우가 퀴즈에서 사용 중이면 삭제 불가
 */
export async function deleteActor(actorId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from("quiz_actor")
    .delete()
    .eq("id", actorId)
  
  if (error) {
    console.error("Error deleting actor:", error)
    return { success: false, error: error.message }
  }
  
  revalidatePath("/admin/quiz")
  return { success: true }
}
