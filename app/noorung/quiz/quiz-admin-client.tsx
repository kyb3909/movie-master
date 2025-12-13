"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Film, 
  ArrowLeft,
  X,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { 
  createQuiz, 
  updateQuiz, 
  deleteQuiz, 
  toggleQuizActive 
} from "@/lib/actions/quiz"
import type { QuizWithActors, QuizFormData } from "@/types/quiz.types"

interface QuizAdminClientProps {
  initialQuizzes: QuizWithActors[]
}

export function QuizAdminClient({ initialQuizzes }: QuizAdminClientProps) {
  const [quizzes, setQuizzes] = useState(initialQuizzes)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingQuiz, setEditingQuiz] = useState<QuizWithActors | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // 새 퀴즈 생성 폼
  const [newTitle, setNewTitle] = useState("")
  const [newActors, setNewActors] = useState<{ name: string; imageUrl: string }[]>([
    { name: "", imageUrl: "" },
  ])

  // 폼 리셋
  const resetForm = () => {
    setNewTitle("")
    setNewActors([{ name: "", imageUrl: "" }])
  }

  // 배우 추가
  const addActor = () => {
    if (newActors.length < 7) {
      setNewActors([...newActors, { name: "", imageUrl: "" }])
    }
  }

  // 배우 제거
  const removeActor = (index: number) => {
    if (newActors.length > 1) {
      setNewActors(newActors.filter((_, i) => i !== index))
    }
  }

  // 배우 정보 업데이트
  const updateActor = (index: number, field: "name" | "imageUrl", value: string) => {
    const updated = [...newActors]
    updated[index][field] = value
    setNewActors(updated)
  }

  // 퀴즈 생성
  const handleCreate = async () => {
    if (!newTitle.trim() || newActors.filter(a => a.name.trim()).length === 0) {
      alert("영화 제목과 최소 1명의 배우를 입력해주세요.")
      return
    }

    setIsLoading(true)
    const formData: QuizFormData = {
      title: newTitle.trim(),
      actors: newActors.filter(a => a.name.trim()),
    }

    const result = await createQuiz(formData)
    
    if (result.success) {
      setIsCreateOpen(false)
      resetForm()
      // 페이지 새로고침으로 데이터 갱신
      window.location.reload()
    } else {
      alert(result.error || "퀴즈 생성에 실패했습니다.")
    }
    setIsLoading(false)
  }

  // 퀴즈 수정 모달 열기
  const openEditModal = (quiz: QuizWithActors) => {
    setEditingQuiz(quiz)
    setNewTitle(quiz.title)
    setNewActors(
      quiz.actors.length > 0
        ? quiz.actors.map(a => ({ name: a.actor_name, imageUrl: a.actor_image_url || "" }))
        : [{ name: "", imageUrl: "" }]
    )
  }

  // 퀴즈 수정
  const handleUpdate = async () => {
    if (!editingQuiz || !newTitle.trim()) return

    setIsLoading(true)
    const formData: QuizFormData = {
      title: newTitle.trim(),
      actors: newActors.filter(a => a.name.trim()),
    }

    const result = await updateQuiz(editingQuiz.id, formData)
    
    if (result.success) {
      setEditingQuiz(null)
      resetForm()
      window.location.reload()
    } else {
      alert(result.error || "퀴즈 수정에 실패했습니다.")
    }
    setIsLoading(false)
  }

  // 퀴즈 삭제
  const handleDelete = async (quizId: string) => {
    if (!confirm("정말 이 퀴즈를 삭제하시겠습니까?")) return

    const result = await deleteQuiz(quizId)
    
    if (result.success) {
      setQuizzes(quizzes.filter(q => q.id !== quizId))
    } else {
      alert(result.error || "퀴즈 삭제에 실패했습니다.")
    }
  }

  // 퀴즈 활성화 토글
  const handleToggleActive = async (quizId: string, currentActive: boolean) => {
    const result = await toggleQuizActive(quizId, !currentActive)
    
    if (result.success) {
      setQuizzes(quizzes.map(q => 
        q.id === quizId ? { ...q, is_active: !currentActive } : q
      ))
    } else {
      alert(result.error || "상태 변경에 실패했습니다.")
    }
  }

  // 퀴즈 폼 UI
  const QuizForm = ({ onSubmit, submitText }: { onSubmit: () => void; submitText: string }) => (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium mb-2 block">영화 제목 (정답)</label>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="예: 기생충"
          className="text-lg"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">
          출연 배우 (힌트 순서대로, 최대 7명)
        </label>
        <div className="space-y-3">
          {newActors.map((actor, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex items-center justify-center w-8 h-10 text-sm font-bold text-muted-foreground">
                {index + 1}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  value={actor.name}
                  onChange={(e) => updateActor(index, "name", e.target.value)}
                  placeholder="배우 이름"
                />
                <Input
                  value={actor.imageUrl}
                  onChange={(e) => updateActor(index, "imageUrl", e.target.value)}
                  placeholder="이미지 URL (선택사항)"
                  className="text-sm"
                />
              </div>
              {newActors.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeActor(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {newActors.length < 7 && (
          <Button
            type="button"
            variant="outline"
            onClick={addActor}
            className="w-full mt-3"
          >
            <Plus className="w-4 h-4 mr-2" />
            배우 추가
          </Button>
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">취소</Button>
        </DialogClose>
        <Button onClick={onSubmit} disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {submitText}
        </Button>
      </DialogFooter>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/noorung">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Film className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold">퀴즈 관리</h1>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
            </div>
          </div>

          {/* 새 퀴즈 추가 버튼 */}
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open)
            if (!open) resetForm()
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                새 퀴즈 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>새 퀴즈 추가</DialogTitle>
              </DialogHeader>
              <QuizForm onSubmit={handleCreate} submitText="퀴즈 생성" />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>전체 퀴즈 목록</span>
              <Badge variant="secondary">{quizzes.length}개</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quizzes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Film className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>등록된 퀴즈가 없습니다.</p>
                <p className="text-sm mt-2">새 퀴즈를 추가해보세요!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>영화 제목</TableHead>
                    <TableHead>배우 수</TableHead>
                    <TableHead>플레이</TableHead>
                    <TableHead>정답률</TableHead>
                    <TableHead>활성화</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quizzes.map((quiz) => {
                    const correctRate = quiz.play_count > 0 
                      ? Math.round((quiz.correct_count / quiz.play_count) * 100) 
                      : 0
                    
                    return (
                      <TableRow key={quiz.id}>
                        <TableCell className="font-medium">{quiz.title}</TableCell>
                        <TableCell>{quiz.actors.length}명</TableCell>
                        <TableCell>{quiz.play_count}회</TableCell>
                        <TableCell>
                          <Badge variant={correctRate >= 50 ? "default" : "secondary"}>
                            {correctRate}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={quiz.is_active}
                            onCheckedChange={() => handleToggleActive(quiz.id, quiz.is_active)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {/* 수정 버튼 */}
                            <Dialog 
                              open={editingQuiz?.id === quiz.id} 
                              onOpenChange={(open) => {
                                if (!open) {
                                  setEditingQuiz(null)
                                  resetForm()
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => openEditModal(quiz)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>퀴즈 수정</DialogTitle>
                                </DialogHeader>
                                <QuizForm onSubmit={handleUpdate} submitText="저장" />
                              </DialogContent>
                            </Dialog>

                            {/* 삭제 버튼 */}
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDelete(quiz.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

