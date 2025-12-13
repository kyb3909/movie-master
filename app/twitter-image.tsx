import { ImageResponse } from "next/og"

export const runtime = "edge"

export const alt = "무비마스터 - 영화 퀴즈 & 가상 캐스팅 게임"
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 배경 장식 요소 */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            background: "radial-gradient(circle, rgba(124, 58, 237, 0.3) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-150px",
            left: "-150px",
            width: "500px",
            height: "500px",
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        
        {/* 필름 스트립 아이콘 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "120px",
            height: "120px",
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            borderRadius: "24px",
            marginBottom: "32px",
            boxShadow: "0 20px 60px rgba(124, 58, 237, 0.4)",
            transform: "rotate(3deg)",
          }}
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="17" x2="22" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
          </svg>
        </div>

        {/* 타이틀 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <h1
            style={{
              fontSize: "72px",
              fontWeight: "800",
              color: "white",
              margin: 0,
              letterSpacing: "-2px",
              textShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            무비마스터
          </h1>
          <p
            style={{
              fontSize: "28px",
              color: "rgba(255,255,255,0.8)",
              margin: 0,
              letterSpacing: "2px",
            }}
          >
            MovieMaster
          </p>
        </div>

        {/* 설명 */}
        <p
          style={{
            fontSize: "28px",
            color: "rgba(255,255,255,0.7)",
            marginTop: "32px",
            textAlign: "center",
            maxWidth: "800px",
            lineHeight: 1.5,
          }}
        >
          🎬 배우를 보고 영화를 맞춰보세요!
        </p>

        {/* 게임 태그 */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: "40px",
          }}
        >
          <div
            style={{
              padding: "12px 24px",
              background: "rgba(124, 58, 237, 0.3)",
              borderRadius: "100px",
              border: "1px solid rgba(124, 58, 237, 0.5)",
              color: "white",
              fontSize: "20px",
              fontWeight: "600",
            }}
          >
            🎯 영화 퀴즈
          </div>
          <div
            style={{
              padding: "12px 24px",
              background: "rgba(168, 85, 247, 0.3)",
              borderRadius: "100px",
              border: "1px solid rgba(168, 85, 247, 0.5)",
              color: "white",
              fontSize: "20px",
              fontWeight: "600",
            }}
          >
            🎭 가상 캐스팅
          </div>
        </div>

        {/* 하단 URL */}
        <p
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.5)",
            margin: 0,
          }}
        >
          moviemaster.kr
        </p>
      </div>
    ),
    {
      ...size,
    }
  )
}

