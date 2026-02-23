'use client'

import { useState, useEffect, useRef } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'ios' | 'android' | 'desktop' | null

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [platform, setPlatform] = useState<Platform>(null)
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // 註冊 Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // 已在 standalone 模式（已安裝）→ 記錄安裝，不顯示提示
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true

    if (isStandalone) {
      localStorage.setItem('pwa_installed', '1')
      trackInstall(detectPlatform(), 'standalone_detected')
      return
    }

    // 已安裝過 → 永不再提醒
    if (localStorage.getItem('pwa_installed')) return

    const detectedPlatform = detectPlatform()
    setPlatform(detectedPlatform)

    // 監聽 beforeinstallprompt（Android Chrome / 桌面 Chrome）
    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setShowPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // 監聽安裝成功
    const installedHandler = () => {
      setShowPrompt(false)
      localStorage.setItem('pwa_installed', '1')
      trackInstall(detectedPlatform || 'desktop', 'beforeinstallprompt')
    }
    window.addEventListener('appinstalled', installedHandler)

    // iOS Safari: 沒有 beforeinstallprompt，直接顯示手動教學
    if (detectedPlatform === 'ios') {
      setShowPrompt(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  function detectPlatform(): Platform {
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
    if (/Android/.test(ua)) return 'android'
    return null
  }

  function trackInstall(p: Platform, method: string) {
    fetch('/api/track-install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: p || 'unknown', method }),
    }).catch(() => {})
  }

  async function handleInstallClick() {
    if (!deferredPrompt.current) return
    await deferredPrompt.current.prompt()
    const { outcome } = await deferredPrompt.current.userChoice
    if (outcome === 'accepted') {
      trackInstall('android', 'beforeinstallprompt')
    }
    deferredPrompt.current = null
    setShowPrompt(false)
  }

  function handleDismiss() {
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up">
      <div className="bg-gray-800 border border-gray-700 text-white rounded-2xl p-4 shadow-2xl max-w-md mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            {platform === 'android' ? (
              <>
                <p className="font-bold text-sm mb-1">安裝 GK收藏家 APP</p>
                <p className="text-xs text-gray-400 mb-3">
                  加入主畫面，隨時查詢 GK 行情
                </p>
                <button
                  onClick={handleInstallClick}
                  className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  安裝 APP
                </button>
              </>
            ) : (
              <>
                <p className="font-bold text-sm mb-1">加入主畫面</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  點擊底部{' '}
                  <svg
                    className="inline-block w-4 h-4 align-text-bottom"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15"
                    />
                  </svg>{' '}
                  分享按鈕，再選擇「加入主畫面」
                </p>
              </>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            aria-label="關閉"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
