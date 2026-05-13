"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { createRoom as createRoomAction } from "@/features/auction/api/auctionActions";
import { getLeagueScheduleCatalog } from "@/features/schedules/api/scheduleActions";
import type { LeagueScheduleItem } from "@/features/schedules/types";
import { buildTemplateData, CaptainInfo, PlayerInfo } from "../utils/roomGenerator";
import { TIER_MAP, POSITION_HEADER_KEYWORDS } from "../constants/room";
import {
  type CaptainMode,
  getAuctionSlotsPerTeam,
} from "../utils/roster";
import type { AuctionMode } from "../utils/auctionMode";
import { getAuctionClientServices } from "../realtime/clientAdapter";

const LS_KEY = "league_auction_rooms";
const LATENCY_DEBUG =
  process.env.NEXT_PUBLIC_DEBUG_LATENCY === "1" ||
  process.env.DEBUG_LATENCY === "1";

const normalizeTier = (value: string) => {
  const trimmed = value.trim();
  if (TIER_MAP[trimmed]) return TIER_MAP[trimmed];
  if (trimmed === "마스터 이상") return "마스터";
  if (trimmed === "실버 이하") return "실버";
  if (trimmed === "플레티넘") return "플래티넘";
  return trimmed || "언랭";
};

const normalizePosition = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "상관없음") return "무관";
  if (trimmed === "서폿") return "서포터";
  return trimmed;
};

const removeCaptainMarker = (value: string) => {
  const cleaned = value
    .replace(/\(?\s*팀장\s*\)?/g, "")
    .replace(/\[\s*\]/g, "")
    .trim();
  return cleaned || value.trim();
};

export interface BasicInfo {
  title: string;
  teamCount: number;
  membersPerTeam: number;
  captainMode: CaptainMode;
  auctionMode: AuctionMode;
  totalPoints: number;
  scheduleId: string | null;
  linkedAuctionId: string | null;
  linkedLeagueName: string | null;
}

export interface GeneratedLinks {
  roomId: string;
  organizerPath: string;
  organizerLink: string;
  captainLinks: { teamName: string; link: string }[];
  viewerLink: string;
}

export interface StoredRoom {
  id: string;
  name: string;
  organizerPath: string;
  createdAt: string;
}

export function useCreateRoom() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeRooms, setActiveRooms] = useState<StoredRoom[]>([]);
  const [isCheckingRooms, setIsCheckingRooms] = useState(false);
  const [scheduleOptions, setScheduleOptions] = useState<LeagueScheduleItem[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);

  const [basic, setBasic] = useState<BasicInfo>({
    title: "",
    teamCount: 2,
    membersPerTeam: 5,
    captainMode: "IN_ROSTER",
    auctionMode: "OPEN_ASCENDING",
    totalPoints: 1000,
    scheduleId: null,
    linkedAuctionId: null,
    linkedLeagueName: null,
  });
  const [captains, setCaptains] = useState<CaptainInfo[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [links, setLinks] = useState<GeneratedLinks | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateData, setTemplateData] = useState<{
    captains: CaptainInfo[];
    players: PlayerInfo[];
  } | null>(null);

  const loadScheduleOptions = useCallback(async () => {
    setIsLoadingSchedules(true);
    try {
      const catalog = await getLeagueScheduleCatalog();
      setScheduleOptions(catalog.schedules);
    } catch (err) {
      console.error("loadScheduleOptions error:", err);
    } finally {
      setIsLoadingSchedules(false);
    }
  }, []);

  const checkActiveRooms = useCallback(async () => {
    setIsCheckingRooms(true);
    try {
      const { firestore } = getAuctionClientServices();
      const storedStr = localStorage.getItem(LS_KEY);
      const stored: StoredRoom[] = JSON.parse(storedStr || "[]");
      if (stored.length === 0) return;

      const active: StoredRoom[] = [];
      for (const room of stored) {
        const roomDoc = await getDoc(doc(firestore, "rooms", room.id));
        if (!roomDoc.exists()) {
          const prev: StoredRoom[] = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
          localStorage.setItem(LS_KEY, JSON.stringify(prev.filter((r) => r.id !== room.id)));
          continue;
        }
        const playersSnap = await getDocs(collection(firestore, "rooms", room.id, "players"));
        const playerDocs = playersSnap.docs.map((d) => d.data());
        const allSold =
          playerDocs.length > 0 &&
          playerDocs.every((p) => p.status === "SOLD");
        if (!allSold) active.push(room);
      }
      setActiveRooms(active);
    } catch (err) {
      console.error("checkActiveRooms error:", err);
    } finally {
      setIsCheckingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void checkActiveRooms();
    void loadScheduleOptions();
  }, [checkActiveRooms, isOpen, loadScheduleOptions]);

  const syncCaptains = (count: number) => {
    setCaptains((prev) => {
      const result: CaptainInfo[] = [];
      for (let i = 0; i < count; i++) {
        result.push(
          prev[i] ?? {
            teamName: `팀 ${i + 1}`,
            name: "",
            position: "탑",
            description: "",
            captainPoints: 0,
          },
        );
      }
      return result;
    });
  };

  const syncPlayers = (count: number) => {
    setPlayers((prev) => {
      if (prev.length === count) return prev;
      if (prev.length > count) return prev.slice(0, count);
      const extra = Array.from({ length: count - prev.length }, () => ({
        name: "",
        tier: "골드",
        mainPosition: "탑",
        subPosition: "무관",
        description: "",
      }));
      return [...prev, ...extra];
    });
  };

  const createRoom = async () => {
    const startedAt = Date.now();
    const result = await createRoomAction({
      name: basic.title,
      scheduleId: basic.scheduleId,
      scheduleName: basic.title,
      linkedAuctionId: basic.linkedAuctionId,
      linkedLeagueName: basic.linkedLeagueName,
      totalTeams: basic.teamCount,
      basePoint: basic.totalPoints,
      membersPerTeam: basic.membersPerTeam,
      captainMode: basic.captainMode,
      auctionMode: basic.auctionMode,
      captains,
      players,
    });
    if (result.error) throw new Error(result.error);

    const { roomId, organizerToken, viewerToken, teams: teamsResult } = result;
    if (!roomId || !organizerToken || !viewerToken || !teamsResult) {
      throw new Error("방 생성 결과가 올바르지 않습니다.");
    }

    const baseUrl = window.location.origin;
    const organizerPath = `/api/room-auth?roomId=${roomId}&role=ORGANIZER&token=${organizerToken}`;

    const storedRoom = {
      id: roomId,
      name: basic.title,
      organizerPath,
      createdAt: new Date().toISOString(),
    };
    
    const storedStr = localStorage.getItem(LS_KEY);
    const prev: StoredRoom[] = JSON.parse(storedStr || "[]");
    const updated = [storedRoom, ...prev.filter((r) => r.id !== roomId)].slice(0, 5);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));

    setLinks({
      roomId,
      organizerPath,
      organizerLink: `${baseUrl}${organizerPath}`,
      captainLinks: teamsResult.map((team) => ({
        teamName: team.name,
        link: `${baseUrl}/api/room-auth?roomId=${roomId}&role=LEADER&teamId=${team.id}&token=${team.leader_token}`,
      })),
      viewerLink: `${baseUrl}/api/room-auth?roomId=${roomId}&role=VIEWER&token=${viewerToken}`,
    });

    if (LATENCY_DEBUG) {
      console.info("[latency][client] createRoom response", {
        roomId,
        totalMs: Date.now() - startedAt,
        teamCount: captains.length,
        playerCount: players.length,
      });
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsUploading(true);
    try {
      const XLSX = await import("xlsx");
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data || typeof data === "string") return;

          const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), { type: "array" });
          const sheetName = workbook.SheetNames.includes("DB") ? "DB" : workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as (string | undefined)[][];

          if (rows.length < 2) return;
          const headerRow = Array.from(rows[0], (h) => String(h ?? "").trim());

          let nameCol = 2, realNameCol = 1, tierCol = 3, commentCol = 6;
          let aramTierCol = -1, tftTierCol = -1;
          let mainPositionCol = -1, subPositionCol = -1;
          for (let ci = 0; ci < headerRow.length; ci++) {
            const h = headerRow[ci];
            if (h.includes("닉네임")) nameCol = ci;
            else if (h.includes("본인 이름") || h.includes("성+이름")) realNameCol = ci;
            else if (h.includes("티어") || h.includes("소환사의 협곡")) tierCol = ci;
            else if (h.includes("무작위 총력전")) aramTierCol = ci;
            else if (h.includes("전략적 팀 전투")) tftTierCol = ci;
            else if (h.includes("코멘트") || h.includes("설명") || h.includes("하고 싶은 말")) commentCol = ci;
            else if (h.includes("주라인")) mainPositionCol = ci;
            else if (h.includes("부라인")) subPositionCol = ci;
          }

          const positionColMap = new Map<number, string>();
          for (let ci = 0; ci < headerRow.length; ci++) {
            const h = headerRow[ci];
            for (const { keywords, position } of POSITION_HEADER_KEYWORDS) {
              if (keywords.includes(h)) {
                positionColMap.set(ci, position);
                break;
              }
            }
          }
          if (positionColMap.size < 5) {
            positionColMap.clear();
            [["탑", 9], ["정글", 10], ["미드", 11], ["원딜", 12], ["서포터", 13]].forEach(([pos, idx]) =>
              positionColMap.set(idx as number, pos as string),
            );
          }

          const parsed: PlayerInfo[] = [];
          const parsedCaptains: CaptainInfo[] = [];
          for (let ri = 1; ri < rows.length; ri++) {
            const row = rows[ri];
            const name = String(row[nameCol] ?? "").trim();
            if (!name) continue;
            const realName = String(row[realNameCol] ?? "").trim();
            const tierRaw = String(row[tierCol] ?? "").trim();
            const tier = normalizeTier(tierRaw);
            const description = String(row[commentCol] ?? "").trim();
            const aramTier = aramTierCol >= 0 ? String(row[aramTierCol] ?? "").trim() : "";
            const tftTier = tftTierCol >= 0 ? String(row[tftTierCol] ?? "").trim() : "";
            let mainPosition = "", subPosition = "";
            if (mainPositionCol >= 0 || subPositionCol >= 0) {
              mainPosition = normalizePosition(String(row[mainPositionCol] ?? ""));
              subPosition = normalizePosition(String(row[subPositionCol] ?? ""));
            } else {
              positionColMap.forEach((posName, colIdx) => {
                const val = String(row[colIdx] ?? "").trim();
                if (val === "●" && !mainPosition) mainPosition = posName;
                else if (val === "○" && !subPosition) subPosition = posName;
              });
            }
            const player = { name, tier, mainPosition: mainPosition || "무관", subPosition: subPosition || "무관", description, aramTier, tftTier };
            const isCaptainRow =
              name.includes("팀장") ||
              realName.includes("팀장") ||
              description.trim() === "팀장";

            if (isCaptainRow) {
              const captainName = removeCaptainMarker(name);
              parsedCaptains.push({
                teamName: `${captainName}팀`,
                name: captainName,
                position: player.mainPosition,
                description: player.description,
                captainPoints: 0,
              });
              continue;
            }

            parsed.push(player);
          }

          if (parsed.length === 0 && parsedCaptains.length === 0) {
            alert("파싱된 선수가 없습니다. 파일 형식을 확인해주세요.");
            return;
          }
          if (parsedCaptains.length > 0) {
            setCaptains((prev) => {
              const next = [...prev];
              for (let i = 0; i < Math.min(parsedCaptains.length, basic.teamCount); i++) {
                next[i] = parsedCaptains[i];
              }
              return next;
            });
          }
          const fixed =
            basic.teamCount *
            getAuctionSlotsPerTeam(basic.membersPerTeam, basic.captainMode);
          const trimmed = parsed.slice(0, fixed);
          const padded: PlayerInfo[] = trimmed.length < fixed
              ? [...trimmed, ...Array.from({ length: fixed - trimmed.length }, () => ({ name: "", tier: "골드", mainPosition: "탑", subPosition: "무관", description: "" }))]
              : trimmed;
          setPlayers(padded);
          alert(`${trimmed.length}명의 선수 정보와 ${Math.min(parsedCaptains.length, basic.teamCount)}명의 팀장 정보로 목록을 덮어썼습니다.`);
        } catch (err) {
          console.error("Excel parse error:", err);
          alert("엑셀 파일 파싱에 실패했습니다.");
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("xlsx load error:", err);
      alert("라이브러리 로드에 실패했습니다.");
      setIsUploading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleNext = async () => {
    if (step === 0) {
      if (!basic.title.trim()) return alert("경매 제목을 입력해주세요.");
      if (!basic.teamCount || basic.teamCount < 2) return alert("팀은 최소 2개 이상이어야 합니다.");
      if (!basic.membersPerTeam || basic.membersPerTeam < 2) return alert("팀당 인원은 최소 2명 이상이어야 합니다.");
      if (!basic.totalPoints || basic.totalPoints < 100) return alert("총 포인트는 최소 100 이상이어야 합니다.");
      syncCaptains(basic.teamCount);
      setStep(1);
    } else if (step === 1) {
      if (captains.some((c) => !c.name.trim() || !c.teamName.trim())) return alert("모든 팀장의 정보를 입력해주세요.");
      if (captains.some((c) => c.captainPoints < 0 || c.captainPoints >= basic.totalPoints)) return alert("포인트 설정을 확인해주세요.");
      syncPlayers(
        basic.teamCount *
          getAuctionSlotsPerTeam(basic.membersPerTeam, basic.captainMode),
      );
      setStep(2);
    } else if (step === 2) {
      if (players.find((p) => !p.name.trim())) return alert("모든 선수의 이름을 입력해주세요.");
      setIsLoading(true);
      try {
        await createRoom();
        setStep(3);
      } catch (err) {
        console.error(err);
        alert("방 생성에 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const reset = () => {
    setStep(0);
    setBasic({
      title: "",
      teamCount: 5,
      membersPerTeam: 5,
      captainMode: "IN_ROSTER",
      auctionMode: "OPEN_ASCENDING",
      totalPoints: 1000,
      scheduleId: null,
      linkedAuctionId: null,
      linkedLeagueName: null,
    });
    setCaptains([]);
    setPlayers([]);
    setLinks(null);
    setCopied(null);
    setActiveRooms([]);
    setScheduleOptions([]);
  };

  const close = () => {
    setIsOpen(false);
    reset();
  };

  const goToRoom = (organizerPath: string) => {
    close();
    window.location.href = organizerPath;
  };

  const openTemplateModal = () => {
    setTemplateData(
      buildTemplateData(
        basic.teamCount,
        basic.membersPerTeam,
        basic.captainMode,
      ),
    );
    setIsTemplateModalOpen(true);
  };

  const applyTemplate = () => {
    if (!templateData) return;
    setCaptains(templateData.captains);
    setPlayers(templateData.players);
    setIsTemplateModalOpen(false);
  };

  return {
    isOpen, setIsOpen,
    step, setStep, isLoading, isUploading, copied, fileInputRef,
    activeRooms, isCheckingRooms, basic, setBasic, captains, setCaptains,
    scheduleOptions, isLoadingSchedules, loadScheduleOptions,
    players, setPlayers, links, isTemplateModalOpen, setIsTemplateModalOpen,
    templateData, setTemplateData, handleNext, handleExcelUpload,
    copyToClipboard, reset, close, goToRoom, openTemplateModal, applyTemplate, buildTemplateData
  };
}
