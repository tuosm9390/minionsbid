"use server";
// 최종 실제 팀 배정 결과를 서버 경계에서 검증하고 저장한다.
import { FieldValue } from "firebase-admin/firestore";
import { requireRoomOrganizer } from "@/features/auction/api/organizerAuth";
import {
  isE2EAuctionFixtureEnabled,
  saveE2EAuctionFixtureTeamAssignment,
} from "@/features/auction/api/e2eAuctionFixture";
import { getAuctionServerServices } from "@/features/auction/realtime/serverAdapter";
import type {
  AssignmentExceptionReason,
  AssignmentSelectionStatus,
} from "@/features/auction/utils/desiredTeamAssignment";
import { getAssignmentExceptionMessage } from "@/features/auction/utils/desiredTeamAssignment";

export interface SaveTeamAssignmentPayload {
  roomId: string;
  organizerToken: string;
  assignments: Array<{
    auctionTeamId: string;
    assignedTeamId: number | null;
    status: Exclude<AssignmentSelectionStatus, "UNASSIGNED">;
    exceptionReason?: AssignmentExceptionReason;
    originalCandidateTeamIds: number[];
    message?: string;
  }>;
}

export async function saveTeamAssignment(
  payload: SaveTeamAssignmentPayload,
): Promise<{ error?: string }> {
  if (payload.assignments.length === 0) {
    return { error: "최종 팀 배정 대상이 없습니다." };
  }

  const assignedTeamIds = new Set<number>();
  for (const assignment of payload.assignments) {
    if (!assignment.auctionTeamId.trim() || assignment.assignedTeamId === null) {
      return { error: "모든 경매 팀에 실제 팀을 배정해주세요." };
    }
    if (assignedTeamIds.has(assignment.assignedTeamId)) {
      return { error: "하나의 실제 팀은 한 경매 팀에만 배정할 수 있습니다." };
    }
    assignedTeamIds.add(assignment.assignedTeamId);
    if (assignment.status === "EXCEPTION" && !assignment.exceptionReason) {
      return { error: "예외 배정은 사유가 필요합니다." };
    }
  }

  if (isE2EAuctionFixtureEnabled()) {
    return saveE2EAuctionFixtureTeamAssignment(
      payload.roomId,
      payload.organizerToken,
      payload.assignments,
    );
  }

  const authError = await requireRoomOrganizer(
    payload.roomId,
    payload.organizerToken,
  );
  if (authError) return { error: authError };

  try {
    const finalAssignment = {
      status: "CONFIRMED",
      confirmed_at: FieldValue.serverTimestamp(),
      assignments: payload.assignments.map((assignment) => ({
        auction_team_id: assignment.auctionTeamId,
        assigned_team_id: assignment.assignedTeamId,
        status: assignment.status,
        exception_reason: assignment.exceptionReason ?? null,
        original_candidate_team_ids: assignment.originalCandidateTeamIds,
        message:
          assignment.message ??
          (assignment.exceptionReason
            ? getAssignmentExceptionMessage(assignment.exceptionReason)
            : null),
      })),
    };

    await getAuctionServerServices()
      .firestore.collection("rooms")
      .doc(payload.roomId)
      .update({
        team_assignment: finalAssignment,
      });

    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return { error: message };
  }
}
