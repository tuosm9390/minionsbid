# TODOS — Minions Bid

이 문서는 즉시 착수 가능한 작업 항목과 해결해야 할 기술 부채를 추적합니다.

---

## ✅ 완료된 주요 작업 (Recently Finished)

- [x] **SoldOverlay 최종 폴리싱**: 폭죽 파티클 및 텍스트 애니메이션 고도화.
- [x] **Accessibility**: `CenterTimer`, `BidStatus` ARIA Live Region 적용.
- [x] **Security**: 서버 사이드 입찰/낙찰 무결성 검증 완료.
- [x] **Optimization**: `findLast` 적용 및 타입 안전성 확보.

---

## 🏗️ 향후 개선 사항 (Backlog)

### [ ] Firebase Security Rules 강화
- **What**: Firestore/RTDB 보안 규칙을 최소 권한 원칙으로 정밀 조정.
- **Why**: 클라이언트 직접 접근 최소화.

### [ ] 사운드 효과 (Sound System)
- **What**: 입찰, 낙찰, 경매 시작 시 8-bit 스타일 효과음 추가.
- **Why**: 경매의 몰입감과 피드백 강화.

### [ ] 다크 모드 (Dark Mode)
- **What**: Cyber-Pixel 디자인 시스템의 다크 모드 변형 개발.
- **Why**: 저조도 환경 사용자 편의성 제공.
