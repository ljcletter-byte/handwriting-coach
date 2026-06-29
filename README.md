# ✍️ 12주 악필 교정 챌린저

> 매일 10분, 84일의 기적 — 누구나 쉽게 시작할 수 있는 손글씨 교정 웹 앱

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-배포됨-2D6A4F?style=flat-square&logo=github)](https://your-username.github.io/handwriting-coach)
![HTML](https://img.shields.io/badge/HTML-순수%20정적-orange?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## 🌐 바로 사용하기

**→ [https://your-username.github.io/handwriting-coach](https://your-username.github.io/handwriting-coach)**

> `your-username` 을 본인의 GitHub 아이디로 바꿔주세요.

---

## 📱 주요 기능

| 기능 | 설명 |
|------|------|
| **📋 오늘의 미션** | 12주 × 7일 = 84일치 미션 자동 제공 |
| **🤲 준비 루틴** | 손 스트레칭 + 복식 호흡 애니메이션 |
| **📄 연습 안내** | A4 용지로 할 연습을 단계별로 안내 |
| **⏱ 10분 타이머** | 시작/일시정지/초기화 + 완료 알림음 |
| **🤖 AI 코치** | 사진 업로드 시 Claude AI 글씨 분석 & 피드백 |
| **📓 일지 기록** | 오늘의 불규칙 부분 메모 + AI 피드백 저장 |
| **📅 스탬프 캘린더** | 완료일 도장 + 진행률 시각화 |
| **💾 데이터 유지** | localStorage — 새로고침해도 기록 보존 |

---

## 🗂️ 파일 구조

```
handwriting-coach/
├── index.html              # 메인 앱 (단일 페이지)
├── css/
│   └── style.css           # 전체 스타일
├── js/
│   ├── missions.js         # 84일 미션 데이터 + 워크시트 안내
│   └── app.js              # 앱 로직 (타이머, 캘린더, AI, 저널)
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages 자동 배포
└── README.md
```

---

## 🚀 GitHub에 올리고 배포하기

### 1단계 — 저장소 만들기

1. [github.com](https://github.com) 로그인
2. 우상단 **`+`** → **New repository**
3. Repository name: `handwriting-coach`
4. **Public** 선택 (Pages 무료 배포를 위해)
5. **Create repository** 클릭

### 2단계 — 파일 업로드

#### 방법 A: 웹에서 직접 업로드 (가장 쉬움)

```
저장소 페이지 → Add file → Upload files
→ 모든 파일을 드래그 앤 드롭
→ Commit changes
```

> ⚠️ `.github/workflows/deploy.yml` 도 반드시 포함해야 합니다.

#### 방법 B: Git 명령어 (개발자용)

```bash
git clone https://github.com/your-username/handwriting-coach.git
# 파일들을 복사한 후:
git add .
git commit -m "🚀 Initial commit: 12주 악필 교정 챌린저"
git push origin main
```

### 3단계 — GitHub Pages 활성화

1. 저장소 → **Settings** 탭
2. 왼쪽 메뉴 → **Pages**
3. Source: **GitHub Actions** 선택
4. 저장 후 약 1~2분 대기
5. `https://your-username.github.io/handwriting-coach` 접속!

---

## 📋 12주 커리큘럼

| 주차 | 주제 | 핵심 훈련 |
|------|------|-----------|
| 1주 | 선긋기 & 기초 획 | 직선, 곡선, 압력 조절 |
| 2주 | 자음 & 모음 균형 | 자모 비율, 복합 모음 |
| 3주 | 받침 & 글자 구조 | 단자음·겹받침 균형 |
| 4주 | 크기 & 간격 통일 | 기준선, 글자·단어 간격 |
| 5주 | 기울기 & 중심축 교정 | 수직·수평 정렬 |
| 6주 | 획의 강약 & 속도 | 필압 리듬, 속도 조절 |
| 7주 | 숫자 & 영문 혼용 | 한·영·숫 혼용 균형 |
| 8주 | 빠른 필기 & 흘림체 | 연결·흘림 필기 |
| 9주 | 문단 쓰기 & 줄 정렬 | 들여쓰기, 정렬 방식 |
| 10주 | 개성 & 스타일 발전 | 나만의 글씨체 탐색 |
| 11주 | 실전 활용 & 응용 | 편지·메모·주소 쓰기 |
| 12주 | 마스터 & 완성 | 전체 복습 + 졸업 작품 |

---

## 🖊️ 연습 방법

1. **A4 용지**와 **연필 또는 0.5~0.7mm 볼펜**을 준비합니다
2. 앱에서 **준비 루틴** → 손 스트레칭과 복식 호흡을 합니다
3. **연습 안내** 탭을 열고 단계별 지시에 따라 A4 용지에 씁니다
4. **10분 타이머**를 켜고 집중해서 연습합니다
5. 연습이 끝나면 **일지**에 사진을 올려 AI 피드백을 받습니다
6. **저장 & 스탬프**로 오늘 완료를 기록합니다

> 💡 인쇄가 필요하면 `연습 안내` 탭에서 브라우저 인쇄(Ctrl+P)를 사용하세요.

---

## ⚙️ 기술 스택

- **순수 HTML/CSS/JavaScript** — 빌드 도구 없음
- **localStorage** — 서버 없이 데이터 영구 저장
- **Claude API** (Anthropic) — AI 글씨 분석 피드백
- **GitHub Pages** — 무료 정적 호스팅
- **GitHub Actions** — main 브랜치 push 시 자동 배포

---

## 🔧 커스터마이즈

### 시작 날짜 변경
`localStorage`의 `hwr_coach_v1` 키를 삭제하면 오늘부터 새로 시작합니다.

### 미션 내용 수정
`js/missions.js` 의 `WEEKS` 객체를 편집하세요.

### 색상 변경
`css/style.css` 상단의 `:root` CSS 변수를 수정하세요.

---

## 📄 라이선스

MIT License — 자유롭게 사용, 수정, 배포 가능합니다.

---

<div align="center">
  <strong>매일 10분씩 꾸준히 — 84일 후 달라진 글씨를 만나보세요 ✍️</strong>
</div>
