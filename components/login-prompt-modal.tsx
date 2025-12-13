"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SignInButton, SignUpButton } from "@clerk/nextjs"
import { Lock, Sparkles, Infinity } from "lucide-react"

interface LoginPromptModalProps {
  isOpen: boolean
  onClose: () => void
  remainingPlays?: number
  gameType: "quiz" | "casting"
}

export function LoginPromptModal({
  isOpen,
  onClose,
  remainingPlays = 0,
  gameType,
}: LoginPromptModalProps) {
  const gameTitle = gameType === "quiz" ? "영화 퀴즈" : "가상 캐스팅"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl text-center">
            오늘의 무료 플레이를 모두 사용했어요
          </DialogTitle>
          <DialogDescription className="text-center text-base mt-2">
            {gameTitle} 게임을 더 즐기려면 로그인해 주세요!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* 혜택 안내 */}
          <div className="bg-accent/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              로그인 시 혜택
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Infinity className="w-4 h-4 text-chart-1" />
                <span><strong className="text-foreground">무제한</strong> 게임 플레이</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 h-4 flex items-center justify-center text-chart-2">📊</span>
                <span>게임 기록 저장 및 통계 확인</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 h-4 flex items-center justify-center text-chart-3">🎬</span>
                <span>나만의 캐스팅 프로젝트 관리</span>
              </li>
            </ul>
          </div>

          {/* 현재 상태 */}
          <div className="text-center text-sm text-muted-foreground">
            <p>
              비로그인 시 각 게임당 <strong className="text-foreground">1일 2회</strong>만 플레이 가능
            </p>
            {remainingPlays <= 0 && (
              <p className="text-destructive mt-1">
                내일 다시 무료 플레이가 충전됩니다!
              </p>
            )}
          </div>

          {/* 버튼 */}
          <div className="flex flex-col gap-2 pt-2">
            <SignInButton mode="modal">
              <Button size="lg" className="w-full text-lg">
                로그인
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="outline" size="lg" className="w-full">
                회원가입
              </Button>
            </SignUpButton>
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="text-muted-foreground"
            >
              나중에 하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

