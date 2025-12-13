"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Film, Clapperboard, Users, Shield } from "lucide-react"
import VirtualCastingView from "@/components/virtual-casting-view"
import MovieQuiz from "@/components/movie-quiz"
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs"
import { useAdmin } from "@/hooks/use-admin"
import Link from "next/link"

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState<"main" | "quiz" | "casting">("main")
  const { isAdmin } = useAdmin()

  const handleLogoClick = () => {
    setCurrentTab("main")
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={handleLogoClick}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity group cursor-pointer"
            aria-label="메인 페이지로 이동"
          >
            <div className="relative">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center rotate-3 group-hover:rotate-6 transition-transform">
                <Film className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-chart-1 rounded-full animate-pulse" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-lg font-bold text-foreground leading-none">무비마스터</span>
              <span className="text-xs text-muted-foreground">MovieMaster</span>
            </div>
          </button>

          <div className="flex items-center gap-4">
            {currentTab !== "main" && (
              <nav className="flex gap-2">
                <Button
                  onClick={() => setCurrentTab("quiz")}
                  variant={currentTab === "quiz" ? "default" : "ghost"}
                  className="px-6"
                >
                  영화 퀴즈
                </Button>
                <Button
                  onClick={() => setCurrentTab("casting")}
                  variant={currentTab === "casting" ? "default" : "ghost"}
                  className="px-6"
                >
                  가상 캐스팅
                </Button>
              </nav>
            )}

            {/* Clerk 인증 버튼 */}
            <div className="flex items-center gap-2">
              <SignedOut>
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm">
                    로그인
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button variant="default" size="sm">
                    회원가입
                  </Button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                {/* 관리자 버튼 */}
                {isAdmin && (
                  <Link href="/noorung">
                    <Button variant="outline" size="sm" className="gap-1">
                      <Shield className="w-4 h-4" />
                      관리자
                    </Button>
                  </Link>
                )}
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-9 h-9",
                    },
                  }}
                />
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {currentTab === "main" ? (
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-foreground mb-4">환영합니다!</h1>
              <p className="text-lg text-muted-foreground">원하시는 게임을 선택해주세요</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* 영화 퀴즈 카드 */}
              <Card className="cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1 border-2 hover:border-primary group">
                <CardContent className="p-8">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Clapperboard className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">영화 퀴즈</h2>
                    <p className="text-muted-foreground mb-6">
                      배우 힌트를 보고 영화 제목을 맞춰보세요. 7번의 기회가 주어집니다!
                    </p>
                    <Button onClick={() => setCurrentTab("quiz")} size="lg" className="w-full">
                      게임 시작
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 가상 캐스팅 카드 */}
              <Card className="cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1 border-2 hover:border-primary group">
                <CardContent className="p-8">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Users className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">가상 캐스팅</h2>
                    <p className="text-muted-foreground mb-6">
                      원하는 캐릭터에 배우를 캐스팅하고 다른 사람들의 선택과 비교해보세요!
                    </p>
                    <Button onClick={() => setCurrentTab("casting")} size="lg" className="w-full">
                      게임 시작
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : currentTab === "quiz" ? (
          <MovieQuiz />
        ) : (
          <VirtualCastingView />
        )}
      </main>
    </div>
  )
}
