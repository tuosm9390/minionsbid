"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/ui/CyberIcons";

type LegalDocumentType = "terms" | "privacy";
type LegalLanguage = "ko" | "en";

interface LegalInfoModalProps {
  isOpen: boolean;
  documentType: LegalDocumentType;
  onClose: () => void;
}

interface LegalSection {
  title: string;
  body: string[];
}

const CONTACT_EMAIL = "tuosm123@gmail.com";
const PRODUCT_URL = "https://minionsbid.vercel.app";
const EFFECTIVE_DATE = "2026-04-23";

const LEGAL_COPY: Record<
  LegalDocumentType,
  Record<
    LegalLanguage,
    {
      title: string;
      effectiveDateLabel: string;
      sections: LegalSection[];
    }
  >
> = {
  terms: {
    ko: {
      title: "이용약관",
      effectiveDateLabel: `시행일: ${EFFECTIVE_DATE}`,
      sections: [
        {
          title: "1. 서비스 개요",
          body: [
            "Minions Bid는 리그 오브 레전드 커뮤니티 리그 및 토너먼트를 운영하기 위한 웹 기반 도구입니다.",
            "본 서비스는 팀 관리, 로스터 관리, 경기 일정 관리, 경기 결과 기록 및 관련 운영 기능을 제공합니다.",
          ],
        },
        {
          title: "2. 이용 자격",
          body: [
            "귀하는 귀하가 속한 관할 지역의 법률에 따라 본 서비스를 이용할 수 있는 자격이 있어야 합니다.",
            "팀, 커뮤니티 또는 단체를 대표하여 서비스를 이용하는 경우 해당 단체를 대신하여 본 약관에 동의할 권한이 있음을 보증합니다.",
          ],
        },
        {
          title: "3. 금지 행위",
          body: [
            "관련 법령 또는 규정을 위반하는 행위",
            "Riot Games 또는 제3자의 권리를 침해하는 행위",
            "서비스의 정상적인 운영을 방해하거나 승인되지 않은 접근을 시도하는 행위",
            "치트, 게임플레이 자동화, 부정행위 또는 불공정한 경쟁 우위를 위한 목적으로 서비스를 이용하는 행위",
          ],
        },
        {
          title: "4. Riot Games와의 관계",
          body: [
            "Minions Bid는 Riot Games, Inc.의 후원, 보증 또는 공식 제휴를 받지 않는 독립적인 서비스입니다.",
            "Riot Games, League of Legends 및 관련 상표와 게임 자산은 Riot Games, Inc.의 자산입니다.",
            "Riot API를 통해 제공되는 데이터의 이용은 Riot Games의 개발자 정책 및 관련 약관을 따릅니다.",
          ],
        },
        {
          title: "5. 사용자 제공 콘텐츠",
          body: [
            "귀하는 팀명, 플레이어명, 경기 일정, 경기 결과, 비고 등 다양한 정보를 서비스에 입력할 수 있습니다.",
            "귀하는 귀하가 입력한 콘텐츠에 대한 책임을 지며, 해당 콘텐츠를 입력할 적법한 권한이 있음을 보증합니다.",
            "당사는 본 약관 또는 관련 정책을 위반하는 콘텐츠를 삭제하거나 제한할 수 있습니다.",
          ],
        },
        {
          title: "6. 계정 및 접근 관리",
          body: [
            "서비스가 관리자, 운영자 또는 기타 권한 기반 접근 기능을 제공하는 경우 귀하는 계정 정보, 인증 정보 또는 접근 링크의 보안 유지에 대한 책임을 집니다.",
          ],
        },
        {
          title: "7. 서비스 제공 및 변경",
          body: [
            "당사는 언제든지 서비스의 전부 또는 일부를 수정, 중단 또는 종료할 수 있습니다.",
            "당사는 서비스의 지속적인 제공, 무중단 운영 또는 오류 없는 상태를 보장하지 않습니다.",
          ],
        },
        {
          title: "8. 보증의 부인 및 책임의 제한",
          body: [
            "서비스는 있는 그대로 및 이용 가능한 범위 내에서 제공됩니다.",
            "관련 법령이 허용하는 최대 범위 내에서 Minions Bid 및 운영자는 서비스 이용과 관련하여 발생하는 간접손해, 데이터 손실, 영업상 손실 또는 이익 손실에 대해 책임을 지지 않습니다.",
          ],
        },
        {
          title: "9. 이용 제한, 종료 및 약관 변경",
          body: [
            "당사는 귀하가 본 약관을 위반하거나 법적, 보안적 또는 운영상 위험을 초래한다고 판단하는 경우 서비스 이용을 제한하거나 종료할 수 있습니다.",
            "당사는 필요에 따라 본 이용약관을 수정할 수 있으며, 변경 후 서비스를 계속 이용하는 경우 개정 약관에 동의한 것으로 간주됩니다.",
          ],
        },
        {
          title: "10. 문의처",
          body: [
            `이메일: ${CONTACT_EMAIL}`,
            `웹사이트: ${PRODUCT_URL}`,
          ],
        },
      ],
    },
    en: {
      title: "Terms of Service",
      effectiveDateLabel: `Effective Date: ${EFFECTIVE_DATE}`,
      sections: [
        {
          title: "1. Overview",
          body: [
            "Minions Bid is a web-based tool for organizing League of Legends community leagues and tournaments.",
            "The Service provides team management, roster management, match scheduling, match result tracking, and related operational workflows.",
          ],
        },
        {
          title: "2. Eligibility",
          body: [
            "You must be legally permitted to use the Service under the laws of your jurisdiction.",
            "If you use the Service on behalf of a team, community, or organization, you represent and warrant that you have authority to agree to these Terms on its behalf.",
          ],
        },
        {
          title: "3. Prohibited Conduct",
          body: [
            "You agree not to violate any applicable laws or regulations.",
            "You agree not to infringe the rights of Riot Games or any third party.",
            "You agree not to interfere with the operation of the Service or attempt unauthorized access.",
            "You agree not to use the Service for cheating, gameplay automation, abuse, or unfair competitive advantage.",
          ],
        },
        {
          title: "4. Relationship to Riot Games",
          body: [
            "Minions Bid is an independent service and is not endorsed by, sponsored by, or affiliated with Riot Games, Inc.",
            "Riot Games, League of Legends, and all related names, marks, and game assets are the property of Riot Games, Inc.",
            "Use of Riot API data is subject to Riot Games developer policies and applicable terms.",
          ],
        },
        {
          title: "5. User Content",
          body: [
            "You may submit team names, player names, schedules, match results, notes, and similar content to the Service.",
            "You are responsible for the content you submit and represent that you have the legal right to submit it.",
            "We may remove or restrict content that violates these Terms or applicable policies.",
          ],
        },
        {
          title: "6. Accounts and Access",
          body: [
            "If the Service provides organizer, administrator, or other permission-based access, you are responsible for maintaining the security of your credentials, access links, or other authentication methods.",
          ],
        },
        {
          title: "7. Service Availability and Changes",
          body: [
            "We may modify, suspend, or discontinue all or part of the Service at any time.",
            "We do not guarantee uninterrupted availability, ongoing operation, or error-free performance.",
          ],
        },
        {
          title: "8. Disclaimer of Warranties and Limitation of Liability",
          body: [
            "The Service is provided on an as is and as available basis.",
            "To the maximum extent permitted by law, Minions Bid and its operators shall not be liable for indirect, incidental, special, consequential, or punitive damages, including loss of data, business, profits, or goodwill.",
          ],
        },
        {
          title: "9. Suspension, Termination, and Changes to These Terms",
          body: [
            "We may suspend or terminate your access if you violate these Terms or if your use creates legal, security, or operational risk.",
            "We may update these Terms from time to time, and continued use of the Service after changes become effective constitutes acceptance of the revised Terms.",
          ],
        },
        {
          title: "10. Contact",
          body: [
            `Email: ${CONTACT_EMAIL}`,
            `Website: ${PRODUCT_URL}`,
          ],
        },
      ],
    },
  },
  privacy: {
    ko: {
      title: "개인정보처리방침",
      effectiveDateLabel: `시행일: ${EFFECTIVE_DATE}`,
      sections: [
        {
          title: "1. 수집하는 정보",
          body: [
            "당사는 운영자명 또는 식별자, 팀명, 플레이어명, 경기 일정, 경기 결과, 메모 및 자발적으로 제공된 연락처 정보를 수집할 수 있습니다.",
            "또한 IP 주소, 브라우저 종류, 기기 정보, 접속 기록, 페이지 조회 기록 및 오류 로그와 같은 기술적 정보를 수집할 수 있습니다.",
            "Riot API 연동 기능이 활성화되는 경우 tournament code, match identifier, 경기 결과 데이터 및 Riot 정책상 허용되는 범위의 Riot 계정 관련 식별자를 처리할 수 있습니다.",
          ],
        },
        {
          title: "2. 정보의 이용 목적",
          body: [
            "서비스 제공 및 운영",
            "팀, 로스터, 일정 및 경기 기록 관리",
            "tournament code 기반 기능 제공",
            "Riot 경기 결과 수신 및 처리",
            "보안 유지, 오남용 방지 및 서비스 품질 개선",
          ],
        },
        {
          title: "3. 정보의 제공 및 공유",
          body: [
            "당사는 이용자의 개인정보를 판매하지 않습니다.",
            "당사는 서비스 운영을 지원하는 위탁 서비스 제공자, 법적 요구, 권리 보호 또는 Riot Games 개발자 정책 준수를 위해 필요한 경우에만 정보를 공유할 수 있습니다.",
          ],
        },
        {
          title: "4. 보관 기간 및 정보 보호",
          body: [
            "당사는 서비스 운영, 법적 의무 이행, 분쟁 해결 및 약관 집행에 필요한 기간 동안만 정보를 보관합니다.",
            "당사는 무단 접근, 분실, 오용 또는 변경을 방지하기 위해 합리적인 기술적·관리적 보호 조치를 취합니다.",
          ],
        },
        {
          title: "5. 이용자의 권리",
          body: [
            "관련 법령에 따라 이용자는 자신의 개인정보에 대한 열람, 정정, 삭제 또는 처리 제한을 요청할 수 있습니다.",
          ],
        },
        {
          title: "6. 아동의 개인정보 및 제3자 서비스",
          body: [
            "서비스는 관련 법령상 허용되는 연령 미만의 아동을 대상으로 하지 않습니다.",
            "서비스는 제3자 호스팅, 분석, 데이터 저장소 또는 API 서비스를 사용할 수 있으며, 해당 서비스의 데이터 처리 방식은 각자의 정책에 따릅니다.",
          ],
        },
        {
          title: "7. Riot Games 데이터 및 방침의 변경",
          body: [
            "Riot API를 통해 처리되는 데이터는 Riot Games의 개발자 정책 및 관련 약관에 따라 이용됩니다.",
            "당사는 필요에 따라 본 개인정보처리방침을 변경할 수 있으며, 변경 사항은 새로운 시행일과 함께 서비스에 게시됩니다.",
          ],
        },
        {
          title: "8. 문의처",
          body: [
            `이메일: ${CONTACT_EMAIL}`,
            `웹사이트: ${PRODUCT_URL}`,
          ],
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      effectiveDateLabel: `Effective Date: ${EFFECTIVE_DATE}`,
      sections: [
        {
          title: "1. Information We Collect",
          body: [
            "We may collect organizer names or identifiers, team names, player names, schedules, match results, league notes, and contact information you voluntarily provide.",
            "We may also collect technical information such as IP addresses, browser type, device information, access times, page views, and error logs.",
            "If Riot API integrations are enabled, we may process tournament codes, match identifiers, match result data, and Riot account-related identifiers where permitted by Riot policies.",
          ],
        },
        {
          title: "2. How We Use Information",
          body: [
            "We use collected information to provide and operate the Service.",
            "We use it to manage teams, rosters, schedules, match records, tournament-code-based workflows, and Riot result processing.",
            "We also use it to maintain security, prevent abuse, and improve service quality and reliability.",
          ],
        },
        {
          title: "3. Sharing of Information",
          body: [
            "We do not sell personal information.",
            "We may share information only with service providers necessary to operate the Service, when required by law, to protect rights or safety, or to comply with Riot Games developer policies.",
          ],
        },
        {
          title: "4. Data Retention and Security",
          body: [
            "We retain information only for as long as reasonably necessary to operate the Service, comply with legal obligations, resolve disputes, and enforce our agreements.",
            "We take reasonable technical and organizational measures to protect information against unauthorized access, loss, misuse, or alteration.",
          ],
        },
        {
          title: "5. Your Rights",
          body: [
            "Depending on applicable law, you may have the right to request access to, correction of, deletion of, or restriction of processing of your personal information.",
          ],
        },
        {
          title: "6. Children’s Privacy and Third-Party Services",
          body: [
            "The Service is not directed to children below the minimum age permitted by applicable law.",
            "The Service may use third-party hosting, analytics, storage, or API services, and their handling of data is governed by their own policies.",
          ],
        },
        {
          title: "7. Riot Games Data and Changes to This Policy",
          body: [
            "Data processed through the Riot API is subject to Riot Games developer policies and applicable Riot terms.",
            "We may update this Privacy Policy from time to time, and any updated version will be posted with a revised effective date.",
          ],
        },
        {
          title: "8. Contact",
          body: [
            `Email: ${CONTACT_EMAIL}`,
            `Website: ${PRODUCT_URL}`,
          ],
        },
      ],
    },
  },
};

const LANGUAGE_OPTIONS: Array<{ id: LegalLanguage; label: string }> = [
  { id: "ko", label: "한국어" },
  { id: "en", label: "English" },
];

export function LegalInfoModal({
  isOpen,
  documentType,
  onClose,
}: LegalInfoModalProps) {
  const [language, setLanguage] = useState<LegalLanguage>("ko");

  const content = useMemo(
    () => LEGAL_COPY[documentType][language],
    [documentType, language],
  );

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[260] bg-black/80 p-4 flex items-center justify-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#fffdf6] border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b-4 border-black bg-black text-white flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-minion-yellow">
              Legal
            </p>
            <h2 className="text-lg font-heading mt-1">{content.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-black bg-minion-red text-black p-1"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b-2 border-black bg-[#fff4a8] flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-black text-gray-700">
            {content.effectiveDateLabel}
          </p>
          <div className="inline-flex border-2 border-black bg-white">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLanguage(option.id)}
                className={`px-4 py-2 text-xs font-black ${
                  language === option.id
                    ? "bg-black text-minion-yellow"
                    : "bg-white text-black"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5 bg-white space-y-5">
          {content.sections.map((section) => (
            <section key={`${content.title}-${section.title}`} className="space-y-2">
              <h3 className="text-sm font-black text-minion-blue">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.body.map((paragraph) => (
                  <p
                    key={`${section.title}-${paragraph}`}
                    className="text-sm font-bold text-gray-700 leading-relaxed break-keep"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="px-5 py-4 border-t-4 border-black bg-[#f5f5f5] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="pixel-button bg-black text-minion-yellow px-6 py-3 text-xs font-heading"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
