"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, useCallback } from "react";
import { X, RefreshCw, Save } from "@/components/ui/CyberIcons";
import { ThreeDIcon } from "@/components/ui/ThreeDIcon";
import { getVisibleAuctionArchives } from "@/features/hall-of-fame/api/hallOfFameActions";
import type { ArchiveTeam } from "@/features/auction/api/auctionActions";
import { useOverlayDismiss } from "@/components/ui/useOverlayDismiss";
import {
  buildArchiveRosterWorkbook,
  getArchiveRosterExcelFileName,
} from "@/components/auctionArchiveExcel";

interface AuctionArchiveRow {
  id: string;
  room_id: string;
  room_name: string;
  closed_at: string;
  result_snapshot: ArchiveTeam[];
}

function ArchiveDetailModal({
  archive,
  onClose,
}: {
  archive: AuctionArchiveRow;
  onClose: () => void;
}) {
  const sortedTeams = [...archive.result_snapshot].sort((a, b) =>
    a.name.localeCompare(b.name, "ko-KR", { numeric: true }),
  );
  const overlayDismiss = useOverlayDismiss<HTMLDivElement>(onClose);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = async () => {
    if (isExporting) return;

    setIsExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = buildArchiveRosterWorkbook(XLSX, archive);
      XLSX.writeFile(workbook, getArchiveRosterExcelFileName(archive));
    } catch {
      alert("엑셀 파일 생성에 실패했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/70 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onMouseDown={overlayDismiss.onMouseDown}
      onMouseUp={overlayDismiss.onMouseUp}
    >
      <div
        className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-5xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-4 border-black flex items-center justify-between shrink-0 bg-minion-yellow">
          <div className="flex items-center gap-3">
            <ThreeDIcon name="openFileFolder" alt="아카이브 상세" size={28} />
            <div>
              <h2 className="text-lg font-black text-black uppercase">
                {archive.room_name}
              </h2>
              <p className="text-fluid-xs font-heading text-black/80 mt-1 uppercase">
                CLOSED:{" "}
                {new Date(archive.closed_at).toLocaleDateString("ko-KR")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-black hover:bg-black/10 p-1 transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sortedTeams.map((team) => (
              <div
                key={team.id}
                className="bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
              >
                <table className="w-full h-full text-fluid-xs border-collapse">
                  <tbody>
                    <tr>
                      <td
                        rowSpan={Math.max(team.players.length, 1) + 2}
                        className="w-1/3 border-r-4 border-black bg-gray-100 text-center align-middle p-4"
                      >
                        <span className="text-fluid-sm font-black text-black block mb-1">
                          {team.leader_name}
                        </span>
                        <div className="text-fluid-xs font-heading text-minion-blue mb-2">
                          {team.name}
                        </div>
                        <div className="inline-block border-2 border-black bg-minion-yellow text-black font-heading text-fluid-xs px-2 py-1 uppercase">
                          {team.point_balance.toLocaleString()}P LEFT
                        </div>
                      </td>
                      <td className="w-2/3 border-b-4 border-black bg-minion-blue text-white text-center py-2 px-4">
                        <span className="font-heading text-fluid-xs uppercase tracking-tighter">
                          ROSTER
                        </span>
                      </td>
                    </tr>
                    {/* 팀장 행 */}
                    <tr>
                      <td className="w-2/3 border-b-2 border-black text-center py-2.5 px-4 bg-blue-50 relative">
                        <span className="text-indigo-600 absolute left-3 top-1/2 -translate-y-1/2 text-fluid-xs font-heading">
                          Leader
                        </span>
                        <span className="font-black text-fluid-sm text-gray-900">
                          {team.leader_name}
                        </span>
                      </td>
                    </tr>
                    {/* 선수 목록 */}
                    {team.players.length > 0 ? (
                      team.players.map((p, idx) => (
                        <tr key={idx}>
                          <td
                            className={`w-2/3 text-fluid-sm py-2.5 px-4 font-bold text-gray-700 relative ${idx !== team.players.length - 1 ? "border-b border-gray-300" : ""}`}
                          >
                            <div className="text-center w-full px-10">
                              <div>{p.name}</div>
                              <div className="mt-1 text-[11px] font-bold text-gray-500">
                                {p.tier || "티어 미기입"} ·{" "}
                                {p.main_position || "포지션 미기입"}
                                {p.sub_position ? ` / ${p.sub_position}` : ""}
                              </div>
                            </div>
                            {p.sold_price != null && (
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-fluid-xs font-black text-red-500">
                                {p.sold_price.toLocaleString()}P
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="w-2/3 text-center py-6 text-fluid-xs font-heading text-gray-300 italic">
                          EMPTY ROSTER
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t-4 border-black bg-white shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="pixel-button w-full py-3 bg-minion-blue text-white text-fluid-xs font-heading disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save size={14} /> {isExporting ? "EXPORTING..." : "DOWNLOAD XLSX"}
          </button>
          <button
            onClick={onClose}
            className="pixel-button w-full py-3 bg-black text-white text-fluid-xs font-heading"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuctionArchiveSection({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [archives, setArchives] = useState<AuctionArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuctionArchiveRow | null>(null);
  const overlayDismiss = useOverlayDismiss<HTMLDivElement>(onClose);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await getVisibleAuctionArchives()) as AuctionArchiveRow[];
      setArchives(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchArchives();
    }
  }, [isOpen, fetchArchives]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {loading ? (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-black p-10 max-w-sm w-full text-center text-black font-heading text-xs animate-pulse">
            LOADING ARCHIVES...
          </div>
        </div>
      ) : (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onMouseDown={overlayDismiss.onMouseDown}
          onMouseUp={overlayDismiss.onMouseUp}
        >
          <div
            className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 cursor-default overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b-4 border-black flex items-center justify-between shrink-0 bg-minion-blue text-white">
              <h2 className="text-xs font-heading flex items-center gap-2">
                <ThreeDIcon
                  name="cardFileBox"
                  alt="데이터 아카이브"
                  size={28}
                />
                DATA ARCHIVE
              </h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setLoading(true);
                    void fetchArchives();
                  }}
                  className="flex items-center gap-1.5 text-fluid-xs font-heading text-white hover:text-minion-yellow transition-colors"
                >
                  <RefreshCw size={12} /> REFRESH
                </button>
                <button
                  onClick={onClose}
                  className="text-white hover:text-minion-yellow p-1 transition-colors"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 custom-scrollbar">
              {archives.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center text-gray-300 font-heading text-fluid-xs border-4 border-dashed border-gray-200">
                  <ThreeDIcon
                    name="openFileFolder"
                    alt="비어 있는 아카이브"
                    size={52}
                  />
                  NO RECORDS FOUND
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {archives.map((archive) => (
                    <div
                      key={archive.id}
                      className="bg-white border-4 border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all cursor-pointer"
                      onClick={() => setSelected(archive)}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 border-2 border-background flex items-center justify-center shrink-0">
                          <ThreeDIcon
                            name="fileFolder"
                            alt="완료된 경매 기록"
                            size={36}
                          />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-black text-lg truncate mb-1">
                            {archive.room_name}
                          </h3>
                          <p className="text-fluid-xs font-heading text-gray-400 uppercase tracking-tighter flex items-center gap-2">
                            {new Date(archive.closed_at).toLocaleDateString(
                              "ko-KR",
                            )}
                            <span className="w-1 h-1 bg-gray-300" />
                            <span className="text-minion-blue font-bold tracking-normal">
                              {archive.result_snapshot.length} TEAMS
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t-4 border-black bg-white">
              <button
                onClick={onClose}
                className="pixel-button w-full py-3 bg-black text-white text-fluid-xs font-heading"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <ArchiveDetailModal
          archive={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>,
    document.body,
  );
}
