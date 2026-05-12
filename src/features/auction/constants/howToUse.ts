// 경매 이용 방법 단계와 3D 안내 아이콘 매핑
import type { ThreeDIconName } from "@/components/ui/ThreeDIcon";

export interface HowToUseStep {
  step: string;
  iconName: ThreeDIconName;
  iconAlt: string;
  title: string;
  desc: string;
}

export const HOW_TO_USE_STEPS: HowToUseStep[] = [
  {
    step: "01",
    iconName: "door",
    iconAlt: "경매방 만들기",
    title: "경매방 만들기",
    desc: "팀 수, 인원, 포인트를 설정하고 팀장과 선수를 등록해 방을 생성합니다.",
  },
  {
    step: "02",
    iconName: "link",
    iconAlt: "링크 공유",
    title: "링크 공유",
    desc: "생성된 팀장별 링크를 각 팀장에게 공유합니다. 관전자 링크도 배포 가능합니다.",
  },
  {
    step: "03",
    iconName: "checkMarkButton",
    iconAlt: "접속 확인",
    title: "접속 확인",
    desc: "경매 화면에서 팀장들의 실시간 접속 여부를 확인하고 경매를 시작하세요.",
  },
  {
    step: "04",
    iconName: "moneyBag",
    iconAlt: "경매 진행",
    title: "경매 진행",
    desc: "주최자가 선수를 추첨하면 각 팀장이 포인트로 입찰합니다. 최고 입찰 시 낙찰!",
  },
  {
    step: "05",
    iconName: "crown",
    iconAlt: "팀 확정",
    title: "팀 확정",
    desc: "모든 선수가 낙찰되면 최종 팀 구성과 사용 포인트가 확정됩니다.",
  },
];
