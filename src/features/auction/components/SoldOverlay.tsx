'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface SoldOverlayProps {
  playerName: string
  teamName: string
  price: number
  onDismiss: () => void
}

export function SoldOverlay({ playerName, teamName, price, onDismiss }: SoldOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { type: 'spring', damping: 12, stiffness: 200 } }}
        className="pixel-box bg-minion-yellow border-8 border-black p-10 flex flex-col items-center gap-4 text-center shadow-[16px_16px_0px_rgba(0,0,0,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl animate-bounce">🎉</div>
        <div className="space-y-2">
          <h2 className="text-fluid-xl font-heading text-black tracking-tighter">SOLD!</h2>
          <p className="text-fluid-lg font-black text-black">{playerName}</p>
          <p className="text-fluid-sm font-heading text-black/70 uppercase">{teamName}</p>
        </div>
        <div className="pixel-box bg-black text-minion-yellow px-6 py-3 font-heading text-fluid-lg tracking-tighter">
          {price.toLocaleString()} P
        </div>
      </motion.div>
    </motion.div>
  )
}
