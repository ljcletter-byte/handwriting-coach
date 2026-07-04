# ✍️ 12주 악필 교정 챌린저

> 매일 10분, 84일의 기적 — 누구나 쉽게 시작할 수 있는 손글씨 교정 웹 앱

![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-배포됨-2D6A4F)
![PWA](https://img.shields.io/badge/PWA-설치가능-40916C)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 🌐 바로 사용하기

**→ https://ljcletter-byte.github.io/handwriting-coach**

Google 계정으로 로그인하면 집·직장·스마트폰 어디서든 같은 기록을 볼 수 있습니다.
스마트폰에서는 "홈 화면에 추가"로 앱처럼 설치할 수 있어요.

---

## 📱 주요 기능

| 기능 | 설명 |
|------|------|
| 🏠 오늘의 미션 | 12주 × 7일 = 84일치 미션 자동 제공 |
| 🔍 이번 주 관찰 포인트 | 주차별 교정 주제(필압·균형·기울기 등)와 자가 점검 질문 |
| 🤲 준비 루틴 | 손 스트레칭 + 복식 호흡 애니메이션 |
| ⏱ 10분 타이머 + 스톱워치 | 타이머와 실제 연습 시간 동시 측정 |
| 📓 일지 & 자가 진단 | 사진 업로드 + AI 피드백 + 관찰 포인트 자가 진단(잘됨/보통/아쉬움) |
| 🤖 AI 코치 | 사진 업로드 시 Claude AI가 글씨를 분석해 피드백 |
| 📅 스탬프 캘린더 | 완료한 날 스탬프 + 날짜별 연습 시간 표시 |
| 🖼 사진 모아보기 | 연습 사진 갤러리 + 첫날/최근 Before & After 비교 |
| 🧘 자세 가이드 | 바른 자세·연필 잡는 법·손목 힘 빼는 법 |
| 📊 통계 대시보드 | 총 연습시간·스트릭·주차별 그래프·달성 배지 |
| 💾 백업 & 복원 | 기록을 JSON(복원용)·텍스트(읽기용)로 내보내기, 복원 |

---

## 🗂 화면 구성

하단 탭바로 이동합니다 (모바일 최적화).

- **🏠 오늘** — 준비 루틴, 오늘의 미션, 관찰 포인트, 타이머
- **📓 일지** — 사진 업로드, 자가 진단, AI 피드백, 저장
- **📅 스탬프** — 완료 캘린더 (날짜 클릭 시 그날 기록 상세)
- **📊 통계** — 연습 통계, 배지, 데이터 백업/복원
- **⋯ 더보기** — 연습 안내, 사진 모아보기, 자세 가이드

---

## 🛠 기술 구성

- **프론트엔드**: 순수 HTML / CSS / JavaScript (프레임워크 없음)
- **호스팅**: GitHub Pages (GitHub Actions 자동 배포)
- **인증**: Firebase Authentication (Google 로그인)
- **데이터 저장**: Cloud Firestore (사용자별 기록·사진·통계)
- **AI 피드백**: Anthropic Claude API (Cloudflare Worker 경유)
- **PWA**: manifest.json + Service Worker (홈 화면 추가, 오프라인 기본 지원)

---

## 📁 파일 구조

```
handwriting-coach/
├── index.html          # 앱 메인 (화면 구조 + 스타일 + Firebase 초기화)
├── css/
│   └── style.css       # 공통 스타일
├── js/
│   ├── missions.js     # 84일 미션 데이터, 준비 루틴, 명언, 연습 안내
│   └── app-firebase.js # 앱 로직 (인증·저장·타이머·통계·백업 등)
├── manifest.json       # PWA 설정
├── sw.js               # Service Worker (오프라인 캐싱)
├── icon-192.png        # 앱 아이콘
├── icon-512.png        # 앱 아이콘
└── .github/workflows/
    └── deploy.yml      # GitHub Pages 자동 배포
```

---

## 🔒 개인정보 & 데이터

- 로그인 정보와 연습 기록은 Firebase에 안전하게 저장되며, 각 사용자는 **자기 데이터에만** 접근할 수 있습니다.
- 연습 사진은 저장용으로 축소·압축되어 보관됩니다.
- 광고나 마케팅 목적으로 데이터를 사용하지 않습니다.
- 언제든 통계 탭에서 내 기록을 파일로 내려받아 백업할 수 있습니다.

---

## 📜 라이선스

MIT License

---

*이 프로젝트는 브라우저 UI만으로 만들어진 개인 학습·기록용 웹 앱입니다.*
