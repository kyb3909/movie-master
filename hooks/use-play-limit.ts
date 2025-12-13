"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"

const STORAGE_KEY = "moviemaster_play_count"
const DAILY_LIMIT = 2

interface PlayCountData {
  date: string
  quizCount: number
  castingCount: number
}

/**
 * 비로그인 사용자의 일일 플레이 제한을 관리하는 훅
 * - 로그인한 사용자: 무제한
 * - 비로그인 사용자: 게임당 1일 2회 제한
 */
export function usePlayLimit(gameType: "quiz" | "casting") {
  const { isSignedIn, isLoaded } = useAuth()
  const [playCount, setPlayCount] = useState(0)
  const [isLimitReached, setIsLimitReached] = useState(false)
  const [remainingPlays, setRemainingPlays] = useState(DAILY_LIMIT)

  // localStorage에서 플레이 횟수 로드
  const loadPlayCount = useCallback(() => {
    if (typeof window === "undefined") return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const today = new Date().toISOString().split("T")[0]

      if (stored) {
        const data: PlayCountData = JSON.parse(stored)
        
        // 날짜가 다르면 리셋
        if (data.date !== today) {
          const newData: PlayCountData = { date: today, quizCount: 0, castingCount: 0 }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newData))
          setPlayCount(0)
          setRemainingPlays(DAILY_LIMIT)
          setIsLimitReached(false)
        } else {
          const count = gameType === "quiz" ? data.quizCount : data.castingCount
          setPlayCount(count)
          setRemainingPlays(Math.max(0, DAILY_LIMIT - count))
          setIsLimitReached(count >= DAILY_LIMIT)
        }
      } else {
        const newData: PlayCountData = { date: today, quizCount: 0, castingCount: 0 }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newData))
        setPlayCount(0)
        setRemainingPlays(DAILY_LIMIT)
        setIsLimitReached(false)
      }
    } catch (error) {
      console.error("Error loading play count:", error)
    }
  }, [gameType])

  // 플레이 횟수 증가
  const incrementPlayCount = useCallback(() => {
    // 로그인한 사용자는 제한 없음
    if (isSignedIn) return true

    if (typeof window === "undefined") return false

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const today = new Date().toISOString().split("T")[0]
      
      let data: PlayCountData = stored 
        ? JSON.parse(stored) 
        : { date: today, quizCount: 0, castingCount: 0 }

      // 날짜가 다르면 리셋
      if (data.date !== today) {
        data = { date: today, quizCount: 0, castingCount: 0 }
      }

      const currentCount = gameType === "quiz" ? data.quizCount : data.castingCount
      
      if (currentCount >= DAILY_LIMIT) {
        setIsLimitReached(true)
        return false
      }

      // 횟수 증가
      if (gameType === "quiz") {
        data.quizCount += 1
      } else {
        data.castingCount += 1
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      
      const newCount = gameType === "quiz" ? data.quizCount : data.castingCount
      setPlayCount(newCount)
      setRemainingPlays(Math.max(0, DAILY_LIMIT - newCount))
      setIsLimitReached(newCount >= DAILY_LIMIT)

      return true
    } catch (error) {
      console.error("Error incrementing play count:", error)
      return true // 에러 시 플레이 허용
    }
  }, [gameType, isSignedIn])

  // 플레이 가능 여부 확인
  const canPlay = useCallback(() => {
    // 로그인한 사용자는 항상 가능
    if (isSignedIn) return true
    return !isLimitReached
  }, [isSignedIn, isLimitReached])

  // 초기 로드
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      loadPlayCount()
    } else if (isSignedIn) {
      // 로그인한 사용자는 제한 없음
      setIsLimitReached(false)
      setRemainingPlays(Infinity)
    }
  }, [isLoaded, isSignedIn, loadPlayCount])

  return {
    playCount,
    remainingPlays,
    isLimitReached,
    canPlay,
    incrementPlayCount,
    isSignedIn,
    isLoaded,
    dailyLimit: DAILY_LIMIT,
  }
}

