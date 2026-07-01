// 입찰 중 팀장에게 희망 팀 후보 충돌 상태를 표시한다.
import {
  formatTeamIds,
  type DesiredTeamConflictEvaluation,
} from "@/features/auction/utils/desiredTeamAssignment";
import { cn } from "@/lib/utils";

interface DesiredTeamConflictWarningProps {
  evaluation: DesiredTeamConflictEvaluation | null;
}

export function DesiredTeamConflictWarning({
  evaluation,
}: DesiredTeamConflictWarningProps) {
  if (!evaluation || evaluation.status === "NONE") return null;

  const isConflict = evaluation.status === "CONFLICT";

  return (
    <div
      data-testid="desired-team-conflict-warning"
      className={cn(
        "w-full border-4 bg-white px-4 py-3 text-left shadow-pixel-sm",
        isConflict ? "border-minion-red" : "border-minion-yellow",
      )}
    >
      <p
        className={cn(
          "text-fluid-xs font-heading uppercase tracking-tighter",
          isConflict ? "text-minion-red" : "text-[#8a6400]",
        )}
      >
        {isConflict ? "희망 팀 충돌 경고" : "희망 팀 후보 주의"}
      </p>
      <p className="mt-2 text-fluid-xs font-black leading-snug text-black">
        {isConflict
          ? "현재 로스터의 희망 팀과 입찰 대상 선수의 희망 팀이 겹치지 않습니다."
          : `남은 배정 후보: ${formatTeamIds(evaluation.remainingTeamIds)}`}
      </p>
      {isConflict && (
        <p className="mt-2 text-[11px] font-bold leading-snug text-gray-700">
          이 선수를 낙찰받으면 경매 종료 후 이 로스터는 희망 팀 조건을
          만족하는 최종 팀 배정을 받지 못할 수 있습니다.
        </p>
      )}
    </div>
  );
}
