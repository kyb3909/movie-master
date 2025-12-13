"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, X, ImageIcon } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface ImageDropZoneProps {
  value?: string
  onChange: (value: string) => void
  onFileSelect?: (file: File) => void
  className?: string
  size?: "sm" | "md" | "lg"
  placeholder?: string
}

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-20 h-20",
  lg: "w-24 h-24",
}

export function ImageDropZone({
  value,
  onChange,
  onFileSelect,
  className,
  size = "md",
  placeholder = "이미지",
}: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.")
      return
    }

    // 5MB 제한
    if (file.size > 5 * 1024 * 1024) {
      alert("파일 크기는 5MB 이하여야 합니다.")
      return
    }

    setIsLoading(true)

    // FileReader로 미리보기 URL 생성
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      onChange(dataUrl)
      onFileSelect?.(file)
      setIsLoading(false)
    }
    reader.onerror = () => {
      alert("파일을 읽는 중 오류가 발생했습니다.")
      setIsLoading(false)
    }
    reader.readAsDataURL(file)
  }, [onChange, onFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }, [handleFile])

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
    // 같은 파일 다시 선택 가능하도록 초기화
    e.target.value = ""
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
  }

  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 border-2",
        sizeClasses[size],
        isDragging
          ? "border-primary bg-primary/10 scale-105"
          : value
            ? "border-border bg-muted"
            : "border-dashed border-muted-foreground/30 bg-muted/50 hover:border-primary/50 hover:bg-muted",
        isLoading && "opacity-50 pointer-events-none",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {value ? (
        <>
          <Image
            src={value}
            alt={placeholder}
            fill
            className="object-cover"
          />
          {/* 삭제 버튼 */}
          <button
            onClick={handleRemove}
            className="absolute top-0 right-0 p-1 bg-destructive text-destructive-foreground rounded-bl-lg opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
            style={{ opacity: 1 }}
          >
            <X className="w-3 h-3" />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          {isDragging ? (
            <ImageIcon className="w-6 h-6 text-primary animate-pulse" />
          ) : (
            <Upload className="w-5 h-5 text-muted-foreground" />
          )}
          {size !== "sm" && (
            <span className="text-[10px] text-muted-foreground text-center px-1">
              {isDragging ? "놓기" : "드래그"}
            </span>
          )}
        </div>
      )}

      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

