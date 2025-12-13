"use server"

import { createClient, createClerkSupabaseClientSsr, createAdminClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"
import type {
  CastingContent,
  CastingContentWithCharacters,
  CastingContentSummary,
  CastingCharacter,
  CastingVoteInput,
  CreateCastingContentInput,
  UpdateCastingContentInput,
  TopCastedActor,
  PendingCastingContent,
  MAX_CHARACTERS_PER_PROJECT,
} from "@/types/casting.types"

// ============================================
// 프로젝트 조회 (Public)
// ============================================

/**
 * 승인된 캐스팅 프로젝트 목록을 가져옵니다
 */
export async function getApprovedProjects(): Promise<CastingContentSummary[]> {
  const supabase = await createClient()

  const { data: contents, error } = await supabase
    .from("casting_content")
    .select(`
      id,
      title,
      type,
      thumbnail_url,
      is_approved,
      creator_id,
      created_at,
      casting_character(count)
    `)
    .eq("is_approved", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching approved projects:", error)
    return []
  }

  // 각 프로젝트별 투표 수 집계
  const projectIds = contents?.map((c) => c.id) || []

  const { data: voteCounts } = await supabase
    .from("casting_vote")
    .select("character_id, casting_character!inner(content_id)")
    .in("casting_character.content_id", projectIds)

  // 프로젝트별 투표 수 맵
  const voteCountMap = new Map<string, number>()
  voteCounts?.forEach((vote) => {
    const contentId = (vote.casting_character as { content_id: string })?.content_id
    if (contentId) {
      voteCountMap.set(contentId, (voteCountMap.get(contentId) || 0) + 1)
    }
  })

  return (contents || []).map((content) => ({
    id: content.id,
    title: content.title,
    type: content.type as CastingContentSummary["type"],
    thumbnail_url: content.thumbnail_url,
    is_approved: content.is_approved,
    character_count: (content.casting_character as { count: number }[])?.[0]?.count || 0,
    vote_count: voteCountMap.get(content.id) || 0,
    creator_id: content.creator_id,
    created_at: content.created_at,
  }))
}

/**
 * 내가 만든 프로젝트 목록을 가져옵니다
 */
export async function getMyProjects(): Promise<CastingContentSummary[]> {
  const { userId } = await auth()
  if (!userId) return []

  const supabase = await createClient()

  const { data: contents, error } = await supabase
    .from("casting_content")
    .select(`
      id,
      title,
      type,
      thumbnail_url,
      is_approved,
      rejection_reason,
      creator_id,
      created_at,
      casting_character(count)
    `)
    .eq("creator_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching my projects:", error)
    return []
  }

  return (contents || []).map((content) => ({
    id: content.id,
    title: content.title,
    type: content.type as CastingContentSummary["type"],
    thumbnail_url: content.thumbnail_url,
    is_approved: content.is_approved,
    character_count: (content.casting_character as { count: number }[])?.[0]?.count || 0,
    vote_count: 0,
    creator_id: content.creator_id,
    created_at: content.created_at,
  }))
}

/**
 * 특정 프로젝트의 상세 정보를 가져옵니다 (캐릭터 포함)
 */
export async function getProjectWithCharacters(
  projectId: string
): Promise<CastingContentWithCharacters | null> {
  const supabase = await createClient()

  const { data: content, error: contentError } = await supabase
    .from("casting_content")
    .select("*")
    .eq("id", projectId)
    .single()

  if (contentError || !content) {
    console.error("Error fetching project:", contentError)
    return null
  }

  const { data: characters, error: charError } = await supabase
    .from("casting_character")
    .select("*")
    .eq("content_id", projectId)
    .order("order", { ascending: true })

  if (charError) {
    console.error("Error fetching characters:", charError)
    return null
  }

  return {
    ...content,
    characters: characters || [],
  } as CastingContentWithCharacters
}

// ============================================
// 프로젝트 CRUD
// ============================================

/**
 * 새 캐스팅 프로젝트를 생성합니다
 */
export async function createProject(
  input: CreateCastingContentInput
): Promise<{ success: boolean; projectId?: string; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  // 캐릭터 수 제한 검사
  if (input.characters.length > 20) {
    return { success: false, error: "캐릭터는 최대 20명까지만 등록할 수 있습니다." }
  }

  if (input.characters.length === 0) {
    return { success: false, error: "캐릭터를 최소 1명 이상 등록해야 합니다." }
  }

  const supabase = await createClient()

  // 1. 프로젝트 생성
  const { data: project, error: projectError } = await supabase
    .from("casting_content")
    .insert({
      title: input.title,
      type: input.type,
      thumbnail_url: input.thumbnail_url || null,
      description: input.description || null,
      creator_id: userId,
      is_approved: false, // 승인 대기 상태로 시작
    })
    .select()
    .single()

  if (projectError || !project) {
    console.error("Error creating project:", projectError)
    return { success: false, error: projectError?.message || "프로젝트 생성 실패" }
  }

  // 2. 캐릭터 일괄 생성
  const charactersToInsert = input.characters.map((char, index) => ({
    content_id: project.id,
    name: char.name,
    image_url: char.image_url || null,
    order: char.order || index + 1,
  }))

  const { error: charError } = await supabase
    .from("casting_character")
    .insert(charactersToInsert)

  if (charError) {
    console.error("Error creating characters:", charError)
    // 프로젝트 롤백
    await supabase.from("casting_content").delete().eq("id", project.id)
    return { success: false, error: "캐릭터 생성 실패" }
  }

  revalidatePath("/")
  return { success: true, projectId: project.id }
}

/**
 * 프로젝트 정보를 수정합니다 (자신의 프로젝트만)
 */
export async function updateProject(
  input: UpdateCastingContentInput
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const supabase = await createClient()

  // 자신의 프로젝트인지 확인
  const { data: existing } = await supabase
    .from("casting_content")
    .select("creator_id, is_approved")
    .eq("id", input.id)
    .single()

  if (!existing || existing.creator_id !== userId) {
    return { success: false, error: "수정 권한이 없습니다." }
  }

  // 이미 승인된 프로젝트는 수정 불가
  if (existing.is_approved) {
    return { success: false, error: "승인된 프로젝트는 수정할 수 없습니다." }
  }

  const updateData: Partial<CastingContent> = {}
  if (input.title) updateData.title = input.title
  if (input.type) updateData.type = input.type
  if (input.thumbnail_url !== undefined) updateData.thumbnail_url = input.thumbnail_url
  if (input.description !== undefined) updateData.description = input.description

  const { error } = await supabase
    .from("casting_content")
    .update(updateData)
    .eq("id", input.id)

  if (error) {
    console.error("Error updating project:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

/**
 * 프로젝트를 삭제합니다 (자신의 프로젝트만)
 */
export async function deleteProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const supabase = await createClient()

  // 자신의 프로젝트인지 확인
  const { data: existing } = await supabase
    .from("casting_content")
    .select("creator_id")
    .eq("id", projectId)
    .single()

  if (!existing || existing.creator_id !== userId) {
    return { success: false, error: "삭제 권한이 없습니다." }
  }

  const { error } = await supabase
    .from("casting_content")
    .delete()
    .eq("id", projectId)

  if (error) {
    console.error("Error deleting project:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

// ============================================
// 캐릭터 CRUD
// ============================================

/**
 * 프로젝트에 캐릭터를 추가합니다
 */
export async function addCharacter(
  projectId: string,
  name: string,
  imageUrl?: string
): Promise<{ success: boolean; character?: CastingCharacter; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const supabase = await createClient()

  // 자신의 프로젝트인지 확인
  const { data: project } = await supabase
    .from("casting_content")
    .select("creator_id, is_approved")
    .eq("id", projectId)
    .single()

  if (!project || project.creator_id !== userId) {
    return { success: false, error: "추가 권한이 없습니다." }
  }

  if (project.is_approved) {
    return { success: false, error: "승인된 프로젝트에는 캐릭터를 추가할 수 없습니다." }
  }

  // 현재 캐릭터 수 확인
  const { count } = await supabase
    .from("casting_character")
    .select("*", { count: "exact", head: true })
    .eq("content_id", projectId)

  if ((count || 0) >= 20) {
    return { success: false, error: "캐릭터는 최대 20명까지만 등록할 수 있습니다." }
  }

  const { data: character, error } = await supabase
    .from("casting_character")
    .insert({
      content_id: projectId,
      name,
      image_url: imageUrl || null,
    })
    .select()
    .single()

  if (error) {
    console.error("Error adding character:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true, character }
}

/**
 * 캐릭터 정보를 수정합니다
 */
export async function updateCharacter(
  characterId: string,
  name: string,
  imageUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const supabase = await createClient()

  // 자신의 프로젝트의 캐릭터인지 확인
  const { data: character } = await supabase
    .from("casting_character")
    .select("content_id, casting_content(creator_id, is_approved)")
    .eq("id", characterId)
    .single()

  const content = character?.casting_content as { creator_id: string; is_approved: boolean } | null
  if (!character || content?.creator_id !== userId) {
    return { success: false, error: "수정 권한이 없습니다." }
  }

  if (content?.is_approved) {
    return { success: false, error: "승인된 프로젝트의 캐릭터는 수정할 수 없습니다." }
  }

  const { error } = await supabase
    .from("casting_character")
    .update({ name, image_url: imageUrl || null })
    .eq("id", characterId)

  if (error) {
    console.error("Error updating character:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

/**
 * 캐릭터를 삭제합니다
 */
export async function deleteCharacter(
  characterId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const supabase = await createClient()

  // 자신의 프로젝트의 캐릭터인지 확인
  const { data: character } = await supabase
    .from("casting_character")
    .select("content_id, casting_content(creator_id, is_approved)")
    .eq("id", characterId)
    .single()

  const content = character?.casting_content as { creator_id: string; is_approved: boolean } | null
  if (!character || content?.creator_id !== userId) {
    return { success: false, error: "삭제 권한이 없습니다." }
  }

  if (content?.is_approved) {
    return { success: false, error: "승인된 프로젝트의 캐릭터는 삭제할 수 없습니다." }
  }

  const { error } = await supabase
    .from("casting_character")
    .delete()
    .eq("id", characterId)

  if (error) {
    console.error("Error deleting character:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

// ============================================
// 투표 (캐스팅)
// ============================================

/**
 * 캐릭터에 배우를 캐스팅합니다 (투표)
 */
export async function castActor(
  input: CastingVoteInput
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  // actor_id 또는 custom_actor_name 중 하나는 필수
  if (!input.actor_id && !input.custom_actor_name) {
    return { success: false, error: "배우를 선택하거나 이름을 입력해주세요." }
  }

  // Admin 클라이언트 사용 (RLS 우회 - 서버 사이드에서 userId 검증 완료)
  const supabase = createAdminClient()

  // 캐릭터가 승인된 프로젝트의 것인지 확인
  const { data: character } = await supabase
    .from("casting_character")
    .select("content_id, casting_content(is_approved)")
    .eq("id", input.character_id)
    .single()

  const content = character?.casting_content as { is_approved: boolean } | null
  if (!character || !content?.is_approved) {
    return { success: false, error: "승인된 프로젝트의 캐릭터만 캐스팅할 수 있습니다." }
  }

  // Upsert (기존 투표가 있으면 업데이트)
  const { error } = await supabase
    .from("casting_vote")
    .upsert(
      {
        user_id: userId,
        character_id: input.character_id,
        actor_id: input.actor_id || null,
        custom_actor_name: input.custom_actor_name || null,
        custom_actor_image_url: input.custom_actor_image_url || null,
      },
      {
        onConflict: "user_id,character_id",
      }
    )

  if (error) {
    console.error("Error casting actor:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

/**
 * 내 캐스팅 목록을 가져옵니다 (특정 프로젝트)
 */
export async function getMyCastings(
  projectId: string
): Promise<Record<string, { actorName: string; actorImage: string | null }>> {
  const { userId } = await auth()
  if (!userId) return {}

  const supabase = await createClient()

  // 먼저 해당 프로젝트의 캐릭터 ID들을 가져옴
  const { data: characters } = await supabase
    .from("casting_character")
    .select("id")
    .eq("content_id", projectId)

  if (!characters || characters.length === 0) return {}

  const characterIds = characters.map(c => c.id)

  // 해당 캐릭터들에 대한 사용자의 투표 조회
  const { data: votes, error } = await supabase
    .from("casting_vote")
    .select(`
      character_id,
      actor_id,
      custom_actor_name,
      custom_actor_image_url
    `)
    .eq("user_id", userId)
    .in("character_id", characterIds)

  if (error) {
    console.error("Error fetching my castings:", error)
    return {}
  }

  const result: Record<string, { actorName: string; actorImage: string | null }> = {}

  votes?.forEach((vote) => {
    result[vote.character_id] = {
      actorName: vote.custom_actor_name || "",
      actorImage: vote.custom_actor_image_url || null,
    }
  })

  return result
}

/**
 * 캐릭터별 인기 배우 TOP 3를 가져옵니다
 */
export async function getTopCastings(
  projectId: string
): Promise<Record<string, TopCastedActor[]>> {
  const supabase = await createClient()

  // 해당 프로젝트의 모든 캐릭터 ID 가져오기
  const { data: characters } = await supabase
    .from("casting_character")
    .select("id")
    .eq("content_id", projectId)

  if (!characters || characters.length === 0) return {}

  const characterIds = characters.map((c) => c.id)

  // 모든 투표 가져오기
  const { data: votes, error } = await supabase
    .from("casting_vote")
    .select(`
      character_id,
      custom_actor_name,
      custom_actor_image_url
    `)
    .in("character_id", characterIds)

  if (error) {
    console.error("Error fetching top castings:", error)
    return {}
  }

  // 캐릭터별, 배우별 투표 수 집계
  const voteCounts: Record<string, Record<string, { name: string; image: string | null; count: number }>> = {}

  votes?.forEach((vote) => {
    const charId = vote.character_id
    const actorName = vote.custom_actor_name || "Unknown"
    const actorImage = vote.custom_actor_image_url || null
    const actorKey = actorName.toLowerCase()

    if (!voteCounts[charId]) voteCounts[charId] = {}
    if (!voteCounts[charId][actorKey]) {
      voteCounts[charId][actorKey] = { name: actorName, image: actorImage, count: 0 }
    }
    voteCounts[charId][actorKey].count++
  })

  // TOP 3 추출
  const result: Record<string, TopCastedActor[]> = {}

  Object.entries(voteCounts).forEach(([charId, actors]) => {
    const sorted = Object.values(actors)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((actor, index) => ({
        actor_name: actor.name,
        actor_image: actor.image,
        vote_count: actor.count,
        rank: index + 1,
      }))

    result[charId] = sorted
  })

  return result
}

// ============================================
// 관리자 기능
// ============================================

/**
 * 승인 대기 중인 프로젝트 목록을 가져옵니다 (Admin)
 */
export async function getPendingProjects(): Promise<PendingCastingContent[]> {
  const supabase = createAdminClient()

  const { data: contents, error } = await supabase
    .from("casting_content")
    .select(`
      *,
      casting_character(*)
    `)
    .eq("is_approved", false)
    .is("rejection_reason", null)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching pending projects:", error)
    return []
  }

  return (contents || []).map((content) => ({
    ...content,
    characters: content.casting_character || [],
  })) as PendingCastingContent[]
}

/**
 * 프로젝트를 승인합니다 (Admin)
 */
export async function approveProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from("casting_content")
    .update({
      is_approved: true,
      approved_at: new Date().toISOString(),
      approved_by: userId,
      rejection_reason: null,
    })
    .eq("id", projectId)

  if (error) {
    console.error("Error approving project:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/noorung/casting")
  revalidatePath("/")
  return { success: true }
}

/**
 * 프로젝트를 거부합니다 (Admin)
 */
export async function rejectProject(
  projectId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from("casting_content")
    .update({
      is_approved: false,
      approved_at: null,
      approved_by: null,
      rejection_reason: reason,
    })
    .eq("id", projectId)

  if (error) {
    console.error("Error rejecting project:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/noorung/casting")
  return { success: true }
}

/**
 * 모든 프로젝트 목록을 가져옵니다 (Admin)
 */
export async function getAllProjects(): Promise<CastingContentSummary[]> {
  const supabase = createAdminClient()

  const { data: contents, error } = await supabase
    .from("casting_content")
    .select(`
      id,
      title,
      type,
      thumbnail_url,
      is_approved,
      rejection_reason,
      creator_id,
      created_at,
      casting_character(count)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching all projects:", error)
    return []
  }

  return (contents || []).map((content) => ({
    id: content.id,
    title: content.title,
    type: content.type as CastingContentSummary["type"],
    thumbnail_url: content.thumbnail_url,
    is_approved: content.is_approved,
    character_count: (content.casting_character as { count: number }[])?.[0]?.count || 0,
    vote_count: 0,
    creator_id: content.creator_id,
    created_at: content.created_at,
  }))
}

