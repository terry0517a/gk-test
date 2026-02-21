'use client'

import { useEffect } from 'react'

export default function VisitTracker() {
  useEffect(() => {
    fetch('/api/track-visit').catch(() => {
      // 靜默失敗，不影響使用者體驗
    })
  }, [])

  return null
}
