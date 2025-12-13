import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { checkIsAdmin } from "@/hooks/use-admin"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Film, Clapperboard, Users, ArrowLeft, Shield } from "lucide-react"

export default async function AdminPage() {
  const { userId } = await auth()

  // 로그인하지 않았거나 관리자가 아니면 홈으로 리다이렉트
  if (!userId || !checkIsAdmin(userId)) {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
              <span>홈으로</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              관리자 대시보드
            </h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">관리자 메뉴</h2>
            <p className="text-muted-foreground">관리할 항목을 선택하세요</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 퀴즈 관리 */}
            <Card className="hover:shadow-xl transition-all hover:-translate-y-1 border-2 hover:border-primary group">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Clapperboard className="w-6 h-6 text-primary" />
                  </div>
                  영화 퀴즈 관리
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  영화 퀴즈와 배우 정보를 등록, 수정, 삭제합니다.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 퀴즈 등록/수정/삭제</li>
                  <li>• 배우 정보 관리</li>
                  <li>• 퀴즈 활성화/비활성화</li>
                </ul>
                <Link href="/noorung/quiz">
                  <Button className="w-full">퀴즈 관리 바로가기</Button>
                </Link>
              </CardContent>
            </Card>

            {/* 캐스팅 관리 */}
            <Card className="hover:shadow-xl transition-all hover:-translate-y-1 border-2 hover:border-primary group">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  가상 캐스팅 관리
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  사용자가 제출한 캐스팅 프로젝트를 승인하거나 거부합니다.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 승인 대기 프로젝트 검토</li>
                  <li>• 프로젝트 승인/거부</li>
                  <li>• 전체 프로젝트 관리</li>
                </ul>
                <Link href="/noorung/casting">
                  <Button className="w-full">캐스팅 관리 바로가기</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

