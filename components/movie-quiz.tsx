"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Film, Trophy, RotateCcw, Sparkles, Loader2, Lock } from "lucide-react"
import Image from "next/image"
import { getRandomQuiz, recordQuizResult } from "@/lib/actions/quiz"
import { useAuth } from "@clerk/nextjs"
import type { QuizForPlay } from "@/types/quiz.types"
import { usePlayLimit } from "@/hooks/use-play-limit"
import { LoginPromptModal } from "@/components/login-prompt-modal"

// 더미 데이터 (Supabase 연결 전 또는 에러 시 폴백)
const FALLBACK_QUIZ: QuizForPlay = {
  id: "fallback",
  title: "기생충",
  actors: [
    { name: "송강호", photo: "/placeholder.svg?height=80&width=80", order: 1 },
    { name: "이선균", photo: "/placeholder.svg?height=80&width=80", order: 2 },
    { name: "조여정", photo: "/placeholder.svg?height=80&width=80", order: 3 },
    { name: "최우식", photo: "/placeholder.svg?height=80&width=80", order: 4 },
    { name: "박소담", photo: "/placeholder.svg?height=80&width=80", order: 5 },
    { name: "이정은", photo: "/placeholder.svg?height=80&width=80", order: 6 },
    { name: "장혜진", photo: "/placeholder.svg?height=80&width=80", order: 7 },
  ],
}

export default function MovieQuiz() {
  const { userId } = useAuth()
  const [currentQuiz, setCurrentQuiz] = useState<QuizForPlay | null>(null)
  const [currentTurn, setCurrentTurn] = useState(1)
  const [userAnswer, setUserAnswer] = useState("")
  const [gameStatus, setGameStatus] = useState<"loading" | "playing" | "win" | "lose">("loading")
  const [isLoadingNewQuiz, setIsLoadingNewQuiz] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [hasCountedThisGame, setHasCountedThisGame] = useState(false)
  
  // 플레이 제한 훅
  const {
    remainingPlays,
    isLimitReached,
    canPlay,
    incrementPlayCount,
    isSignedIn,
    isLoaded: isAuthLoaded,
    dailyLimit,
  } = usePlayLimit("quiz")

  // 퀴즈 로드
  const loadQuiz = useCallback(async (isInitialLoad = false) => {
    // 인증 로딩 중이면 대기
    if (!isAuthLoaded) return
    
    // 플레이 제한 확인 (비로그인 사용자만)
    if (!isSignedIn && !canPlay()) {
      setShowLoginModal(true)
      return
    }

    setGameStatus("loading")
    try {
      const quiz = await getRandomQuiz()
      if (quiz && quiz.actors.length > 0) {
        setCurrentQuiz(quiz)
      } else {
        // Supabase에 데이터가 없으면 폴백 사용
        console.log("No quiz found in database, using fallback")
        setCurrentQuiz(FALLBACK_QUIZ)
      }
    } catch (error) {
      console.error("Error loading quiz:", error)
      setCurrentQuiz(FALLBACK_QUIZ)
    }
    setGameStatus("playing")
    setCurrentTurn(1)
    setUserAnswer("")
    setHasCountedThisGame(false)
  }, [isAuthLoaded, isSignedIn, canPlay])

  // 초기 로드
  useEffect(() => {
    if (isAuthLoaded) {
      loadQuiz(true)
    }
  }, [isAuthLoaded, loadQuiz])

  // 정답 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userAnswer.trim() || !currentQuiz) return

    const cleanAnswer = userAnswer.trim().replace(/\s/g, "").toLowerCase()
    const cleanTitle = currentQuiz.title.replace(/\s/g, "").toLowerCase()

    // 게임 종료 시 플레이 횟수 카운트 (한 게임당 1회만)
    const countPlay = () => {
      if (!hasCountedThisGame && !isSignedIn) {
        incrementPlayCount()
        setHasCountedThisGame(true)
      }
    }

    if (cleanAnswer === cleanTitle) {
      setGameStatus("win")
      countPlay()
      // 결과 기록 (폴백이 아닌 경우에만)
      if (currentQuiz.id !== "fallback") {
        await recordQuizResult(currentQuiz.id, true, currentTurn, userId)
      }
    } else {
      if (currentTurn >= 7) {
        setGameStatus("lose")
        countPlay()
        if (currentQuiz.id !== "fallback") {
          await recordQuizResult(currentQuiz.id, false, 7, userId)
        }
      } else {
        setCurrentTurn(currentTurn + 1)
        setUserAnswer("")
      }
    }
  }

  // 게임 재시작
  const handleRestart = async () => {
    // 플레이 제한 확인
    if (!isSignedIn && !canPlay()) {
      setShowLoginModal(true)
      return
    }
    
    setIsLoadingNewQuiz(true)
    await loadQuiz()
    setIsLoadingNewQuiz(false)
  }

  // 현재까지 공개된 배우 목록
  const revealedActors = currentQuiz?.actors.slice(0, currentTurn) || []

  // 인증 로딩 중
  if (!isAuthLoaded) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-xl border-2">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">로딩 중...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 비로그인 사용자가 제한에 도달한 경우 (게임 시작 전)
  if (!isSignedIn && isLimitReached && !currentQuiz) {
    return (
      <>
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-xl border-2">
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Lock className="w-10 h-10 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  오늘의 무료 플레이를 모두 사용했어요
                </h2>
                <p className="text-muted-foreground mb-6">
                  로그인하면 무제한으로 퀴즈를 즐길 수 있어요!
                </p>
                <Button onClick={() => setShowLoginModal(true)} size="lg">
                  로그인하고 계속하기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <LoginPromptModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          remainingPlays={remainingPlays}
          gameType="quiz"
        />
      </>
    )
  }

  // 로딩 상태
  if (gameStatus === "loading" || !currentQuiz) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-xl border-2">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">퀴즈를 불러오는 중...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <Badge variant="outline" className="text-2xl px-4 py-2 font-mono">
            퀴즈
          </Badge>
        </div>
        <p className="text-lg text-muted-foreground">배우를 보고 영화를 맞춰보세요!</p>
      </div>

      <Card className="shadow-xl border-2">
        <CardContent className="p-8">
          {gameStatus === "playing" ? (
            <>
              {/* 턴 표시 */}
              <div className="flex items-center justify-between mb-6">
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  힌트 {currentTurn} / 7
                </Badge>
                <div className="flex gap-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-all ${
                        i < currentTurn ? "bg-primary scale-110" : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* 배우 목록 */}
              <div className="mb-8">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  출연 배우
                </h2>
                <div className="space-y-3">
                  {revealedActors.map((actor, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-4 bg-accent/50 rounded-lg border border-border animate-in slide-in-from-left duration-500"
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm shrink-0">
                        {index + 1}
                      </div>
                      <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-border shrink-0">
                        <Image
                          src={actor.photo || "/placeholder.svg?height=80&width=80"}
                          alt={`${actor.name} 프로필`}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <span className="text-lg font-medium text-foreground">{actor.name}</span>
                      {index === revealedActors.length - 1 && index > 0 && (
                        <Sparkles className="w-5 h-5 ml-auto text-primary animate-pulse" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 입력 폼 */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="answer" className="sr-only">
                    영화 제목을 입력하세요
                  </label>
                  <Input
                    id="answer"
                    type="text"
                    placeholder="영화 제목을 입력하세요..."
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    className="text-lg py-6 text-center"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <Button type="submit" size="lg" className="w-full text-lg py-6">
                  정답 제출
                </Button>
              </form>

              {currentTurn > 1 && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  틀렸습니다! 다음 힌트를 확인하세요
                </p>
              )}
            </>
          ) : (
            /* 게임 종료 화면 */
            <div className="text-center py-8">
              {gameStatus === "win" ? (
                <>
                  <Trophy className="w-20 h-20 mx-auto mb-4 text-chart-1 animate-bounce" />
                  <h2 className="text-3xl font-bold text-chart-1 mb-2">정답입니다!</h2>
                  <p className="text-xl text-foreground mb-2">
                    영화: <span className="font-bold">{currentQuiz.title}</span>
                  </p>
                  <p className="text-muted-foreground mb-6">{currentTurn}번째 힌트에서 맞추셨습니다!</p>
                </>
              ) : (
                <>
                  <Film className="w-20 h-20 mx-auto mb-4 text-destructive opacity-50" />
                  <h2 className="text-3xl font-bold text-destructive mb-2">아쉽습니다</h2>
                  <p className="text-xl text-foreground mb-2">
                    정답은: <span className="font-bold">{currentQuiz.title}</span>
                  </p>
                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-3">전체 출연진:</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {currentQuiz.actors.map((actor, i) => (
                        <div key={i} className="flex items-center gap-2 bg-background rounded-full pr-3 border">
                          <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
                            <Image
                              src={actor.photo || "/placeholder.svg?height=80&width=80"}
                              alt={`${actor.name} 프로필`}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <span className="text-sm font-medium text-foreground">{actor.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Button 
                onClick={handleRestart} 
                size="lg" 
                className="mt-8 text-lg"
                disabled={isLoadingNewQuiz}
              >
                {isLoadingNewQuiz ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-5 h-5 mr-2" />
                )}
                다시 시작
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 남은 플레이 횟수 표시 (비로그인 사용자만) */}
      {!isSignedIn && (
        <p className="text-center text-sm text-muted-foreground mt-6">
          7번의 기회 안에 영화를 맞춰보세요! · 오늘 남은 무료 플레이: <strong className="text-foreground">{remainingPlays}/{dailyLimit}</strong>
        </p>
      )}
      {isSignedIn && (
        <p className="text-center text-sm text-muted-foreground mt-6">7번의 기회 안에 영화를 맞춰보세요!</p>
      )}

      {/* 로그인 유도 모달 */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        remainingPlays={remainingPlays}
        gameType="quiz"
      />
    </div>
  )
}

