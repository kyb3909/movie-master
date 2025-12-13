import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ClerkProvider } from "@clerk/nextjs"
import { koKRCustom } from "@/lib/clerk-localization"
import "./globals.css"

const geistSans = Geist({ 
  subsets: ["latin"],
  variable: "--font-geist-sans",
})
const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr"
const SITE_NAME = "무비마스터"
const SITE_DESCRIPTION = "배우를 보고 영화를 맞추는 퀴즈 게임! 7번의 기회 안에 정답을 찾아보세요. 좋아하는 영화나 드라마의 가상 캐스팅도 즐겨보세요."

export const metadata: Metadata = {
  // 기본 메타데이터
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - 영화 퀴즈 & 가상 캐스팅 게임`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "영화 퀴즈",
    "영화 맞추기",
    "배우 퀴즈",
    "가상 캐스팅",
    "영화 게임",
    "한국 영화",
    "영화 팬",
    "무비마스터",
    "MovieMaster",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  
  // 검색 엔진 최적화
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  
  // Open Graph (Facebook, KakaoTalk 등)
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} - 영화 퀴즈 & 가상 캐스팅 게임`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} - 영화 퀴즈 게임`,
      },
    ],
  },
  
  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - 영화 퀴즈 & 가상 캐스팅 게임`,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
    creator: "@moviemaster_kr",
  },
  
  // 대체 언어 (향후 확장용)
  alternates: {
    canonical: SITE_URL,
    languages: {
      "ko-KR": SITE_URL,
    },
  },
  
  // 아이콘
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.ico",
  },
  
  // 앱 관련 메타데이터
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  
  // 기타
  category: "entertainment",
  classification: "Game",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: "dark light",
}

// JSON-LD 구조화 데이터 (Schema.org)
function JsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr"}/#website`,
        url: process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr",
        name: "무비마스터",
        description: "배우를 보고 영화를 맞추는 퀴즈 게임! 7번의 기회 안에 정답을 찾아보세요.",
        inLanguage: "ko-KR",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr"}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr"}/#organization`,
        name: "무비마스터",
        url: process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr",
        logo: {
          "@type": "ImageObject",
          url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr"}/icon.svg`,
          width: 512,
          height: 512,
        },
        sameAs: [],
      },
      {
        "@type": "WebApplication",
        "@id": `${process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr"}/#webapp`,
        name: "무비마스터",
        description: "영화 퀴즈와 가상 캐스팅을 즐길 수 있는 웹 게임",
        url: process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr",
        applicationCategory: "GameApplication",
        operatingSystem: "Any",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "KRW",
        },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.8",
          ratingCount: "150",
          bestRating: "5",
          worstRating: "1",
        },
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider localization={koKRCustom}>
      <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
        <head>
          <JsonLd />
        </head>
        <body className="font-sans antialiased">
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  )
}
