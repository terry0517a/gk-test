'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface DuplicateReport {
  id: string
  email: string
  figure_name: string
  deal_price: number
  status: string
  created_at: string
}

interface PriceReport {
  id: string
  email: string
  figure_name: string
  studio: string | null
  deal_price: number
  deal_date: string | null
  has_screenshot: boolean
  has_shared_social: boolean
  screenshot_url: string | null
  social_share_url: string | null
  status: string
  admin_note: string | null
  created_at: string
  duplicates: DuplicateReport[] | null
}

interface LeaderboardEntry {
  email: string
  reportCount: number
  screenshotCount: number
  hasSocial: boolean
  totalTickets: number
  lastReportAt: string
}

export default function LotteryManagementPage() {
  // 登入
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Tab
  const [activeTab, setActiveTab] = useState<'review' | 'leaderboard'>('review')

  // 審核清單
  const [reports, setReports] = useState<PriceReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportFilter, setReportFilter] = useState('pending')
  const [pendingCount, setPendingCount] = useState(0)
  const [total, setTotal] = useState(0)

  // 退回彈窗
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  // 排行榜
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)

  // 訊息
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 圖片預覽
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      verifyToken(token)
    } else {
      setCheckingAuth(false)
    }
  }, [])

  const verifyToken = async (token: string) => {
    try {
      const res = await fetch('/api/admin/verify', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (res.ok) {
        setIsLoggedIn(true)
      } else {
        localStorage.removeItem('admin_token')
      }
    } catch {
      localStorage.removeItem('admin_token')
    } finally {
      setCheckingAuth(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error || '登入失敗')
        return
      }
      localStorage.setItem('admin_token', data.token)
      setIsLoggedIn(true)
      setPassword('')
    } catch {
      setLoginError('登入失敗')
    }
  }

  // 載入審核清單
  const loadReports = async (status?: string) => {
    setReportsLoading(true)
    try {
      const s = status ?? reportFilter
      const url = s === 'all'
        ? '/api/admin/lottery-reports'
        : `/api/admin/lottery-reports?status=${s}`
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        setReports(data.reports)
        setPendingCount(data.pendingCount)
        setTotal(data.total)
      }
    } catch { /* ignore */ } finally {
      setReportsLoading(false)
    }
  }

  // 載入排行榜
  const loadLeaderboard = async () => {
    setLeaderboardLoading(true)
    try {
      const res = await fetch('/api/admin/lottery-leaderboard')
      const data = await res.json()
      if (res.ok) {
        setLeaderboard(data.leaderboard)
      }
    } catch { /* ignore */ } finally {
      setLeaderboardLoading(false)
    }
  }

  // 登入後自動載入
  useEffect(() => {
    if (!isLoggedIn) return
    loadReports()
    loadLeaderboard()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn])

  // 切換篩選
  useEffect(() => {
    if (!isLoggedIn) return
    loadReports(reportFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportFilter])

  // 核准
  const handleApprove = async (id: string) => {
    try {
      const res = await fetch('/api/admin/lottery-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        loadReports()
        loadLeaderboard()
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: '操作失敗' })
    }
  }

  // 退回
  const handleReject = async () => {
    if (!rejectingId) return
    try {
      const res = await fetch('/api/admin/lottery-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rejectingId, action: 'reject', admin_note: rejectNote }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        setRejectingId(null)
        setRejectNote('')
        loadReports()
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: '操作失敗' })
    }
  }

  // 匯出 CSV
  const handleExport = () => {
    window.open('/api/admin/lottery-export', '_blank')
  }

  // 通知中獎
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [notifyingEmail, setNotifyingEmail] = useState<string | null>(null)

  const getWinnerEmailTemplate = (prize: string, email: string): { subject: string; html: string } => {
    const name = email
    if (prize === '大獎') {
      return {
        subject: '🎊【恭喜你中大獎啦！】GK 報價王 大獎得主通知',
        html: `
<p>嗨，${name} 你好！</p>
<p>哇——你真的中了！🎉</p>
<p>非常恭喜你獲得本次【GK 報價王】的 <strong>大獎</strong>！<br/>
獎品是超猛的 <strong>UNiQUE ART＞火影忍者＞1/6 旗木·卡卡西 &amp; 宇智波帶土</strong>，是我們這次活動最頂級的獎項，你真的太幸運啦！</p>
<hr/>
<p><strong>領獎方式 — 實體郵寄</strong></p>
<p>為了讓獎品順利寄達，請你在期限內提供以下資訊，回覆至本信箱：</p>
<ul>
<li>收件人姓名：</li>
<li>收件地址（含郵遞區號）：</li>
<li>聯絡電話：</li>
</ul>
<p>⚠️ <strong>運費須由得獎者自行負擔</strong>，我們會在確認收件資訊後告知實際運費金額。</p>
<p><strong>領獎期限：收到本通知後 7 日內</strong><br/>
逾期視同放棄，請一定要把握機會喔！</p>
<hr/>
<p>如果有任何問題，請直接透過 Instagram 私訊聯絡我們，回覆最快速：</p>
<p>👉 Instagram：<a href="https://www.instagram.com/gk_collector" target="_blank">@gk_collector</a></p>
<p>也可以寄信至：gkcollectorwork@gmail.com</p>
<p>再次恭喜你！期待把大獎送到你手上<br/>
GK 收藏家 敬上</p>`,
      }
    }
    if (prize === '二獎') {
      return {
        subject: '🎁【恭喜中獎！】GK 報價王 二獎得主通知',
        html: `
<p>嗨，${name} 你好！</p>
<p>超級恭喜你！🎊</p>
<p>你在本次【GK 報價王】活動中抽中了 <strong>二獎</strong> — <strong>夢之船「五條悟」低配版 A 款</strong>！<br/>
在這麼多參加者之中脫穎而出，你真的很棒</p>
<p>⚠️ 溫馨提醒：此獎品只有彩盒，但我們會額外提供一個紙箱作為外箱，用來保護商品寄送，請放心！</p>
<hr/>
<p><strong>領獎方式 — 實體郵寄</strong></p>
<p>請在期限內將以下資料回覆至本信箱，我們會盡快安排寄出：</p>
<ul>
<li>收件人姓名：</li>
<li>收件地址（含郵遞區號）：</li>
<li>聯絡電話：</li>
</ul>
<p>⚠️ <strong>運費須由得獎者自行負擔</strong>，我們會在確認收件資訊後告知實際運費金額。</p>
<p><strong>領獎期限：收到本通知後 7 日內</strong><br/>
請記得在期限內回覆，逾期將視同放棄領獎資格。</p>
<hr/>
<p>如果有任何問題，請直接透過 Instagram 私訊聯絡我們，回覆最快速：</p>
<p>👉 Instagram：<a href="https://www.instagram.com/gk_collector" target="_blank">@gk_collector</a></p>
<p>也可以寄信至：gkcollectorwork@gmail.com</p>
<p>再次恭喜你，期待與你分享這份小驚喜！<br/>
GK 收藏家 敬上</p>`,
      }
    }
    // 三獎
    return {
      subject: '🎀【你中獎啦！】GK 報價王 三獎得主通知',
      html: `
<p>嗨，${name} 你好！</p>
<p>恭喜恭喜！🎉</p>
<p>你參加的【GK 報價王】活動，我們很開心地通知你——你中了 <strong>三獎</strong> — <strong>神隱工作室 千尋 小千 無臉男</strong>！<br/>
感謝你的熱情參與，這份小禮物是我們送給你的心意</p>
<hr/>
<p><strong>領獎方式 — 實體郵寄</strong></p>
<p>請在期限內回覆以下資料，讓我們把獎品送到你家門口：</p>
<ul>
<li>收件人姓名：</li>
<li>收件地址（含郵遞區號）：</li>
<li>聯絡電話：</li>
</ul>
<p>⚠️ <strong>運費須由得獎者自行負擔</strong>，我們會在確認收件資訊後告知實際運費金額。</p>
<p><strong>領獎期限：收到本通知後 7 日內</strong><br/>
逾期將無法補寄，請務必留意喔！</p>
<hr/>
<p>如果有任何問題，請直接透過 Instagram 私訊聯絡我們，回覆最快速：</p>
<p>👉 Instagram：<a href="https://www.instagram.com/gk_collector" target="_blank">@gk_collector</a></p>
<p>也可以寄信至：gkcollectorwork@gmail.com</p>
<p>再次感謝你的參與，希望你喜歡這份驚喜！<br/>
GK 收藏家 敬上</p>`,
    }
  }

  const handleNotifyWinner = async (email: string, prize: string) => {
    setSendingEmail(email)
    setNotifyingEmail(null)
    try {
      const { subject, html } = getWinnerEmailTemplate(prize, email)
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, subject, html }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: data.simulated ? '郵件已模擬發送（尚未設定 Gmail 環境變數）' : `${prize}通知已發送` })
      } else {
        setMessage({ type: 'error', text: data.error || '發送失敗' })
      }
    } catch {
      setMessage({ type: 'error', text: '發送失敗' })
    } finally {
      setSendingEmail(null)
    }
  }

  // 自動清除訊息
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(t)
  }, [message])

  // --- 渲染 ---

  if (checkingAuth) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-black border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center mb-2">活動審核後台</h1>
          <p className="text-gray-400 text-center text-sm mb-8">GK 報價王</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="請輸入管理員密碼"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-black focus:outline-none"
              autoFocus
            />
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
            <button
              type="submit"
              disabled={!password}
              className="w-full py-3 bg-black text-white rounded-xl disabled:bg-gray-300"
            >
              登入
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh pb-8 bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">活動審核後台</h1>
            <p className="text-xs text-gray-400">GK 報價王</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin" className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">&larr; 主後台</a>
            <button
              onClick={() => { localStorage.removeItem('admin_token'); setIsLoggedIn(false) }}
              className="text-sm text-gray-500 hover:text-black"
            >
              登出
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-gray-100">
          <button
            onClick={() => setActiveTab('review')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'review' ? 'text-black border-black' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            待審核
            {pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'leaderboard' ? 'text-black border-black' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            玩家統計
          </button>
        </div>
      </header>

      {/* 訊息 Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm text-white shadow-lg ${
          message.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {message.text}
        </div>
      )}

      <div className="px-4 pt-4">
        {/* ===== 審核清單 ===== */}
        {activeTab === 'review' && (
          <div>
            {/* 篩選 + 匯出 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setReportFilter(f)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      reportFilter === f
                        ? 'bg-black text-white'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {{ pending: '待審核', approved: '已核准', rejected: '已退回', all: '全部' }[f]}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                匯出 CSV
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-3">共 {total} 筆</p>

            {reportsLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-black border-t-transparent rounded-full" />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-center text-gray-400 py-12">沒有資料</p>
            ) : (
              <div className="space-y-3">
                {reports.map(report => (
                  <div key={report.id} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                    {/* 上方：名稱 + 狀態 */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm truncate">{report.figure_name}</h3>
                        {report.studio && (
                          <p className="text-xs text-gray-500 mt-0.5">工作室：{report.studio}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5 font-mono flex items-center gap-1">
                          {report.email}
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(report.email); setMessage({ type: 'success', text: '已複製 Email' }) }}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                            title="複製 Email"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"/></svg>
                          </button>
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        report.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : report.status === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {{ approved: '已核准', rejected: '已退回', pending: '待審核' }[report.status] || report.status}
                      </span>
                    </div>

                    {/* 價格 + 成交日期 + 提交時間 */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                      <span className="font-bold text-green-600 text-sm">
                        NT$ {Number(report.deal_price).toLocaleString()}
                      </span>
                      {report.deal_date && (
                        <span>成交：{report.deal_date}</span>
                      )}
                      <span>{new Date(report.created_at).toLocaleString('zh-TW')}</span>
                    </div>

                    {/* 重複資料警告 */}
                    {report.duplicates && report.duplicates.length > 0 && (
                      <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs font-medium text-amber-700 flex items-center gap-1 mb-1">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          疑似重複回報（同名稱，共 {report.duplicates.length} 筆）
                        </p>
                        <div className="space-y-1">
                          {report.duplicates.map(dup => (
                            <p key={dup.id} className="text-[11px] text-amber-600">
                              {dup.email} ・NT$ {Number(dup.deal_price).toLocaleString()} ・
                              {{ approved: '已核准', rejected: '已退回', pending: '待審核' }[dup.status] || dup.status} ・
                              {new Date(dup.created_at).toLocaleString('zh-TW')}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 截圖預覽 */}
                    <div className="flex gap-2 mb-3">
                      {report.screenshot_url && (
                        <button
                          onClick={() => setPreviewImage(report.screenshot_url)}
                          className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:border-blue-400 transition-colors"
                        >
                          <Image src={report.screenshot_url} alt="成交截圖" fill className="object-cover" />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">成交</span>
                        </button>
                      )}
                      {report.social_share_url && (
                        <button
                          onClick={() => setPreviewImage(report.social_share_url)}
                          className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:border-blue-400 transition-colors"
                        >
                          <Image src={report.social_share_url} alt="社群分享" fill className="object-cover" />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">社群</span>
                        </button>
                      )}
                      {!report.screenshot_url && !report.social_share_url && (
                        <span className="text-xs text-gray-400">無附圖</span>
                      )}
                    </div>

                    {/* 管理員備註 */}
                    {report.admin_note && (
                      <div className="bg-gray-50 rounded-lg p-2 mb-3 text-xs text-gray-600">
                        <span className="font-medium">備註：</span> {report.admin_note}
                      </div>
                    )}

                    {/* 操作按鈕 */}
                    {report.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(report.id)}
                          className="flex-1 py-2 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                        >
                          核准
                        </button>
                        <button
                          onClick={() => { setRejectingId(report.id); setRejectNote('') }}
                          className="flex-1 py-2 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                        >
                          退回
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 玩家統計 (Leaderboard) ===== */}
        {activeTab === 'leaderboard' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">玩家抽獎券排行</h2>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                匯出候選名單
              </button>
            </div>

            {leaderboardLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-black border-t-transparent rounded-full" />
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="text-center text-gray-400 py-12">尚無核准資料</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* 表頭 */}
                <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3rem_3rem_4rem] gap-2 px-4 py-2.5 bg-gray-100 text-xs font-bold text-gray-500 border-b border-gray-200">
                  <div>#</div>
                  <div>Email</div>
                  <div className="text-center">回報</div>
                  <div className="text-center">截圖</div>
                  <div className="text-center">社群</div>
                  <div className="text-center">券數</div>
                  <div className="text-center">操作</div>
                </div>
                {/* 行 */}
                {leaderboard.map((entry, i) => (
                  <div
                    key={entry.email}
                    className={`grid grid-cols-[2rem_1fr_3rem_3rem_3rem_3rem_4rem] gap-2 px-4 py-3 text-sm items-center border-b border-gray-100 last:border-b-0 ${
                      i < 3 ? 'bg-yellow-50/50' : ''
                    }`}
                  >
                    <div className="font-bold text-gray-400">{i + 1}</div>
                    <div className="font-mono text-xs flex items-center gap-1 min-w-0">
                      <span className="truncate">{entry.email}</span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(entry.email); setMessage({ type: 'success', text: '已複製 Email' }) }}
                        className="text-gray-400 hover:text-blue-500 transition-colors shrink-0"
                        title="複製 Email"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"/></svg>
                      </button>
                    </div>
                    <div className="text-center">{entry.reportCount}</div>
                    <div className="text-center">{entry.screenshotCount}</div>
                    <div className="text-center">{entry.hasSocial ? '1' : '0'}</div>
                    <div className="text-center">
                      <span className={`font-bold ${entry.totalTickets >= 10 ? 'text-green-600' : entry.totalTickets >= 5 ? 'text-blue-600' : 'text-gray-800'}`}>
                        {entry.totalTickets}
                      </span>
                    </div>
                    <div className="text-center">
                      <button
                        onClick={() => setNotifyingEmail(entry.email)}
                        disabled={sendingEmail === entry.email}
                        className="px-1.5 py-1 text-[10px] bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300 transition-colors whitespace-nowrap"
                      >
                        {sendingEmail === entry.email ? '...' : '通知'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 退回原因彈窗 */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-3">退回原因</h3>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="請輸入退回原因（選填）"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none resize-none"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setRejectingId(null); setRejectNote('') }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                className="flex-1 py-2.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                確認退回
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 獎項選擇彈窗 */}
      {notifyingEmail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">發送中獎通知</h3>
            <p className="text-xs text-gray-500 mb-4 font-mono">{notifyingEmail}</p>
            <p className="text-sm text-gray-700 mb-3">請選擇獎項等級：</p>
            <div className="space-y-2">
              {(['大獎', '二獎', '三獎'] as const).map(prize => (
                <button
                  key={prize}
                  onClick={() => {
                    if (confirm(`確定要發送「${prize}」通知給 ${notifyingEmail}？`)) {
                      handleNotifyWinner(notifyingEmail, prize)
                    }
                  }}
                  className="w-full py-2.5 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  {prize}
                </button>
              ))}
            </div>
            <button
              onClick={() => setNotifyingEmail(null)}
              className="w-full mt-3 py-2.5 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 圖片預覽彈窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center px-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] w-full">
            <Image
              src={previewImage}
              alt="預覽"
              width={800}
              height={800}
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center text-black hover:bg-white transition-colors"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
