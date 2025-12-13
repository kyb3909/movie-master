import { koKR } from "@clerk/localizations"
import type { LocalizationResource } from "@clerk/types"

/**
 * Clerk 한국어 로컬라이제이션 설정
 * - 기본 koKR 로케일을 확장하여 커스텀 텍스트 추가
 * - 무비마스터 서비스에 맞는 문구로 변경
 */
export const koKRCustom: LocalizationResource = {
  ...koKR,
  
  // 공통 버튼 텍스트
  formButtonPrimary: "계속하기",
  
  // 로그인 관련
  signIn: {
    ...koKR.signIn,
    start: {
      ...koKR.signIn?.start,
      title: "로그인",
      subtitle: "무비마스터에 오신 것을 환영합니다",
      actionText: "계정이 없으신가요?",
      actionLink: "회원가입",
    },
    password: {
      ...koKR.signIn?.password,
      title: "비밀번호 입력",
      subtitle: "계정에 연결된 비밀번호를 입력하세요",
    },
    forgotPasswordAlternativeMethods: {
      ...koKR.signIn?.forgotPasswordAlternativeMethods,
      title: "비밀번호를 잊으셨나요?",
    },
  },
  
  // 회원가입 관련
  signUp: {
    ...koKR.signUp,
    start: {
      ...koKR.signUp?.start,
      title: "회원가입",
      subtitle: "무비마스터 계정을 만들어보세요",
      actionText: "이미 계정이 있으신가요?",
      actionLink: "로그인",
    },
  },
  
  // 사용자 버튼 관련
  userButton: {
    ...koKR.userButton,
    action__signOut: "로그아웃",
    action__manageAccount: "계정 관리",
    action__addAccount: "계정 추가",
  },
  
  // 사용자 프로필 관련
  userProfile: {
    ...koKR.userProfile,
    navbar: {
      ...koKR.userProfile?.navbar,
      account: "계정",
      security: "보안",
    },
    start: {
      ...koKR.userProfile?.start,
      headerTitle__account: "계정 정보",
      headerTitle__security: "보안 설정",
      profileSection: {
        ...koKR.userProfile?.start?.profileSection,
        title: "프로필",
      },
      usernameSection: {
        ...koKR.userProfile?.start?.usernameSection,
        title: "사용자 이름",
      },
      emailAddressesSection: {
        ...koKR.userProfile?.start?.emailAddressesSection,
        title: "이메일 주소",
      },
      connectedAccountsSection: {
        ...koKR.userProfile?.start?.connectedAccountsSection,
        title: "연결된 계정",
      },
    },
  },
  
  // 소셜 로그인 버튼
  socialButtonsBlockButton: "{{provider|titleize}}로 계속하기",
  socialButtonsBlockButtonManyInView: "{{provider|titleize}}",
  
  // 에러 메시지 커스터마이징
  unstable__errors: {
    form_identifier_not_found: "해당 계정을 찾을 수 없습니다. 이메일 주소를 확인해주세요.",
    form_password_incorrect: "비밀번호가 올바르지 않습니다. 다시 시도해주세요.",
    form_code_incorrect: "인증 코드가 올바르지 않습니다.",
    not_allowed_access: "접근 권한이 없습니다. 관리자에게 문의하세요.",
    form_identifier_exists: "이미 사용 중인 이메일입니다. 로그인을 시도해보세요.",
    form_password_pwned: "이 비밀번호는 보안에 취약합니다. 다른 비밀번호를 사용해주세요.",
    form_password_length_too_short: "비밀번호는 최소 8자 이상이어야 합니다.",
  },
  
  // 날짜/시간 관련
  dates: {
    ...koKR.dates,
    lastDay: "어제 {{date}}",
    previous6Days: "지난 {{weekday}} {{date}}",
    sameDay: "오늘 {{date}}",
  },
}

