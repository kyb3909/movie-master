import type { MetadataRoute } from "next"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://moviemaster.kr"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/noorung/",      // 관리자 페이지 크롤링 방지
          "/api/",          // API 엔드포인트 크롤링 방지
          "/auth/",         // 인증 페이지 크롤링 방지
          "/_next/",        // Next.js 내부 경로
          "/private/",      // 비공개 경로
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/noorung/", "/api/", "/auth/"],
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/noorung/", "/api/", "/auth/"],
      },
      // 네이버 크롤러
      {
        userAgent: "Yeti",
        allow: "/",
        disallow: ["/noorung/", "/api/", "/auth/"],
      },
      // 다음 크롤러
      {
        userAgent: "Daum",
        allow: "/",
        disallow: ["/noorung/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}

