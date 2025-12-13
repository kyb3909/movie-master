import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "무비마스터 - 영화 퀴즈 & 가상 캐스팅",
    short_name: "무비마스터",
    description: "배우를 보고 영화를 맞추는 퀴즈 게임! 7번의 기회 안에 정답을 찾아보세요. 좋아하는 영화나 드라마의 가상 캐스팅도 즐겨보세요.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#7c3aed",
    orientation: "portrait-primary",
    categories: ["games", "entertainment"],
    lang: "ko",
    dir: "ltr",
    icons: [
      {
        src: "/icon-light-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "apple touch icon",
      },
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/quiz-game.png",
        sizes: "1280x720",
        type: "image/png",
        label: "영화 퀴즈 게임 화면",
      },
      {
        src: "/screenshots/casting-game.png",
        sizes: "1280x720",
        type: "image/png",
        label: "가상 캐스팅 게임 화면",
      },
    ],
    shortcuts: [
      {
        name: "영화 퀴즈",
        short_name: "퀴즈",
        description: "배우를 보고 영화 제목 맞추기",
        url: "/?tab=quiz",
        icons: [{ src: "/icon.svg", sizes: "96x96" }],
      },
      {
        name: "가상 캐스팅",
        short_name: "캐스팅",
        description: "좋아하는 작품의 캐스팅 게임",
        url: "/?tab=casting",
        icons: [{ src: "/icon.svg", sizes: "96x96" }],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  }
}

