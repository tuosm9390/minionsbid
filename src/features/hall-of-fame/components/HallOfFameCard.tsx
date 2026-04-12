"use client";

import { useState } from "react";
import { deleteHallOfFameEntry } from "../api/hallOfFameActions";
import type { HallOfFameEntry } from "../types";

interface HallOfFameCardProps {
  entry: HallOfFameEntry;
  onDeleted: () => void;
}

export function HallOfFameCard({ entry, onDeleted }: HallOfFameCardProps) {
  const [showRoster, setShowRoster] = useState(false);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const wonDate = entry.won_at
    ? new Date(entry.won_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Seoul",
      })
    : "-";

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError("");
    const result = await deleteHallOfFameEntry(entry.id, deleteCode);
    setIsDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <div className="bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 space-y-4">
      {/* 시즌명 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="bg-black text-white px-3 py-1 text-xs font-heading tracking-widest uppercase">
          {entry.season_name}
        </span>
        <span className="text-xs font-bold text-gray-500">{wonDate}</span>
      </div>

      {/* 우승팀명 */}
      <div className="border-2 border-black p-4 bg-minion-yellow/20">
        <p className="text-xs font-heading text-gray-500 uppercase tracking-widest mb-1">
          Champion
        </p>
        <p className="text-2xl font-heading font-black text-minion-blue">
          {entry.winning_team_name}
        </p>
        <p className="text-sm font-bold text-gray-700 mt-1">
          팀장: {entry.winning_team_leader}
        </p>
      </div>

      {/* 로스터 토글 */}
      {entry.winning_team_players.length > 0 && (
        <div>
          <button
            onClick={() => setShowRoster((v) => !v)}
            className="w-full border-2 border-black py-2 px-4 text-xs font-heading uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
          >
            {showRoster ? "▲ ROSTER 접기" : "▼ ROSTER 보기"} (
            {entry.winning_team_players.length}명)
          </button>
          {showRoster && (
            <ul className="mt-2 border-2 border-black divide-y-2 divide-black">
              {entry.winning_team_players.map((p, i) => (
                <li
                  key={i}
                  className="flex justify-between items-center px-4 py-2 text-sm font-bold"
                >
                  <span>{p.name}</span>
                  <span className="text-minion-blue text-xs">
                    {p.sold_price !== null ? `${p.sold_price}P` : "자유계약"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 삭제 */}
      {!showDeletePrompt ? (
        <button
          onClick={() => setShowDeletePrompt(true)}
          className="text-xs text-gray-400 hover:text-minion-red underline font-bold transition-colors"
        >
          삭제
        </button>
      ) : (
        <div className="border-2 border-black p-3 space-y-2 bg-red-50">
          <p className="text-xs font-bold text-gray-700">관리자 코드를 입력하세요</p>
          <input
            type="password"
            value={deleteCode}
            onChange={(e) => setDeleteCode(e.target.value)}
            placeholder="관리자 코드"
            className="w-full border-2 border-black px-3 py-2 text-sm font-bold focus:outline-none focus:border-minion-red"
            onKeyDown={(e) => e.key === "Enter" && handleDelete()}
          />
          {deleteError && (
            <p className="text-xs text-minion-red font-bold">{deleteError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={isDeleting || !deleteCode}
              className="pixel-button bg-minion-red text-white text-xs px-4 py-2 disabled:opacity-50"
            >
              {isDeleting ? "삭제 중..." : "확인"}
            </button>
            <button
              onClick={() => {
                setShowDeletePrompt(false);
                setDeleteCode("");
                setDeleteError("");
              }}
              className="pixel-button bg-white text-xs px-4 py-2"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
