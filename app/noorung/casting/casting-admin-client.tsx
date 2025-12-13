"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Check,
  X,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Film,
  Users,
  ArrowLeft,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { approveProject, rejectProject } from "@/lib/actions/casting"
import { useRouter } from "next/navigation"
import type { PendingCastingContent, CastingContentSummary } from "@/types/casting.types"
import { CONTENT_TYPE_LABELS } from "@/types/casting.types"

interface CastingAdminClientProps {
  initialPendingProjects: PendingCastingContent[]
  initialAllProjects: CastingContentSummary[]
}

export function CastingAdminClient({
  initialPendingProjects,
  initialAllProjects,
}: CastingAdminClientProps) {
  const router = useRouter()
  const [pendingProjects, setPendingProjects] = useState(initialPendingProjects)
  const [allProjects, setAllProjects] = useState(initialAllProjects)
  const [selectedProject, setSelectedProject] = useState<PendingCastingContent | null>(null)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  // 승인 처리
  const handleApprove = async (projectId: string) => {
    setIsProcessing(true)
    const result = await approveProject(projectId)

    if (result.success) {
      setPendingProjects((prev) => prev.filter((p) => p.id !== projectId))
      setAllProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, is_approved: true } : p))
      )
      setSelectedProject(null)
      router.refresh()
    } else {
      alert(result.error || "승인 처리 중 오류가 발생했습니다.")
    }
    setIsProcessing(false)
  }

  // 거부 처리
  const handleReject = async () => {
    if (!selectedProject || !rejectReason.trim()) return

    setIsProcessing(true)
    const result = await rejectProject(selectedProject.id, rejectReason)

    if (result.success) {
      setPendingProjects((prev) => prev.filter((p) => p.id !== selectedProject.id))
      setIsRejectDialogOpen(false)
      setSelectedProject(null)
      setRejectReason("")
      router.refresh()
    } else {
      alert(result.error || "거부 처리 중 오류가 발생했습니다.")
    }
    setIsProcessing(false)
  }

  // 검색 필터링
  const filteredAllProjects = allProjects.filter((p) =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/noorung" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
              <span>관리자 홈</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Film className="w-5 h-5" />
              가상 캐스팅 관리
            </h1>
          </div>
          <Link href="/noorung/quiz">
            <Button variant="outline">퀴즈 관리</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              승인 대기
              {pendingProjects.length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {pendingProjects.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Film className="w-4 h-4" />
              전체 프로젝트
            </TabsTrigger>
          </TabsList>

          {/* 승인 대기 탭 */}
          <TabsContent value="pending" className="space-y-4">
            {pendingProjects.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-chart-1 opacity-50" />
                  <p className="text-muted-foreground">승인 대기 중인 프로젝트가 없습니다.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pendingProjects.map((project) => (
                  <Card key={project.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg line-clamp-1">{project.title}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {CONTENT_TYPE_LABELS[project.type]} · {project.characters.length}개 캐릭터
                          </p>
                        </div>
                        <Badge variant="outline">대기중</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* 캐릭터 미리보기 */}
                      <div className="flex flex-wrap gap-2">
                        {project.characters.slice(0, 5).map((char) => (
                          <div
                            key={char.id}
                            className="flex items-center gap-1 bg-accent/50 rounded-full px-2 py-1"
                          >
                            {char.image_url && (
                              <div className="relative w-5 h-5 rounded-full overflow-hidden">
                                <Image
                                  src={char.image_url}
                                  alt={char.name}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            )}
                            <span className="text-xs">{char.name}</span>
                          </div>
                        ))}
                        {project.characters.length > 5 && (
                          <span className="text-xs text-muted-foreground px-2 py-1">
                            +{project.characters.length - 5}
                          </span>
                        )}
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setSelectedProject(project)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          상세
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleApprove(project.id)}
                          disabled={isProcessing}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          승인
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedProject(project)
                            setIsRejectDialogOpen(true)
                          }}
                          disabled={isProcessing}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        생성일: {new Date(project.created_at).toLocaleDateString("ko-KR")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 전체 프로젝트 탭 */}
          <TabsContent value="all" className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="프로젝트 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredAllProjects.map((project) => (
                <Card key={project.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base line-clamp-1">{project.title}</CardTitle>
                      <Badge variant={project.is_approved ? "default" : "secondary"}>
                        {project.is_approved ? "승인됨" : "미승인"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {project.character_count}명
                      </span>
                      <span>{CONTENT_TYPE_LABELS[project.type]}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(project.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={!!selectedProject && !isRejectDialogOpen} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          {selectedProject && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Film className="w-5 h-5" />
                  {selectedProject.title}
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4">
                  <div className="flex gap-4 text-sm">
                    <Badge variant="outline">{CONTENT_TYPE_LABELS[selectedProject.type]}</Badge>
                    <span className="text-muted-foreground">
                      {selectedProject.characters.length}개 캐릭터
                    </span>
                  </div>

                  {selectedProject.description && (
                    <p className="text-muted-foreground">{selectedProject.description}</p>
                  )}

                  <div className="space-y-3">
                    <h4 className="font-semibold">캐릭터 목록</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedProject.characters.map((char, index) => (
                        <div
                          key={char.id}
                          className="flex items-center gap-3 p-3 bg-accent/30 rounded-lg border"
                        >
                          <span className="text-sm font-bold text-muted-foreground w-6">
                            {index + 1}
                          </span>
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden border shrink-0">
                            <Image
                              src={char.image_url || "/placeholder.svg"}
                              alt={char.name}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <span className="font-medium text-sm">{char.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSelectedProject(null)}>
                  닫기
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setIsRejectDialogOpen(true)}
                  disabled={isProcessing}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  거부
                </Button>
                <Button
                  onClick={() => handleApprove(selectedProject.id)}
                  disabled={isProcessing}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  승인
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 거부 사유 입력 다이얼로그 */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              프로젝트 거부
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              거부 사유를 입력해주세요. 사용자에게 안내됩니다.
            </p>
            <Textarea
              placeholder="거부 사유를 입력하세요..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectDialogOpen(false)
                setRejectReason("")
              }}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || isProcessing}
            >
              거부하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
