"use server"

import { createClient } from "@/utils/supabase/server"
import { auth } from "@clerk/nextjs/server"

const BUCKET_NAME = "character-images"

/**
 * Base64 이미지를 Supabase Storage에 업로드합니다
 */
export async function uploadCharacterImage(
  base64Data: string,
  fileName?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { userId } = await auth()
  if (!userId) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  try {
    const supabase = await createClient()

    // base64 데이터에서 실제 데이터 추출
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) {
      return { success: false, error: "잘못된 이미지 형식입니다." }
    }

    const [, extension, base64] = matches
    const buffer = Buffer.from(base64, "base64")

    // 파일 크기 제한 (5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return { success: false, error: "파일 크기는 5MB 이하여야 합니다." }
    }

    // 파일명 생성 (userId/timestamp_random.extension)
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const finalFileName = fileName || `${userId}/${timestamp}_${random}.${extension}`

    // Supabase Storage에 업로드
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(finalFileName, buffer, {
        contentType: `image/${extension}`,
        upsert: false,
      })

    if (error) {
      console.error("Error uploading image:", error)
      // 버킷이 없는 경우 안내
      if (error.message.includes("Bucket not found")) {
        return { 
          success: false, 
          error: "Storage 버킷이 설정되지 않았습니다. Supabase Dashboard에서 'character-images' 버킷을 생성해주세요." 
        }
      }
      return { success: false, error: error.message }
    }

    // 공개 URL 가져오기
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path)

    return { success: true, url: publicUrlData.publicUrl }
  } catch (error) {
    console.error("Error in uploadCharacterImage:", error)
    return { success: false, error: "이미지 업로드 중 오류가 발생했습니다." }
  }
}

/**
 * 여러 이미지를 동시에 업로드합니다
 */
export async function uploadMultipleImages(
  images: { base64Data: string; index: number }[]
): Promise<{ success: boolean; urls: Record<number, string>; errors: Record<number, string> }> {
  const urls: Record<number, string> = {}
  const errors: Record<number, string> = {}

  // 병렬 업로드
  await Promise.all(
    images.map(async ({ base64Data, index }) => {
      if (!base64Data || !base64Data.startsWith("data:image/")) {
        // base64가 아닌 경우 (이미 URL인 경우) 그대로 사용
        if (base64Data && base64Data.startsWith("http")) {
          urls[index] = base64Data
        }
        return
      }

      const result = await uploadCharacterImage(base64Data)
      if (result.success && result.url) {
        urls[index] = result.url
      } else {
        errors[index] = result.error || "업로드 실패"
      }
    })
  )

  return {
    success: Object.keys(errors).length === 0,
    urls,
    errors,
  }
}

