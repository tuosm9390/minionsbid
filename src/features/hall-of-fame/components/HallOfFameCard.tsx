"use client";

import { useState } from "react";
import Image from "next/image";
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
  const hasRoster = entry.winning_team_players.length > 0;
  const rosterId = `hof-roster-${entry.id}`;

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
    <div className="hof-trophy-card">
      <div className="hof-exhibit-title">{entry.season_name}</div>
      <div className="hof-trophy-wrap">
        <div className="hof-trophy-illustration">
          <Image
            src="/hall-of-fame-trophy.png"
            alt=""
            width={1086}
            height={1448}
            className="hof-trophy-image"
            priority={false}
          />
          <div className="hof-trophy-team-name">
            <span className="hof-trophy-team-name-text">{entry.winning_team_name}</span>
          </div>
          <div className="hof-trophy-league-name">
            <span className="hof-trophy-league-name-text">{entry.season_name}</span>
          </div>
        </div>

        <div className="hof-info-shell">
          <div className={`hof-nameplate ${showRoster ? "hof-nameplate-open" : ""}`}>
            {entry.season_label && (
              <p className="hof-nameplate-season">시즌 {entry.season_label}</p>
            )}
            {entry.winning_team_leader && (
              <p className="hof-nameplate-leader">
                팀장 <span>{entry.winning_team_leader}</span>
              </p>
            )}

            {hasRoster ? (
              <button
                type="button"
                aria-expanded={showRoster}
                aria-controls={rosterId}
                onClick={() => setShowRoster((v) => !v)}
                className="hof-nameplate-toggle"
              >
                구성원 보기 <span className={`hof-toggle-icon ${showRoster ? "hof-toggle-icon-open" : ""}`}>▼</span>
              </button>
            ) : (
              <div className="hof-nameplate-badge">특수 기록</div>
            )}
          </div>

          {hasRoster && (
            <ul
              id={rosterId}
              className={`hof-roster-panel ${showRoster ? "hof-roster-panel-open" : "hof-roster-panel-closed"}`}
              aria-hidden={!showRoster}
            >
              {entry.winning_team_players.map((p, i) => (
                <li key={i} className="hof-roster-row">
                  <span className="hof-roster-name">{p.name}</span>
                  {p.sold_price !== null && (
                    <span className="hof-roster-price">{p.sold_price}P</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!showDeletePrompt ? (
        <button
          onClick={() => setShowDeletePrompt(true)}
          className="hof-delete-link"
        >
          삭제
        </button>
      ) : (
        <div className="hof-delete-panel">
          <p className="text-xs font-bold text-gray-700">관리자 코드를 입력하세요</p>
          <input
            type="password"
            value={deleteCode}
            onChange={(e) => setDeleteCode(e.target.value)}
            placeholder="관리자 코드"
            className="w-full border-2 border-black px-3 py-2 text-sm font-bold focus:outline-none focus:border-minion-red bg-white"
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
