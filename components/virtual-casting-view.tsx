"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, X, Search, Film, Play, Trophy, Lock, Loader2 } from "lucide-react"
import Image from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import React from "react"
import { usePlayLimit } from "@/hooks/use-play-limit"
import { LoginPromptModal } from "@/components/login-prompt-modal"
import { ImageDropZone } from "@/components/image-drop-zone"
import { useAuth } from "@clerk/nextjs"
import {
  getApprovedProjects,
  getProjectWithCharacters,
  getTopCastings,
  getMyCastings,
  castActor,
  createProject,
} from "@/lib/actions/casting"
import { uploadMultipleImages } from "@/lib/actions/storage"
import { searchActors } from "@/lib/actions/quiz"
import type {
  CastingContentSummary,
  CastingContentWithCharacters,
  TopCastedActor,
  CastingCharacter,
} from "@/types/casting.types"
import { CONTENT_TYPE_LABELS } from "@/types/casting.types"

// 배우 타입 (quiz_actor 테이블 + 자유 입력)
type ActorOption = {
  id: string
  name: string
  image_url: string | null
  isCustom?: boolean
}

function VirtualCastingView() {
  const { userId } = useAuth()

  // 프로젝트 목록 상태
  const [projects, setProjects] = useState<CastingContentSummary[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [projectSearchTerm, setProjectSearchTerm] = useState("")

  // 선택된 프로젝트 상세
  const [selectedProject, setSelectedProject] = useState<CastingContentWithCharacters | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(false)

  // 캐스팅 상태
  const [myCastings, setMyCastings] = useState<Record<string, { actorName: string; actorImage: string | null }>>({})
  const [topCastings, setTopCastings] = useState<Record<string, TopCastedActor[]>>({})

  // 배우 검색
  const [actorSearchTerm, setActorSearchTerm] = useState("")
  const [actorOptions, setActorOptions] = useState<ActorOption[]>([])
  const [isSearchingActors, setIsSearchingActors] = useState(false)
  const [customActorName, setCustomActorName] = useState("")

  // 다이얼로그 상태
  const [isGameDialogOpen, setIsGameDialogOpen] = useState(false)
  const [isActorDialogOpen, setIsActorDialogOpen] = useState(false)
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"casting" | "ranking" | "gallery" | null>(null)

  // 프로젝트 생성
  const [newProjectTitle, setNewProjectTitle] = useState("")
  const [newProjectType, setNewProjectType] = useState<"movie" | "novel" | "webtoon" | "anime" | "manga" | "other">("other")
  const [newRoles, setNewRoles] = useState<{ name: string; image: string }[]>([{ name: "", image: "" }])
  const [isCreatingProject, setIsCreatingProject] = useState(false)

  const [activeTab, setActiveTab] = useState("projects")
  const [showLoginModal, setShowLoginModal] = useState(false)

  // 플레이 제한
  const {
    remainingPlays,
    isLimitReached,
    canPlay,
    incrementPlayCount,
    isSignedIn,
    dailyLimit,
  } = usePlayLimit("casting")

  // 프로젝트 목록 로드
  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    try {
      const data = await getApprovedProjects()
      setProjects(data)
    } catch (error) {
      console.error("Error loading projects:", error)
    }
    setIsLoadingProjects(false)
  }, [])

  // 프로젝트 상세 로드
  const loadProjectDetails = useCallback(async (projectId: string) => {
    setIsLoadingProject(true)
    try {
      const [projectData, myCastingsData, topCastingsData] = await Promise.all([
        getProjectWithCharacters(projectId),
        userId ? getMyCastings(projectId) : Promise.resolve({}),
        getTopCastings(projectId),
      ])

      if (projectData) {
        setSelectedProject(projectData)
        setMyCastings(myCastingsData)
        setTopCastings(topCastingsData)
      }
    } catch (error) {
      console.error("Error loading project details:", error)
    }
    setIsLoadingProject(false)
  }, [userId])

  // 배우 검색
  const handleSearchActors = useCallback(async (query: string) => {
    if (query.length < 1) {
      setActorOptions([])
      return
    }

    setIsSearchingActors(true)
    try {
      const actors = await searchActors(query)
      setActorOptions(actors.map(a => ({
        id: a.id,
        name: a.name,
        image_url: a.image_url,
      })))
    } catch (error) {
      console.error("Error searching actors:", error)
    }
    setIsSearchingActors(false)
  }, [])

  // 배우 캐스팅
  const handleCastActor = async (actor: ActorOption) => {
    if (!selectedCharacterId || !userId) return

    try {
      // 기존 배우든 커스텀 배우든 항상 이름과 이미지를 저장
      const result = await castActor({
        character_id: selectedCharacterId,
        actor_id: actor.isCustom ? undefined : actor.id,
        custom_actor_name: actor.name, // 항상 이름 저장
        custom_actor_image_url: actor.image_url || undefined, // 항상 이미지 저장
      })

      console.log("castActor result:", result) // 디버깅용

      if (result.success) {
        // 로컬 상태 업데이트
        setMyCastings(prev => ({
          ...prev,
          [selectedCharacterId]: {
            actorName: actor.name,
            actorImage: actor.image_url,
          }
        }))
      } else {
        console.error("castActor failed:", result.error)
        alert(result.error || "캐스팅 저장에 실패했습니다.")
      }
    } catch (error) {
      console.error("Error casting actor:", error)
      alert("캐스팅 중 오류가 발생했습니다.")
    }

    setIsActorDialogOpen(false)
    setSelectedCharacterId(null)
    setActorSearchTerm("")
    setActorOptions([])
    setCustomActorName("")
  }

  // 자유 입력 배우 추가
  const handleAddCustomActor = () => {
    if (!customActorName.trim()) return

    handleCastActor({
      id: "custom-" + Date.now(),
      name: customActorName.trim(),
      image_url: null,
      isCustom: true,
    })
  }

  // 캐스팅 완료 여부 확인
  const isCastingComplete = () => {
    if (!selectedProject) return false
    return selectedProject.characters.every(char => myCastings[char.id])
  }

  // 캐스팅 게시
  const handlePublishCasting = () => {
    if (!isSignedIn) {
      incrementPlayCount()
    }

    setIsPublishDialogOpen(false)
    setIsGameDialogOpen(false)
    setSelectedProjectId(null)
    setSelectedProject(null)
    setViewMode(null)
  }

  // 프로젝트 생성
  const handleCreateProject = async () => {
    if (!newProjectTitle.trim() || newRoles.filter(r => r.name.trim()).length === 0) return
    if (!userId) {
      setShowLoginModal(true)
      return
    }

    setIsCreatingProject(true)
    try {
      // 1. 이미지가 있는 캐릭터들의 이미지를 먼저 업로드
      const validRoles = newRoles.filter(r => r.name.trim())
      const imagesToUpload = validRoles
        .map((role, index) => ({ base64Data: role.image, index }))
        .filter(item => item.base64Data && item.base64Data.startsWith("data:image/"))

      let uploadedUrls: Record<number, string> = {}
      
      if (imagesToUpload.length > 0) {
        const uploadResult = await uploadMultipleImages(imagesToUpload)
        uploadedUrls = uploadResult.urls
        
        // 업로드 실패 경고 (하지만 계속 진행)
        if (!uploadResult.success) {
          console.warn("일부 이미지 업로드 실패:", uploadResult.errors)
        }
      }

      // 2. 프로젝트 생성
      const result = await createProject({
        title: newProjectTitle,
        type: newProjectType,
        characters: validRoles.map((r, index) => ({
          name: r.name,
          // 업로드된 URL이 있으면 사용, 없으면 원래 이미지 (URL인 경우)
          image_url: uploadedUrls[index] || 
            (r.image && r.image.startsWith("http") ? r.image : undefined),
        })),
      })

      if (result.success) {
        setNewProjectTitle("")
        setNewProjectType("other")
        setNewRoles([{ name: "", image: "" }])
        setActiveTab("projects")
        loadProjects()
        alert("프로젝트가 생성되었습니다. 관리자 승인 후 목록에 표시됩니다.")
      } else {
        alert(result.error || "프로젝트 생성 실패")
      }
    } catch (error) {
      console.error("Error creating project:", error)
      alert("프로젝트 생성 중 오류가 발생했습니다.")
    }
    setIsCreatingProject(false)
  }

  // 초기 로드
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // 프로젝트 선택 시 상세 로드
  useEffect(() => {
    if (selectedProjectId && isGameDialogOpen) {
      loadProjectDetails(selectedProjectId)
    }
  }, [selectedProjectId, isGameDialogOpen, loadProjectDetails])

  // 배우 검색 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearchActors(actorSearchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [actorSearchTerm, handleSearchActors])

  // 필터링된 프로젝트
  const filteredProjects = projects.filter(project =>
    project.title.toLowerCase().includes(projectSearchTerm.toLowerCase())
  )

  // 역할 추가/제거
  const handleAddRole = () => setNewRoles([...newRoles, { name: "", image: "" }])
  const handleRemoveRole = (index: number) => setNewRoles(newRoles.filter((_, i) => i !== index))
  const handleUpdateRole = (index: number, field: "name" | "image", value: string) => {
    const updated = [...newRoles]
    updated[index][field] = value
    setNewRoles(updated)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-card">
          <TabsTrigger
            value="projects"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-foreground"
          >
            프로젝트 목록
          </TabsTrigger>
          <TabsTrigger
            value="create"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-foreground"
          >
            내 프로젝트 만들기
          </TabsTrigger>
        </TabsList>

        {/* 프로젝트 목록 탭 */}
        <TabsContent value="projects" className="space-y-6 mt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type="text"
                placeholder="프로젝트 제목으로 검색하세요"
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
                className="h-12 text-base pr-4"
              />
            </div>
            <Button size="lg" className="px-8 h-12">
              검색
            </Button>
          </div>

          {isLoadingProjects ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">프로젝트 로딩 중...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <Film className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">등록된 프로젝트가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className="group hover:shadow-xl transition-all duration-300 overflow-hidden border-2 hover:border-primary/50 flex flex-col"
                >
                  <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Film className="w-12 h-12 text-primary/50" />
                  </div>

                  <CardContent className="p-4 space-y-3 flex flex-col flex-1">
                    <div className="min-h-[60px]">
                      <h3 className="font-bold text-lg line-clamp-1 mb-1 text-foreground">{project.title}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {CONTENT_TYPE_LABELS[project.type]}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {project.character_count}개 역할
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      {/* 게임 시작 버튼 */}
                      <Dialog
                        open={isGameDialogOpen && selectedProjectId === project.id}
                        onOpenChange={(open) => {
                          setIsGameDialogOpen(open)
                          if (!open) {
                            setSelectedProjectId(null)
                            setSelectedProject(null)
                            setViewMode(null)
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent"
                            onClick={(e) => {
                              if (!isSignedIn && !canPlay()) {
                                e.preventDefault()
                                setShowLoginModal(true)
                                return
                              }
                              setSelectedProjectId(project.id)
                              setViewMode("casting")
                              setIsGameDialogOpen(true)
                            }}
                          >
                            <Play className="w-4 h-4 mr-1" />
                            게임 시작하기
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh]">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-foreground">
                              <Film className="w-5 h-5" />
                              {project.title}
                            </DialogTitle>
                          </DialogHeader>

                          {isLoadingProject ? (
                            <div className="flex items-center justify-center py-12">
                              <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                          ) : selectedProject ? (
                            <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
                              <div className="space-y-6">
                                <h3 className="font-semibold text-xl text-foreground">내 캐스팅</h3>
                                <div className="space-y-4">
                                  {selectedProject.characters.map((character) => {
                                    const myCasting = myCastings[character.id]

                                    return (
                                      <div key={character.id} className="p-4 bg-accent/30 rounded-lg border">
                                        <div className="flex items-center justify-between gap-4">
                                          <div className="flex items-center gap-4">
                                            <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-border shrink-0 bg-muted">
                                              {character.image_url ? (
                                                <Image
                                                  src={character.image_url}
                                                  alt={character.name}
                                                  fill
                                                  className="object-cover"
                                                />
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                                                  {character.name[0]}
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                              <span className="font-bold text-foreground">{character.name}</span>
                                              <span className="text-xs text-muted-foreground">캐릭터</span>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-3">
                                            {myCasting ? (
                                              <div className="flex items-center gap-3 bg-background rounded-lg px-4 py-2 border-2">
                                                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted">
                                                  {myCasting.actorImage ? (
                                                    <Image
                                                      src={myCasting.actorImage}
                                                      alt={myCasting.actorName}
                                                      fill
                                                      className="object-cover"
                                                    />
                                                  ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                                                      {myCasting.actorName[0]}
                                                    </div>
                                                  )}
                                                </div>
                                                <span className="font-semibold text-foreground">
                                                  {myCasting.actorName}
                                                </span>
                                              </div>
                                            ) : (
                                              <span className="text-muted-foreground italic px-4">미캐스팅</span>
                                            )}

                                            {/* 배우 선택 다이얼로그 */}
                                            <Dialog open={isActorDialogOpen && selectedCharacterId === character.id} onOpenChange={setIsActorDialogOpen}>
                                              <DialogTrigger asChild>
                                                <Button
                                                  variant="default"
                                                  size="sm"
                                                  disabled={!isSignedIn}
                                                  onClick={() => {
                                                    if (!isSignedIn) {
                                                      setShowLoginModal(true)
                                                      return
                                                    }
                                                    setSelectedCharacterId(character.id)
                                                    setIsActorDialogOpen(true)
                                                  }}
                                                >
                                                  {myCasting ? "변경" : "선택"}
                                                </Button>
                                              </DialogTrigger>
                                              <DialogContent className="max-w-2xl max-h-[80vh]">
                                                <DialogHeader>
                                                  <DialogTitle className="text-foreground">
                                                    {character.name} 역할에 배우 캐스팅
                                                  </DialogTitle>
                                                </DialogHeader>

                                                <div className="space-y-4">
                                                  {/* 검색 */}
                                                  <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                    <Input
                                                      type="text"
                                                      placeholder="배우 이름 검색..."
                                                      value={actorSearchTerm}
                                                      onChange={(e) => setActorSearchTerm(e.target.value)}
                                                      className="pl-10"
                                                    />
                                                  </div>

                                                  {/* 직접 입력 */}
                                                  <div className="flex gap-2">
                                                    <Input
                                                      type="text"
                                                      placeholder="배우 이름 직접 입력"
                                                      value={customActorName}
                                                      onChange={(e) => setCustomActorName(e.target.value)}
                                                    />
                                                    <Button onClick={handleAddCustomActor} disabled={!customActorName.trim()}>
                                                      추가
                                                    </Button>
                                                  </div>

                                                  {/* 검색 결과 */}
                                                  <ScrollArea className="h-[350px] pr-4">
                                                    {isSearchingActors ? (
                                                      <div className="flex items-center justify-center py-8">
                                                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                                      </div>
                                                    ) : actorOptions.length > 0 ? (
                                                      <div className="grid grid-cols-3 gap-4">
                                                        {actorOptions.map((actor) => (
                                                          <button
                                                            key={actor.id}
                                                            onClick={() => handleCastActor(actor)}
                                                            className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-accent transition-colors border border-transparent hover:border-border"
                                                          >
                                                            <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 bg-muted">
                                                              {actor.image_url ? (
                                                                <Image
                                                                  src={actor.image_url}
                                                                  alt={actor.name}
                                                                  fill
                                                                  className="object-cover"
                                                                />
                                                              ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-lg">
                                                                  {actor.name[0]}
                                                                </div>
                                                              )}
                                                            </div>
                                                            <span className="text-sm font-medium text-center text-foreground">
                                                              {actor.name}
                                                            </span>
                                                          </button>
                                                        ))}
                                                      </div>
                                                    ) : actorSearchTerm ? (
                                                      <p className="text-center text-muted-foreground py-8">
                                                        검색 결과가 없습니다. 직접 입력해주세요.
                                                      </p>
                                                    ) : (
                                                      <p className="text-center text-muted-foreground py-8">
                                                        배우 이름을 검색하거나 직접 입력하세요.
                                                      </p>
                                                    )}
                                                  </ScrollArea>
                                                </div>
                                              </DialogContent>
                                            </Dialog>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                {/* 캐스팅 완료 버튼 */}
                                {isSignedIn && (
                                  <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
                                    <DialogTrigger asChild>
                                      <Button
                                        className="w-full mt-6"
                                        size="lg"
                                        disabled={!isCastingComplete()}
                                      >
                                        캐스팅 완료
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle className="text-foreground">캐스팅을 완료하시겠습니까?</DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <p className="text-muted-foreground">
                                          캐스팅이 저장되었습니다!
                                        </p>
                                        <div className="flex gap-2 justify-end">
                                          <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>
                                            계속 수정
                                          </Button>
                                          <Button onClick={handlePublishCasting}>완료</Button>
                                        </div>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                )}

                                {!isSignedIn && (
                                  <p className="text-center text-muted-foreground mt-4">
                                    로그인하면 캐스팅을 저장할 수 있습니다.
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                          ) : null}
                        </DialogContent>
                      </Dialog>

                      {/* 랭킹 보기 버튼 */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full bg-transparent"
                            onClick={() => {
                              setSelectedProjectId(project.id)
                              loadProjectDetails(project.id)
                            }}
                          >
                            <Trophy className="w-4 h-4 mr-1" />
                            랭킹보기
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh]">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-foreground">
                              <Trophy className="w-5 h-5" />
                              {project.title} - 인기 캐스팅 랭킹
                            </DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
                            {isLoadingProject ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                              </div>
                            ) : selectedProject ? (
                              <div className="space-y-6">
                                {selectedProject.characters.map((character) => {
                                  const topActors = topCastings[character.id] || []

                                  return (
                                    <div key={character.id} className="p-6 bg-accent/30 rounded-lg border">
                                      <div className="flex items-center gap-4 mb-4">
                                        <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-border bg-muted">
                                          {character.image_url ? (
                                            <Image
                                              src={character.image_url}
                                              alt={character.name}
                                              fill
                                              className="object-cover"
                                            />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                              {character.name[0]}
                                            </div>
                                          )}
                                        </div>
                                        <h4 className="font-bold text-lg text-foreground">{character.name}</h4>
                                      </div>

                                      {topActors.length > 0 ? (
                                        <div className="space-y-3">
                                          {topActors.map((actor, index) => (
                                            <div
                                              key={index}
                                              className="flex items-center gap-4 p-4 bg-background rounded-lg border-2"
                                            >
                                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
                                                {index === 0 && <Trophy className="w-5 h-5 text-yellow-500" />}
                                                {index === 1 && <Trophy className="w-5 h-5 text-gray-400" />}
                                                {index === 2 && <Trophy className="w-5 h-5 text-amber-600" />}
                                              </div>
                                              <span className="font-bold text-lg text-foreground w-8">{index + 1}위</span>
                                              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 bg-muted">
                                                {actor.actor_image ? (
                                                  <Image
                                                    src={actor.actor_image}
                                                    alt={actor.actor_name}
                                                    fill
                                                    className="object-cover"
                                                  />
                                                ) : (
                                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                                                    {actor.actor_name[0]}
                                                  </div>
                                                )}
                                              </div>
                                              <span className="font-semibold text-lg text-foreground flex-1">
                                                {actor.actor_name}
                                              </span>
                                              <span className="text-sm text-muted-foreground">{actor.vote_count}명</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-muted-foreground text-center py-4">
                                          아직 캐스팅된 배우가 없습니다.
                                        </p>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : null}
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 프로젝트 만들기 탭 */}
        <TabsContent value="create" className="mt-6">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-2xl text-slate-900">새 가상 캐스팅 프로젝트 만들기</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <label htmlFor="project-title" className="text-sm font-medium mb-2 block text-slate-900">
                    프로젝트 제목
                  </label>
                  <Input
                    id="project-title"
                    type="text"
                    placeholder="예: 슬램덩크 실사화"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    className="text-lg"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block text-slate-900">
                    콘텐츠 타입
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.entries(CONTENT_TYPE_LABELS) as [typeof newProjectType, string][]).map(([type, label]) => (
                      <Button
                        key={type}
                        variant={newProjectType === type ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNewProjectType(type)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block text-slate-900">
                    캐릭터/역할 (최대 20명)
                  </label>
                  <p className="text-xs text-muted-foreground mb-4">
                    이미지를 드래그하여 추가하거나 클릭하여 선택하세요. 오른쪽에 캐릭터 이름을 입력하세요.
                  </p>
                  <div className="space-y-3">
                    {newRoles.map((role, index) => (
                      <div 
                        key={index} 
                        className="flex items-center gap-4 p-3 bg-accent/30 rounded-lg border border-border/50 group hover:border-primary/30 transition-colors"
                      >
                        {/* 이미지 드래그 앤 드롭 영역 */}
                        <ImageDropZone
                          value={role.image}
                          onChange={(value) => handleUpdateRole(index, "image", value)}
                          size="md"
                          placeholder={role.name || `캐릭터 ${index + 1}`}
                        />

                        {/* 캐릭터 이름 입력 */}
                        <div className="flex-1">
                          <Input
                            type="text"
                            placeholder={`캐릭터 이름 (예: 강백호)`}
                            value={role.name}
                            onChange={(e) => handleUpdateRole(index, "name", e.target.value)}
                            className="text-base"
                          />
                        </div>

                        {/* 삭제 버튼 */}
                        {newRoles.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRemoveRole(index)}
                            className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {newRoles.length < 20 && (
                    <Button variant="outline" onClick={handleAddRole} className="w-full mt-4 bg-transparent border-dashed border-2 hover:border-primary hover:bg-primary/5">
                      <Plus className="w-4 h-4 mr-2" />
                      캐릭터 추가
                    </Button>
                  )}
                  <p className="text-sm text-muted-foreground mt-3 text-center">
                    {newRoles.filter(r => r.name.trim()).length}/20 캐릭터
                  </p>
                </div>

                <Button 
                  onClick={handleCreateProject} 
                  size="lg" 
                  className="w-full"
                  disabled={isCreatingProject || !newProjectTitle.trim() || newRoles.filter(r => r.name.trim()).length === 0}
                >
                  {isCreatingProject ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      생성 중...
                    </>
                  ) : (
                    "프로젝트 만들기"
                  )}
                </Button>

                <p className="text-sm text-muted-foreground text-center">
                  * 프로젝트는 관리자 승인 후 목록에 표시됩니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 남은 플레이 횟수 표시 */}
      {!isSignedIn && (
        <div className="fixed bottom-4 right-4 bg-card border shadow-lg rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">오늘 남은 무료 플레이:</span>
          <span className="font-bold text-foreground">{remainingPlays}/{dailyLimit}</span>
          {remainingPlays <= 0 && <Lock className="w-4 h-4 text-destructive" />}
        </div>
      )}

      {/* 로그인 유도 모달 */}
      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        remainingPlays={remainingPlays}
        gameType="casting"
      />
    </div>
  )
}

export default VirtualCastingView
