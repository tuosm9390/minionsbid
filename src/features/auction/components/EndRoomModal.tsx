'use client'

import { useState } from 'react'
import { X, Trash2, AlertTriangle, Save } from 'lucide-react'

interface EndRoomModalProps {
  isOpen: boolean
  isCompleted: boolean
  isDeleting: boolean
  onClose: () => void
  onConfirm: (saveResult: boolean) => void
}

export function EndRoomModal({
  isOpen,
  isCompleted,
  isDeleting,
  onClose,
  onConfirm,
}: EndRoomModalProps) {
  const [confirmed, setConfirmed] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    if (isDeleting) return
    setConfirmed(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-800">방 종료</h2>
              <p className="text-xs text-gray-400 mt-0.5">이 작업은 되돌릴 수 없습니다.</p>
            </div>
          </div>
          {!isDeleting && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 space-y-1">
              <p className="font-bold">경매방과 모든 데이터를 삭제합니다.</p>
              <p>입찰 기록, 채팅, 팀 정보, 선수 정보 등 관련 데이터가 모두 삭제되며 복구할 수 없습니다.</p>
            </div>
          </div>

          {/* 체크박스 확인 */}
          {!isCompleted && (
            <label className="flex items-start gap-3 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-500 cursor-pointer"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                위 내용을 확인했으며, 방을 종료하고 모든 데이터를 삭제합니다.
              </span>
            </label>
          )}

          {/* 경매 완료 상태 안내 */}
          {isCompleted && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-700">
              <p className="font-bold mb-1">🏆 경매가 정상 종료되었습니다!</p>
              <p>결과를 저장하면 메인 화면에서 나중에 다시 확인할 수 있습니다.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex flex-col gap-2">
          {isCompleted ? (
            <>
              <button
                onClick={() => onConfirm(true)}
                disabled={isDeleting}
                className="w-full py-3 bg-minion-blue hover:bg-minion-blue-hover text-white rounded-xl font-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <span className="animate-spin text-lg">⏳</span>
                ) : (
                  <Save size={16} />
                )}
                {isDeleting ? '처리 중...' : '결과 저장 후 방 종료'}
              </button>
              <button
                onClick={() => onConfirm(false)}
                disabled={isDeleting}
                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                저장 없이 방 종료 (데이터 삭제)
              </button>
            </>
          ) : (
            <button
              onClick={() => onConfirm(false)}
              disabled={isDeleting || !confirmed}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <span className="animate-spin text-lg">⏳</span>
              ) : (
                <Trash2 size={16} />
              )}
              {isDeleting ? '삭제 중...' : '방 종료 및 데이터 삭제'}
            </button>
          )}
          {!isDeleting && (
            <button
              onClick={handleClose}
              className="w-full py-2.5 text-sm font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
            >
              취소
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
