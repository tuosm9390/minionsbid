'use client'

import { useState } from 'react'
import { X, HelpCircle } from 'lucide-react'

const HOW_TO_USE = [
  {
    step: '01', icon: '🍌', title: '경매방 만들기',
    desc: '팀 수, 인원, 포인트를 설정하고 팀장과 경매 선수를 등록해 방을 생성합니다.',
  },
  {
    step: '02', icon: '🔗', title: '링크 공유',
    desc: '생성된 팀장별 링크를 각 팀장에게 공유합니다. 관전자 링크도 자유롭게 배포할 수 있습니다.',
  },
  {
    step: '03', icon: '✅', title: '팀장 접속 확인',
    desc: '경매 화면에서 팀장들의 실시간 접속 여부를 확인합니다. 모두 접속되면 경매를 시작하세요.',
  },
  {
    step: '04', icon: '🔥', title: '경매 진행',
    desc: '주최자가 선수를 하나씩 경매에 올리면 각 팀장이 포인트로 입찰합니다. 타이머 종료 시 최고 입찰 팀이 낙찰됩니다.',
  },
  {
    step: '05', icon: '🏆', title: '팀 확정',
    desc: '모든 선수가 낙찰되면 최종 팀 구성과 사용 포인트가 확정됩니다.',
  },
]

const TIPS = [
  '팀장 링크와 주최자 링크는 다른 주소입니다. 혼동하지 않도록 주의해주세요.',
  '경매 순서를 "주최자만 공개"로 설정하면 팀장들이 다음 선수를 미리 알 수 없습니다.',
  '팀장 포인트는 팀 시작 포인트에서 차감됩니다 (팀 예산 = 총 포인트 − 팀장 포인트).',
  '방 페이지 헤더의 "링크 확인" 버튼으로 언제든지 공유 링크를 다시 확인할 수 있습니다.',
]

export function HowToUseModal({ variant = 'default' }: { variant?: 'default' | 'header' }) {
  const [isOpen, setIsOpen] = useState(false)

  const trigger =
    variant === 'header' ? (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-sm font-bold transition-colors border border-white/30"
      >
        <HelpCircle size={14} /> 이용법
      </button>
    ) : (
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-gray-400 hover:text-minion-blue transition-colors underline underline-offset-2"
      >
        이용 방법 보기
      </button>
    )

  return (
    <>
      {trigger}

      {isOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-black text-minion-blue">🍌 이용 방법</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {HOW_TO_USE.map((item) => (
                <div key={item.step} className="flex gap-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="text-2xl shrink-0 mt-0.5">{item.icon}</div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-minion-blue bg-minion-yellow/30 px-2 py-0.5 rounded-full">
                        STEP {item.step}
                      </span>
                      <h3 className="font-black text-gray-800">{item.title}</h3>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}

              <div className="bg-minion-blue/5 border border-minion-blue/20 rounded-2xl p-4">
                <p className="text-sm font-black text-minion-blue mb-2">💡 알아두면 좋은 점</p>
                <ul className="text-sm text-gray-600 space-y-1.5">
                  {TIPS.map((tip, i) => (
                    <li key={i}>· {tip}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
