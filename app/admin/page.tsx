'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

interface Figure {
  id: string
  name: string
  manufacturer: string | null
  version: string | null
  series: string | null
  tag: string | null
  image_url: string | null
  market_price_min: number | null
  market_price_max: number | null
  original_price: number | null
  created_at?: string
}

interface Transaction {
  id: string
  price: number
  source: string | null
  created_at: string
  ip_hash: string
  status: 'pending' | 'approved' | 'rejected'
  figures: {
    id: string
    name: string
    manufacturer: string | null
  } | null
}

interface Stats {
  figures_count: number
  transactions_count: number
  unique_users: number
  today_transactions: number
  week_transactions: number
  with_image_count: number
  without_image_count: number
  with_price_count: number
  without_price_count: number
  today_visitors: number
  yesterday_visitors: number
  weekly_visitors: { date: string; count: number }[]
  pwa_installs: number
}

export default function AdminPage() {
  // 登入狀態
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)

  // 頁籤狀態
  const [activeTab, setActiveTab] = useState<'stats' | 'figures' | 'transactions' | 'issues'>('stats')

  // 統計資料
  const [stats, setStats] = useState<Stats | null>(null)

  // 公仔列表
  const [figures, setFigures] = useState<Figure[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [figureFilter, setFigureFilter] = useState('all')
  const [uploading, setUploading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null)

  // 交易記錄
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [transactionFilter, setTransactionFilter] = useState('pending')
  const [pendingTransactionsCount, setPendingTransactionsCount] = useState(0)

  // 問題回報
  const [issueReports, setIssueReports] = useState<{
    id: string
    type: string
    title: string
    description: string
    contact: string | null
    status: string
    admin_note: string | null
    created_at: string
  }[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [issuesTotal, setIssuesTotal] = useState(0)
  const [issueFilter, setIssueFilter] = useState('all')

  // 編輯狀態
  const [editingFigure, setEditingFigure] = useState<Figure | null>(null)
  const [saving, setSaving] = useState(false)

  // 新增公仔狀態
  const [showAddModal, setShowAddModal] = useState(false)
  const [newFigure, setNewFigure] = useState({
    name: '',
    manufacturer: '',
    series: '',
    original_price: '',
    market_price_min: '',
    market_price_max: '',
  })

  // 批量匯入狀態
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [bulkImportData, setBulkImportData] = useState('')
  const [bulkImportPreview, setBulkImportPreview] = useState<{
    name: string
    manufacturer?: string
    series?: string
    original_price?: string
    market_price_min?: string
    market_price_max?: string
  }[]>([])
  const [bulkImporting, setBulkImporting] = useState(false)

  // PDF 匯入狀態
  const [showPdfImportModal, setShowPdfImportModal] = useState(false)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<{
    name: string
    manufacturer: string
    price: number | null
    version: string | null
    scale: string | null
    condition?: string | null
  }[]>([])
  const [pdfRawText, setPdfRawText] = useState('')
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // OCR 匯入狀態
  const [showOcrImportModal, setShowOcrImportModal] = useState(false)
  const [ocrUploading, setOcrUploading] = useState(false)
  const [ocrPreview, setOcrPreview] = useState<{
    name: string
    manufacturer: string
    price: number | null
    version: string | null
    scale: string | null
    condition?: string | null
  }[]>([])
  const [ocrRawText, setOcrRawText] = useState('')
  const ocrInputRef = useRef<HTMLInputElement>(null)
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number; currentFile: string } | null>(null)

  // 匯入進度狀態
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; stage: string } | null>(null)

  // 爬蟲狀態
  const [showCrawlModal, setShowCrawlModal] = useState(false)
  const [crawlSite, setCrawlSite] = useState('all')
  const [crawlPages, setCrawlPages] = useState(3)
  const [crawling, setCrawling] = useState(false)
  const [crawlResult, setCrawlResult] = useState<{
    message: string
    total_crawled?: number
    inserted?: number
    updated?: number
    sample?: { name: string; manufacturer: string | null; original_price: number | null }[]
  } | null>(null)
  const [crawlProgress, setCrawlProgress] = useState<{
    status: string
    phase: string
    site: string
    current: number
    total: number
    collected: number
    success: number
    errors: number
    currentItem: string
    message: string
  } | null>(null)

  // 檢查登入狀態
  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      verifyToken(token)
    } else {
      setCheckingAuth(false)
    }
  }, [])

  // 即時監控統計資料（每 15 秒更新一次，避免請求過於頻繁）
  useEffect(() => {
    if (!isLoggedIn) return

    let isMounted = true

    const updateStats = async () => {
      if (!isMounted) return
      try {
        // 只更新統計（較輕量）
        const statsRes = await fetch('/api/admin/stats', {
          signal: AbortSignal.timeout(10000) // 10秒超時
        })
        if (statsRes.ok && isMounted) {
          const statsData = await statsRes.json()
          setStats(statsData)
        }
      } catch (err) {
        // 靜默處理錯誤，避免頻繁的錯誤訊息
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('統計更新失敗:', err)
        }
      }
    }

    const interval = setInterval(updateStats, 15000) // 每 15 秒更新

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [isLoggedIn])

  // 搜尋時重新載入公仔（防抖）
  useEffect(() => {
    if (!isLoggedIn) return

    const timer = setTimeout(() => {
      loadFigures(searchQuery)
    }, 300) // 300ms 防抖

    return () => clearTimeout(timer)
  }, [searchQuery, isLoggedIn])

  const verifyToken = async (token: string) => {
    try {
      const res = await fetch('/api/admin/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setIsLoggedIn(true)
        loadAllData()
      } else {
        localStorage.removeItem('admin_token')
      }
    } catch {
      localStorage.removeItem('admin_token')
    } finally {
      setCheckingAuth(false)
    }
  }

  // 登入
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
      loadAllData()
    } catch {
      setLoginError('登入失敗')
    }
  }

  // 登出
  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    setIsLoggedIn(false)
    setFigures([])
    setTransactions([])
    setStats(null)
  }

  // 載入所有資料
  const loadAllData = async () => {
    await Promise.all([
      loadStats(),
      loadFigures(),
      loadTransactions(),
      loadIssueReports(),
    ])
  }

  // 載入統計資料
  const loadStats = async () => {
    try {
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStats(data)
    } catch (err) {
      console.error('載入統計失敗:', err)
    }
  }

  // 載入公仔列表（支援伺服器端搜尋和篩選）
  const loadFigures = async (search?: string, filter?: string) => {
    try {
      const params = new URLSearchParams()
      if (search && search.trim()) {
        params.set('search', search.trim())
      }
      const currentFilter = filter || figureFilter
      if (currentFilter && currentFilter !== 'all') {
        params.set('filter', currentFilter)
      }
      const url = `/api/admin/figures${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.figures) {
        setFigures(data.figures)
      }
    } catch (err) {
      console.error('載入失敗:', err)
    } finally {
      setLoading(false)
    }
  }

  // 載入交易記錄
  const loadTransactions = async (status?: string) => {
    setTransactionsLoading(true)
    try {
      const filterStatus = status || transactionFilter
      const res = await fetch(`/api/admin/transactions?limit=100&status=${filterStatus}`)
      const data = await res.json()
      if (data.transactions) {
        setTransactions(data.transactions)
        setTransactionsTotal(data.total)
        setPendingTransactionsCount(data.pendingCount || 0)
      }
    } catch (err) {
      console.error('載入交易記錄失敗:', err)
    } finally {
      setTransactionsLoading(false)
    }
  }

  // 載入問題回報
  const loadIssueReports = async (status?: string) => {
    setIssuesLoading(true)
    try {
      const filterStatus = status || issueFilter
      const res = await fetch(`/api/admin/issue-reports?status=${filterStatus}&limit=100`)
      const data = await res.json()
      if (data.reports) {
        setIssueReports(data.reports)
        setIssuesTotal(data.total)
      }
    } catch (err) {
      console.error('載入問題回報失敗:', err)
    } finally {
      setIssuesLoading(false)
    }
  }

  // 更新問題回報狀態
  const handleUpdateIssueStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/admin/issue-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '更新失敗')
      }

      setMessage({ type: 'success', text: '狀態已更新' })
      loadIssueReports()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '更新失敗' })
    }
  }

  // 刪除問題回報
  const handleDeleteIssue = async (id: string) => {
    if (!confirm('確定要刪除這個問題回報嗎？')) return

    try {
      const res = await fetch('/api/admin/issue-reports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '刪除失敗')
      }

      setMessage({ type: 'success', text: '已刪除問題回報' })
      setIssueReports(prev => prev.filter(r => r.id !== id))
      setIssuesTotal(prev => prev - 1)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '刪除失敗' })
    }
  }

  // 拒絕交易記錄（改變狀態為 rejected）
  const handleRejectTransaction = async (id: string) => {
    if (!confirm('確定要拒絕這筆回報記錄嗎？')) return

    try {
      const res = await fetch('/api/admin/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '操作失敗')
      }

      setMessage({ type: 'success', text: '已拒絕回報記錄' })
      setTransactions(prev => prev.filter(t => t.id !== id))
      setPendingTransactionsCount(prev => Math.max(0, prev - 1))
      loadStats()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '操作失敗' })
    }
  }

  // 永久刪除交易記錄
  const handleDeleteTransactionPermanently = async (id: string) => {
    if (!confirm('確定要永久刪除這筆記錄嗎？此操作無法復原！')) return

    try {
      const res = await fetch('/api/admin/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '刪除失敗')
      }

      setMessage({ type: 'success', text: '已永久刪除記錄' })
      setTransactions(prev => prev.filter(t => t.id !== id))
      loadStats()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '刪除失敗' })
    }
  }

  // 確認回報並更新價格
  const handleApproveTransaction = async (id: string, figureName: string) => {
    if (!confirm(`確定要將此回報價格加入「${figureName}」的市場行情嗎？`)) return

    try {
      const res = await fetch('/api/admin/approve-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '操作失敗')
      }

      setMessage({ type: 'success', text: '已將回報價格加入市場行情！' })
      setTransactions(prev => prev.filter(t => t.id !== id))
      setPendingTransactionsCount(prev => Math.max(0, prev - 1))
      loadFigures()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '操作失敗' })
    }
  }

  // 過濾後的公仔（伺服器端已過濾，直接使用）
  const filteredFigures = figures

  // 點擊上傳按鈕
  const handleUploadClick = (figureId: string) => {
    setSelectedFigureId(figureId)
    fileInputRef.current?.click()
  }

  // 處理檔案選擇
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedFigureId) return

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: '請選擇圖片檔案' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: '圖片大小不能超過 5MB' })
      return
    }

    setUploading(selectedFigureId)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('figureId', selectedFigureId)

      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '上傳失敗')
      }

      setMessage({ type: 'success', text: '圖片上傳成功！' })
      setFigures(prev => prev.map(f =>
        f.id === selectedFigureId ? { ...f, image_url: data.imageUrl } : f
      ))
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '上傳失敗' })
    } finally {
      setUploading(null)
      setSelectedFigureId(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 開始編輯
  const handleEdit = (figure: Figure) => {
    setEditingFigure({ ...figure })
  }

  // 儲存編輯
  const handleSave = async () => {
    if (!editingFigure) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/update-figure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingFigure),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '儲存失敗')
      }

      setMessage({ type: 'success', text: '儲存成功！' })
      setFigures(prev => prev.map(f =>
        f.id === editingFigure.id ? editingFigure : f
      ))
      setEditingFigure(null)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '儲存失敗' })
    } finally {
      setSaving(false)
    }
  }

  // 新增公仔
  const handleAddFigure = async () => {
    if (!newFigure.name.trim()) {
      setMessage({ type: 'error', text: '請輸入公仔名稱' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/add-figure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFigure.name,
          manufacturer: newFigure.manufacturer || null,
          series: newFigure.series || null,
          original_price: newFigure.original_price || null,
          market_price_min: newFigure.market_price_min || null,
          market_price_max: newFigure.market_price_max || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '新增失敗')
      }

      setMessage({ type: 'success', text: '公仔新增成功！' })
      setFigures(prev => [...prev, data.figure])
      setShowAddModal(false)
      setNewFigure({
        name: '',
        manufacturer: '',
        series: '',
        original_price: '',
        market_price_min: '',
        market_price_max: '',
      })
      loadStats()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '新增失敗' })
    } finally {
      setSaving(false)
    }
  }

  // 搜尋原價
  const [fetchingPrice, setFetchingPrice] = useState<string | null>(null)

  const handleFetchOriginalPrice = async (figureId: string, figureName: string) => {
    setFetchingPrice(figureId)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/fetch-original-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figureId }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.error || '搜尋失敗'
        const details = data.searchQuery ? ` (搜尋: ${data.searchQuery})` : ''
        throw new Error(`${figureName}: ${errorMsg}${details}`)
      }

      setMessage({ type: 'success', text: `${figureName}: ${data.message}` })
      setFigures(prev => prev.map(f =>
        f.id === figureId ? { ...f, original_price: data.original_price } : f
      ))
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '搜尋失敗' })
    } finally {
      setFetchingPrice(null)
    }
  }

  // 批量搜尋原價（Google API）
  const handleFetchAllPrices = async () => {
    const figuresWithoutPrice = figures.filter(f => !f.original_price)
    if (figuresWithoutPrice.length === 0) {
      setMessage({ type: 'success', text: '所有公仔都已有原價資料' })
      return
    }

    if (!confirm(`將搜尋 ${figuresWithoutPrice.length} 個公仔的原價，這可能需要一些時間，確定要繼續嗎？`)) return

    setMessage({ type: 'success', text: `開始搜尋 ${figuresWithoutPrice.length} 個公仔的原價...` })

    let successCount = 0
    for (const figure of figuresWithoutPrice) {
      setFetchingPrice(figure.id)
      try {
        const res = await fetch('/api/admin/fetch-original-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ figureId: figure.id }),
        })

        const data = await res.json()

        if (res.ok && data.original_price) {
          setFigures(prev => prev.map(f =>
            f.id === figure.id ? { ...f, original_price: data.original_price } : f
          ))
          successCount++
        }
      } catch {
        // 繼續下一個
      }
      // 避免 API 請求過快
      await new Promise(resolve => setTimeout(resolve, 1500))
    }

    setFetchingPrice(null)
    setMessage({ type: 'success', text: `完成！成功搜尋到 ${successCount} 個公仔的原價` })
  }

  // 批量抓取原價（從 GK 網站）
  const handleScrapeAllPrices = async () => {
    const figuresWithoutPrice = figures.filter(f => !f.original_price)
    if (figuresWithoutPrice.length === 0) {
      setMessage({ type: 'success', text: '所有公仔都已有原價資料' })
      return
    }

    if (!confirm(`將從 SCC Toys、NightWind、MFC 等網站抓取 ${figuresWithoutPrice.length} 個公仔的原價，確定要繼續嗎？`)) return

    setMessage({ type: 'success', text: `開始抓取原價...` })
    setFetchingPrice('batch')

    try {
      const res = await fetch(`/api/admin/scrape-prices?limit=${Math.min(figuresWithoutPrice.length, 50)}`)
      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        loadFigures() // 重新載入列表
      } else {
        setMessage({ type: 'error', text: data.error || '抓取失敗' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: '抓取失敗' })
    } finally {
      setFetchingPrice(null)
    }
  }

  // 單一公仔抓取原價（從 GK 網站）
  const handleScrapeSinglePrice = async (figureId: string, figureName: string) => {
    setFetchingPrice(figureId)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/scrape-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figureId, figureName }),
      })

      const data = await res.json()

      if (res.ok && data.price) {
        setMessage({ type: 'success', text: `${figureName}: ${data.message}` })
        setFigures(prev => prev.map(f =>
          f.id === figureId ? { ...f, original_price: data.price } : f
        ))
      } else {
        setMessage({ type: 'error', text: `${figureName}: ${data.message || '未找到價格'}` })
      }
    } catch {
      setMessage({ type: 'error', text: '抓取失敗' })
    } finally {
      setFetchingPrice(null)
    }
  }

  // 執行爬蟲並匯入
  const handleCrawlAndImport = async () => {
    setCrawling(true)
    setCrawlResult(null)
    setCrawlProgress(null)

    try {
      // 第一步：啟動爬蟲
      setCrawlResult({ message: '正在啟動爬蟲...' })

      const crawlRes = await fetch('/api/admin/run-crawler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'crawl' }),
      })

      if (!crawlRes.ok) {
        const data = await crawlRes.json()
        setCrawlResult({ message: data.error || '啟動爬蟲失敗' })
        setCrawling(false)
        return
      }

      // 第二步：輪詢等待爬蟲完成
      let crawlCompleted = false
      while (!crawlCompleted) {
        await new Promise(resolve => setTimeout(resolve, 1000))

        try {
          const progressRes = await fetch('/api/admin/run-crawler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check-progress' }),
          })
          const progress = await progressRes.json()
          setCrawlProgress(progress)

          if (progress.status === 'completed') {
            crawlCompleted = true
          } else if (progress.status === 'error') {
            setCrawlResult({ message: progress.message || '爬取失敗' })
            setCrawling(false)
            return
          }
        } catch {
          // 繼續輪詢
        }
      }

      // 第三步：匯入資料
      setCrawlResult({ message: '爬取完成，正在匯入資料庫...' })
      setCrawlProgress(null)

      const importRes = await fetch('/api/admin/run-crawler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import' }),
      })

      const importData = await importRes.json()

      if (importRes.ok) {
        setCrawlResult({
          message: importData.message,
          inserted: importData.inserted,
          updated: importData.updated,
        })
        loadFigures()
        loadStats()
      } else {
        setCrawlResult({ message: importData.error || '匯入失敗' })
      }
    } catch {
      setCrawlResult({ message: '爬取失敗' })
    } finally {
      setCrawling(false)
    }
  }

  // 輪詢爬蟲進度
  const pollCrawlProgress = async () => {
    let isRunning = true
    while (isRunning) {
      try {
        const res = await fetch('/api/admin/run-crawler', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check-progress' }),
        })
        const progress = await res.json()
        setCrawlProgress(progress)

        if (progress.status === 'completed') {
          setCrawlResult({
            message: progress.message || '爬取完成',
            total_crawled: progress.success,
          })
          isRunning = false
          setCrawling(false)
        } else if (progress.status === 'error') {
          setCrawlResult({ message: progress.message || '爬取失敗' })
          isRunning = false
          setCrawling(false)
        } else if (progress.status === 'idle') {
          // 爬蟲可能還沒開始，繼續等待
        }

        // 每秒輪詢一次
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch {
        // 忽略錯誤，繼續輪詢
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  // 只執行爬蟲（不匯入）
  const handleCrawlOnly = async () => {
    setCrawling(true)
    setCrawlResult(null)
    setCrawlProgress(null)

    try {
      setCrawlResult({ message: '正在啟動爬蟲...' })

      const res = await fetch('/api/admin/run-crawler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'crawl' }),
      })

      const data = await res.json()

      if (res.ok) {
        setCrawlResult({ message: data.message })
        // 開始輪詢進度
        pollCrawlProgress()
      } else {
        setCrawlResult({ message: data.error || '爬取失敗' })
        setCrawling(false)
      }
    } catch {
      setCrawlResult({ message: '爬取失敗' })
      setCrawling(false)
    }
  }

  // 檢查是否為價格格式
  const isPrice = (value: string): boolean => {
    if (!value) return false
    // 移除 $、NT$、￥ 等符號和逗號後檢查是否為數字
    const cleaned = value.replace(/[$NT￥¥,，\s]/g, '')
    return /^\d+$/.test(cleaned)
  }

  // 提取價格數字
  const extractPrice = (value: string): string | undefined => {
    if (!value) return undefined
    const cleaned = value.replace(/[$NT￥¥,，\s]/g, '')
    if (/^\d+$/.test(cleaned)) {
      return cleaned
    }
    return undefined
  }

  // 解析 CSV/TSV 資料
  const parseBulkData = (input: string) => {
    const lines = input.trim().split('\n')
    if (lines.length === 0) {
      setBulkImportPreview([])
      return
    }

    // 判斷分隔符（Tab 或逗號）
    const firstLine = lines[0]
    const delimiter = firstLine.includes('\t') ? '\t' : ','

    // 找出標題行（如果有）
    let dataLines = lines
    let headers: string[] = []

    const possibleHeaders = ['名稱', 'name', '公仔名稱', '工作室', 'manufacturer', '廠商', '系列', 'series', '原價', 'original_price', '最低價', 'market_price_min', '最高價', 'market_price_max', '價格', 'price']
    const firstLineLower = firstLine.toLowerCase()
    const hasHeader = possibleHeaders.some(h => firstLineLower.includes(h.toLowerCase()))

    if (hasHeader) {
      headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase())
      dataLines = lines.slice(1)
    }

    // 解析資料
    const parsed = dataLines
      .filter(line => line.trim())
      .map(line => {
        const cols = line.split(delimiter).map(c => c.trim())

        if (headers.length > 0) {
          // 使用標題對應
          const nameIdx = headers.findIndex(h => ['名稱', 'name', '公仔名稱', '公仔'].includes(h))
          const manuIdx = headers.findIndex(h => ['工作室', 'manufacturer', '廠商', '製造商'].includes(h))
          const seriesIdx = headers.findIndex(h => ['系列', 'series', '比例'].includes(h))
          const origIdx = headers.findIndex(h => ['原價', 'original_price', '定價', '官方價格', '價格', 'price'].includes(h))
          const minIdx = headers.findIndex(h => ['最低價', 'market_price_min', '市場最低'].includes(h))
          const maxIdx = headers.findIndex(h => ['最高價', 'market_price_max', '市場最高'].includes(h))

          return {
            name: cols[nameIdx !== -1 ? nameIdx : 0] || '',
            manufacturer: cols[manuIdx] || undefined,
            series: cols[seriesIdx] || undefined,
            original_price: extractPrice(cols[origIdx]) || undefined,
            market_price_min: extractPrice(cols[minIdx]) || undefined,
            market_price_max: extractPrice(cols[maxIdx]) || undefined,
          }
        } else {
          // 無標題：智慧偵測欄位
          // 找出所有價格欄位的位置
          const priceIndices: number[] = []
          const nonPriceValues: { idx: number; value: string }[] = []

          cols.forEach((col, idx) => {
            if (isPrice(col)) {
              priceIndices.push(idx)
            } else if (col) {
              nonPriceValues.push({ idx, value: col })
            }
          })

          // 第一個非價格欄位是名稱，第二個是工作室，第三個是系列
          const name = nonPriceValues[0]?.value || ''
          const manufacturer = nonPriceValues[1]?.value || undefined
          const series = nonPriceValues[2]?.value || undefined

          // 價格欄位：1個=成交價(市場價)，2個=最低最高，3個=原價+最低最高
          let original_price: string | undefined
          let market_price_min: string | undefined
          let market_price_max: string | undefined

          if (priceIndices.length === 1) {
            // 單一價格當作成交價（市場價）
            const price = extractPrice(cols[priceIndices[0]])
            market_price_min = price
            market_price_max = price
          } else if (priceIndices.length === 2) {
            const p1 = parseInt(extractPrice(cols[priceIndices[0]]) || '0')
            const p2 = parseInt(extractPrice(cols[priceIndices[1]]) || '0')
            market_price_min = String(Math.min(p1, p2))
            market_price_max = String(Math.max(p1, p2))
          } else if (priceIndices.length >= 3) {
            original_price = extractPrice(cols[priceIndices[0]])
            const p2 = parseInt(extractPrice(cols[priceIndices[1]]) || '0')
            const p3 = parseInt(extractPrice(cols[priceIndices[2]]) || '0')
            market_price_min = String(Math.min(p2, p3))
            market_price_max = String(Math.max(p2, p3))
          }

          return {
            name,
            manufacturer,
            series,
            original_price,
            market_price_min,
            market_price_max,
          }
        }
      })
      .filter(item => item.name)

    setBulkImportPreview(parsed)
  }

  // PDF 檔案上傳處理
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setMessage({ type: 'error', text: '請選擇 PDF 檔案' })
      return
    }

    setPdfUploading(true)
    setPdfPreview([])
    setPdfRawText('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '解析失敗')
      }

      setPdfPreview(data.figures)
      setPdfRawText(data.rawTextPreview || '')
      const aiLabel = data.aiEnhanced ? ' (AI 分析)' : ' (regex)'
      setMessage({
        type: 'success',
        text: `PDF 解析完成：共 ${data.totalPages} 頁，找到 ${data.figures.length} 個公仔${aiLabel}`
      })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '解析失敗' })
    } finally {
      setPdfUploading(false)
      if (pdfInputRef.current) {
        pdfInputRef.current.value = ''
      }
    }
  }

  // 通用串流匯入函數
  const streamingImport = async (
    importData: Array<{ name: string; manufacturer?: string; series?: string; original_price?: string; market_price_min?: string; market_price_max?: string }>,
    onComplete: () => void
  ) => {
    setBulkImporting(true)
    setImportProgress(null)

    try {
      const res = await fetch('/api/admin/bulk-import?stream=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: importData }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || '匯入失敗')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('無法讀取串流')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'progress') {
                setImportProgress({
                  current: data.current,
                  total: data.total,
                  stage: `新增: ${data.inserted} / 更新: ${data.updated}`
                })
              } else if (data.type === 'complete') {
                setMessage({ type: 'success', text: data.message })
                onComplete()
                loadFigures()
                loadStats()
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch {
              // 忽略解析錯誤
            }
          }
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '匯入失敗' })
    } finally {
      setBulkImporting(false)
      setImportProgress(null)
    }
  }

  // 匯入 PDF 解析結果
  const handlePdfImport = async () => {
    if (pdfPreview.length === 0) {
      setMessage({ type: 'error', text: '沒有資料可匯入' })
      return
    }

    const importData = pdfPreview.map(item => ({
      name: item.name,
      manufacturer: item.manufacturer || undefined,
      series: item.scale || item.version || undefined,
      // PDF 的價格是賣家售價，存入市場價格而非官方原價
      market_price_min: item.price ? String(item.price) : undefined,
      market_price_max: item.price ? String(item.price) : undefined,
    }))

    await streamingImport(importData, () => {
      setShowPdfImportModal(false)
      setPdfPreview([])
      setPdfRawText('')
    })
  }

  // OCR 圖片上傳處理（支援串流進度）
  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
    const validFiles = Array.from(files).filter(f =>
      allowedExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
    )

    if (validFiles.length === 0) {
      setMessage({ type: 'error', text: '請選擇圖片檔案（支援 JPG、PNG、GIF、BMP、WebP）' })
      return
    }

    setOcrUploading(true)
    setOcrPreview([])
    setOcrRawText('')
    setOcrProgress(null)

    try {
      const formData = new FormData()
      validFiles.forEach(file => formData.append('files', file))

      // 使用串流模式
      const res = await fetch('/api/ocr-image?stream=true', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'OCR 辨識失敗')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('無法讀取串流')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'progress') {
                setOcrProgress({
                  current: data.current,
                  total: data.total,
                  currentFile: data.currentFile
                })
              } else if (data.type === 'complete') {
                setOcrPreview(data.figures)
                setOcrRawText(data.rawTextPreview || '')
                setMessage({
                  type: 'success',
                  text: `OCR 辨識完成：共處理 ${data.totalImages} 張圖片，找到 ${data.figures.length} 個公仔`
                })
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch (parseErr) {
              // 忽略解析錯誤
            }
          }
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'OCR 辨識失敗' })
    } finally {
      setOcrUploading(false)
      setOcrProgress(null)
      if (ocrInputRef.current) {
        ocrInputRef.current.value = ''
      }
    }
  }

  // 匯入 OCR 解析結果
  const handleOcrImport = async () => {
    if (ocrPreview.length === 0) {
      setMessage({ type: 'error', text: '沒有資料可匯入' })
      return
    }

    const importData = ocrPreview.map(item => ({
      name: item.name,
      manufacturer: item.manufacturer || undefined,
      series: item.scale || item.version || undefined,
      // OCR 的價格是賣家售價，存入市場價格而非官方原價
      market_price_min: item.price ? String(item.price) : undefined,
      market_price_max: item.price ? String(item.price) : undefined,
    }))

    await streamingImport(importData, () => {
      setShowOcrImportModal(false)
      setOcrPreview([])
      setOcrRawText('')
    })
  }

  // 執行批量匯入
  const handleBulkImport = async () => {
    if (bulkImportPreview.length === 0) {
      setMessage({ type: 'error', text: '沒有資料可匯入' })
      return
    }

    setBulkImporting(true)
    try {
      const res = await fetch('/api/admin/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: bulkImportPreview }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '匯入失敗')
      }

      let msg = data.message
      if (data.errors && data.errors.length > 0) {
        msg += `（${data.errors.length} 筆錯誤）`
      }

      setMessage({ type: 'success', text: msg })
      setShowBulkImportModal(false)
      setBulkImportData('')
      setBulkImportPreview([])
      loadFigures()
      loadStats()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '匯入失敗' })
    } finally {
      setBulkImporting(false)
    }
  }

  // 清除所有公仔資料
  const handleClearAllFigures = async () => {
    if (!confirm('確定要清除所有公仔資料嗎？此操作會刪除所有公仔和回報記錄，無法復原！')) return
    if (!confirm('再次確認：這會刪除資料庫中的所有公仔資料，確定要繼續嗎？')) return

    setMessage({ type: 'success', text: '正在清除資料...' })

    try {
      const res = await fetch('/api/admin/clear-figures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_ALL_FIGURES' }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '清除失敗')
      }

      setMessage({ type: 'success', text: '已清除所有公仔資料！請重新匯入正確的資料。' })
      setFigures([])
      setTransactions([])
      loadStats()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '清除失敗' })
    }
  }

  // 刪除公仔
  const handleDelete = async (figureId: string, figureName: string) => {
    if (!confirm(`確定要刪除「${figureName}」嗎？此操作無法復原！`)) return

    try {
      const res = await fetch('/api/admin/delete-figure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figureId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '刪除失敗')
      }

      setMessage({ type: 'success', text: '公仔已刪除' })
      setFigures(prev => prev.filter(f => f.id !== figureId))
      loadStats()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '刪除失敗' })
    }
  }

  // 批量刪除公仔
  const handleBulkDelete = async () => {
    const count = figures.length
    const filterName = figureFilter === 'no_image' ? '缺少圖片' :
                       figureFilter === 'no_price' ? '缺少原價' :
                       figureFilter === 'no_both' ? '缺少圖片+原價' :
                       figureFilter === 'today' ? '今天新增' :
                       figureFilter === 'yesterday' ? '昨天新增' :
                       figureFilter === 'this_week' ? '本週新增' : ''

    if (!confirm(`確定要刪除全部 ${count} 個「${filterName}」的公仔嗎？\n\n此操作無法復原！`)) return

    setMessage({ type: 'info', text: `正在刪除 ${count} 個公仔...` })

    try {
      const ids = figures.map(f => f.id)
      const res = await fetch('/api/admin/figures', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '刪除失敗')
      }

      setMessage({ type: 'success', text: `已刪除 ${data.deleted} 個公仔` })
      setFigures([])
      loadStats()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '刪除失敗' })
    }
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 檢查登入中
  if (checkingAuth) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-black border-t-transparent rounded-full" />
      </div>
    )
  }

  // 登入頁面
  if (!isLoggedIn) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center mb-8">管理員登入</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入管理員密碼"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-black focus:outline-none"
                autoFocus
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-sm">{loginError}</p>
            )}
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

  // 載入中
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-black border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <main className="min-h-dvh pb-8 bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">GK收藏家管理後台</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-black"
          >
            登出
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-gray-100">
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'stats'
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            統計概覽
          </button>
          <button
            onClick={() => setActiveTab('figures')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'figures'
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            公仔管理
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'transactions'
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            回報記錄
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'issues'
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            問題回報
          </button>
        </div>
      </header>

      {/* Message */}
      {message && (
        <div className={`mx-4 mt-4 p-3 rounded-xl ${
          message.type === 'success' ? 'bg-green-100 text-green-700' :
          message.type === 'info' ? 'bg-blue-100 text-blue-700' :
          'bg-red-100 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <section className="px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">平台統計</h2>
            <div className="flex items-center gap-2 text-xs text-green-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              即時監控中
            </div>
          </div>

          {stats ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.unique_users}</p>
                <p className="text-sm opacity-80">總使用人數</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.transactions_count}</p>
                <p className="text-sm opacity-80">總回報數</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.figures_count}</p>
                <p className="text-sm opacity-80">公仔數量</p>
              </div>
              <div className="bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.with_price_count}</p>
                <p className="text-sm opacity-80">有原價資料</p>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.today_transactions}</p>
                <p className="text-sm opacity-80">今日回報</p>
              </div>
              <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.figures_count > 0 ? Math.round((stats.with_price_count / stats.figures_count) * 100) : 0}%</p>
                <p className="text-sm opacity-80">原價覆蓋率</p>
              </div>
              <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.with_image_count}</p>
                <p className="text-sm opacity-80">有照片 📷</p>
              </div>
              <div className="bg-gradient-to-br from-gray-500 to-gray-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.without_image_count}</p>
                <p className="text-sm opacity-80">無照片 🚫</p>
              </div>
              <div className="bg-gradient-to-br from-rose-500 to-rose-600 text-white rounded-xl p-4">
                <p className="text-3xl font-bold">{stats.pwa_installs}</p>
                <p className="text-sm opacity-80">主畫面安裝數</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">載入中...</p>
          )}

          {/* 每日訪客統計 */}
          {stats && (
            <div className="mt-6">
              <h3 className="font-medium mb-3">每日訪客（IP 去重）</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl p-4">
                  <p className="text-3xl font-bold">{stats.today_visitors}</p>
                  <p className="text-sm opacity-80">今日訪客</p>
                </div>
                <div className="bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-xl p-4">
                  <p className="text-3xl font-bold">{stats.yesterday_visitors}</p>
                  <p className="text-sm opacity-80">昨日訪客</p>
                </div>
              </div>

              {/* 近 7 天訪客趨勢條狀圖 */}
              {stats.weekly_visitors && stats.weekly_visitors.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-gray-600 mb-3">近 7 天訪客趨勢</h4>
                  <div className="flex items-end gap-2 h-32">
                    {(() => {
                      const maxCount = Math.max(...stats.weekly_visitors.map(d => d.count), 1)
                      return stats.weekly_visitors.map((day) => (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-gray-700">{day.count}</span>
                          <div
                            className="w-full bg-indigo-500 rounded-t-md transition-all duration-300"
                            style={{
                              height: `${Math.max((day.count / maxCount) * 100, 4)}%`,
                              minHeight: '4px',
                            }}
                          />
                          <span className="text-[10px] text-gray-400">
                            {day.date.slice(5).replace('-', '/')}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 bg-gray-50 rounded-xl p-4">
            <h3 className="font-medium mb-3">快速資訊</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">本週回報數</span>
                <span className="font-medium">{stats?.week_transactions || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">圖片覆蓋率</span>
                <span className="font-medium">{stats && stats.figures_count > 0 ? Math.round((stats.with_image_count / stats.figures_count) * 100) : 0}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">平均每位使用者回報</span>
                <span className="font-medium">
                  {stats && stats.unique_users > 0
                    ? (stats.transactions_count / stats.unique_users).toFixed(1)
                    : 0} 筆
                </span>
              </div>
            </div>
          </div>

        </section>
      )}

      {/* Figures Tab */}
      {activeTab === 'figures' && (
        <>
          {/* Search */}
          <section className="px-4 py-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋公仔名稱、工作室或系列..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-black focus:outline-none"
            />
          </section>

          {/* Filter */}
          <section className="px-4 mb-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {[
                { value: 'all', label: '全部' },
                { value: 'today', label: '今天新增', color: 'bg-green-100 text-green-700' },
                { value: 'yesterday', label: '昨天新增', color: 'bg-blue-100 text-blue-700' },
                { value: 'this_week', label: '本週新增', color: 'bg-cyan-100 text-cyan-700' },
                { value: 'has_image', label: '已有圖片', color: 'bg-green-100 text-green-700' },
                { value: 'no_image', label: '缺少圖片', color: 'bg-orange-100 text-orange-700' },
                { value: 'no_price', label: '缺少原價', color: 'bg-red-100 text-red-700' },
                { value: 'no_both', label: '缺少圖片+原價', color: 'bg-purple-100 text-purple-700' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setFigureFilter(option.value)
                    loadFigures(searchQuery, option.value)
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
                    figureFilter === option.value
                      ? 'bg-black text-white'
                      : option.color || 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                  {option.value !== 'all' && figureFilter === option.value && (
                    <span className="ml-1">({figures.length})</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Stats */}
          <section className="px-4 mb-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-4 text-sm text-gray-500">
                <span>共 {figures.length} 個公仔</span>
                <span>有原價 {figures.filter(f => f.original_price).length} 個</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  + 新增公仔
                </button>
                <button
                  onClick={() => setShowBulkImportModal(true)}
                  className="px-3 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  批量匯入
                </button>
                <button
                  onClick={() => setShowPdfImportModal(true)}
                  className="px-3 py-1.5 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                >
                  PDF 匯入
                </button>
                <button
                  onClick={() => setShowOcrImportModal(true)}
                  className="px-3 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  圖片 OCR
                </button>
                {figureFilter !== 'all' && figures.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    刪除全部 ({figures.length})
                  </button>
                )}
                <button
                  onClick={() => setShowCrawlModal(true)}
                  className="px-3 py-1.5 text-xs bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  爬取 GK 網站
                </button>
                <button
                  onClick={handleClearAllFigures}
                  className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-lg hover:bg-black"
                >
                  清除全部資料
                </button>
              </div>
            </div>
          </section>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Figure List */}
          <section className="px-4">
            <div className="space-y-3">
              {filteredFigures.map((figure) => (
                <div
                  key={figure.id}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex gap-4">
                    {/* Image */}
                    <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden relative">
                      {figure.image_url ? (
                        <Image
                          src={figure.image_url}
                          alt={figure.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-700 font-medium">GK</span>
                        {figure.tag && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-indigo-100 text-indigo-700">{figure.tag}</span>
                        )}
                        <h3 className="font-medium text-black truncate">
                          {figure.name}
                          {figure.version && <span className="ml-1 text-sm font-normal text-purple-600">[{figure.version}]</span>}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-500 truncate mt-0.5">
                        {figure.manufacturer || '未知工作室'}
                      </p>
                      <p className="text-xs text-gray-400">{figure.series || ''}</p>
                      {(figureFilter === 'today' || figureFilter === 'yesterday' || figureFilter === 'this_week') && figure.created_at && (
                        <p className="text-xs text-green-600 mt-0.5">
                          新增於 {new Date(figure.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1 text-xs">
                        {figure.original_price ? (
                          <span className="text-blue-600">原價 NT$ {figure.original_price.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-300">無原價</span>
                        )}
                        {figure.market_price_min !== null && figure.market_price_max !== null && (
                          <span className="text-gray-400">
                            市場 NT$ {figure.market_price_min.toLocaleString()}
                            {figure.market_price_min !== figure.market_price_max && ` - ${figure.market_price_max.toLocaleString()}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => handleUploadClick(figure.id)}
                        disabled={uploading === figure.id}
                        className="px-2 py-1 text-xs bg-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
                      >
                        {uploading === figure.id ? '...' : figure.image_url ? '換圖' : '上傳'}
                      </button>
                      <button
                        onClick={() => handleScrapeSinglePrice(figure.id, figure.name)}
                        disabled={fetchingPrice === figure.id}
                        className="px-2 py-1 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300"
                      >
                        {fetchingPrice === figure.id ? '...' : '抓原價'}
                      </button>
                      <button
                        onClick={() => handleEdit(figure)}
                        className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleDelete(figure.id, figure.name)}
                        className="px-2 py-1 text-xs border border-red-300 text-red-500 rounded-lg hover:bg-red-50"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {filteredFigures.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              找不到符合的公仔
            </div>
          )}
        </>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <section className="px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">
              玩家回報記錄
              {pendingTransactionsCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                  {pendingTransactionsCount} 待審核
                </span>
              )}
            </h2>
            <span className="text-sm text-gray-500">共 {transactionsTotal} 筆</span>
          </div>

          {/* 篩選器 */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { value: 'pending', label: '待審核' },
              { value: 'approved', label: '已批准' },
              { value: 'rejected', label: '已拒絕' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setTransactionFilter(option.value)
                  loadTransactions(option.value)
                }}
                className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
                  transactionFilter === option.value
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {transactionsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-black border-t-transparent rounded-full mx-auto" />
            </div>
          ) : transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-700 font-medium">GK</span>
                        <h3 className="font-medium text-black truncate">
                          {tx.figures?.name || '未知公仔'}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {tx.figures?.manufacturer || '未知工作室'}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-sm">
                        <span className="font-medium text-green-600">
                          NT$ {tx.price.toLocaleString()}
                        </span>
                        {tx.source && (
                          <span className="text-gray-400">來源：{tx.source}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>{formatDate(tx.created_at)}</span>
                        <span>ID: {tx.ip_hash.slice(0, 8)}...</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {tx.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleApproveTransaction(tx.id, tx.figures?.name || '未知公仔')}
                            className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                          >
                            批准
                          </button>
                          <button
                            onClick={() => handleRejectTransaction(tx.id)}
                            className="px-3 py-1.5 text-xs border border-orange-300 text-orange-500 rounded-lg hover:bg-orange-50 transition-colors"
                          >
                            拒絕
                          </button>
                        </>
                      ) : (
                        <span className={`px-2 py-1 text-xs rounded ${
                          tx.status === 'approved'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {tx.status === 'approved' ? '已批准' : '已拒絕'}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteTransactionPermanently(tx.id)}
                        className="px-3 py-1.5 text-xs border border-red-300 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              還沒有任何回報記錄
            </div>
          )}
        </section>
      )}

      {/* Issues Tab */}
      {activeTab === 'issues' && (
        <section className="px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">問題回報</h2>
            <span className="text-sm text-gray-500">共 {issuesTotal} 筆</span>
          </div>

          {/* 篩選器 */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { value: 'all', label: '全部' },
              { value: 'pending', label: '待處理' },
              { value: 'in_progress', label: '處理中' },
              { value: 'resolved', label: '已解決' },
              { value: 'closed', label: '已關閉' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setIssueFilter(option.value)
                  loadIssueReports(option.value)
                }}
                className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
                  issueFilter === option.value
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {issuesLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-black border-t-transparent rounded-full mx-auto" />
            </div>
          ) : issueReports.length > 0 ? (
            <div className="space-y-3">
              {issueReports.map((issue) => (
                <div
                  key={issue.id}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        issue.type === 'bug' ? 'bg-red-100 text-red-700' :
                        issue.type === 'data_error' ? 'bg-orange-100 text-orange-700' :
                        issue.type === 'suggestion' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {issue.type === 'bug' ? '功能異常' :
                         issue.type === 'data_error' ? '資料錯誤' :
                         issue.type === 'suggestion' ? '功能建議' : '其他'}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        issue.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        issue.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        issue.status === 'resolved' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {issue.status === 'pending' ? '待處理' :
                         issue.status === 'in_progress' ? '處理中' :
                         issue.status === 'resolved' ? '已解決' : '已關閉'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(issue.created_at)}</span>
                  </div>

                  <h3 className="font-medium text-black mb-1">{issue.title}</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{issue.description}</p>

                  {issue.contact && (
                    <p className="text-xs text-gray-400 mb-3">聯絡方式: {issue.contact}</p>
                  )}

                  {issue.admin_note && (
                    <div className="bg-gray-50 rounded-lg p-2 mb-3">
                      <p className="text-xs text-gray-500">管理員備註: {issue.admin_note}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <select
                      value={issue.status}
                      onChange={(e) => handleUpdateIssueStatus(issue.id, e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none"
                    >
                      <option value="pending">待處理</option>
                      <option value="in_progress">處理中</option>
                      <option value="resolved">已解決</option>
                      <option value="closed">已關閉</option>
                    </select>
                    <button
                      onClick={() => handleDeleteIssue(issue.id)}
                      className="px-2 py-1 text-xs border border-red-300 text-red-500 rounded-lg hover:bg-red-50"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              沒有問題回報
            </div>
          )}
        </section>
      )}

      {/* Edit Modal */}
      {editingFigure && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">編輯公仔資訊</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">名稱</label>
                <input
                  type="text"
                  value={editingFigure.name}
                  onChange={(e) => setEditingFigure({ ...editingFigure, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">工作室/廠商</label>
                <input
                  type="text"
                  value={editingFigure.manufacturer || ''}
                  onChange={(e) => setEditingFigure({ ...editingFigure, manufacturer: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">系列/比例</label>
                <input
                  type="text"
                  value={editingFigure.series || ''}
                  onChange={(e) => setEditingFigure({ ...editingFigure, series: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">系列標籤</label>
                <input
                  type="text"
                  value={editingFigure.tag || ''}
                  onChange={(e) => setEditingFigure({ ...editingFigure, tag: e.target.value || null })}
                  placeholder="例：海賊王、七龍珠"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">官方原價</label>
                <input
                  type="number"
                  value={editingFigure.original_price || ''}
                  onChange={(e) => setEditingFigure({ ...editingFigure, original_price: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">市場最低價</label>
                  <input
                    type="number"
                    value={editingFigure.market_price_min || ''}
                    onChange={(e) => setEditingFigure({ ...editingFigure, market_price_min: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">市場最高價</label>
                  <input
                    type="number"
                    value={editingFigure.market_price_max || ''}
                    onChange={(e) => setEditingFigure({ ...editingFigure, market_price_max: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingFigure(null)}
                className="flex-1 py-2 border border-gray-200 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editingFigure.name}
                className="flex-1 py-2 bg-black text-white rounded-xl disabled:bg-gray-300"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Figure Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">新增公仔</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">名稱 *</label>
                <input
                  type="text"
                  value={newFigure.name}
                  onChange={(e) => setNewFigure({ ...newFigure, name: e.target.value })}
                  placeholder="例：魯夫 四檔"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">工作室/廠商</label>
                <input
                  type="text"
                  value={newFigure.manufacturer}
                  onChange={(e) => setNewFigure({ ...newFigure, manufacturer: e.target.value })}
                  placeholder="例：G5 Studio"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">系列/比例</label>
                <input
                  type="text"
                  value={newFigure.series}
                  onChange={(e) => setNewFigure({ ...newFigure, series: e.target.value })}
                  placeholder="例：1/6、海賊王系列"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">官方原價 (NT$)</label>
                <input
                  type="number"
                  value={newFigure.original_price}
                  onChange={(e) => setNewFigure({ ...newFigure, original_price: e.target.value })}
                  placeholder="例：12000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">市場最低價</label>
                  <input
                    type="number"
                    value={newFigure.market_price_min}
                    onChange={(e) => setNewFigure({ ...newFigure, market_price_min: e.target.value })}
                    placeholder="例：10000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">市場最高價</label>
                  <input
                    type="number"
                    value={newFigure.market_price_max}
                    onChange={(e) => setNewFigure({ ...newFigure, market_price_max: e.target.value })}
                    placeholder="例：15000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setNewFigure({
                    name: '',
                    manufacturer: '',
                    series: '',
                    original_price: '',
                    market_price_min: '',
                    market_price_max: '',
                  })
                }}
                className="flex-1 py-2 border border-gray-200 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleAddFigure}
                disabled={saving || !newFigure.name.trim()}
                className="flex-1 py-2 bg-green-500 text-white rounded-xl disabled:bg-gray-300 hover:bg-green-600"
              >
                {saving ? '新增中...' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crawl Modal */}
      {showCrawlModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-2">自動爬取 GK 原價</h3>
            <p className="text-sm text-gray-500 mb-4">
              從 SCC Toys 網站自動抓取公仔名稱、工作室、原價並匯入資料庫
            </p>

            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <p className="font-medium text-blue-700">目前支援的網站：</p>
                <ul className="text-blue-600 mt-1 space-y-1">
                  <li>• SCC Toys (scctoys.com.tw) - GK 現貨/預購</li>
                  <li>• NightWind Shop (nightwindshop.com) - GK 現貨/預購</li>
                </ul>
                <p className="text-xs text-blue-500 mt-2">
                  會自動過濾掉裝飾畫、冰箱貼、鑰匙圈等非公仔商品
                </p>
              </div>

              {/* 進度顯示 */}
              {crawling && crawlProgress && crawlProgress.status === 'running' && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    <span className="font-medium text-blue-700">{crawlProgress.site || '爬蟲'}</span>
                    <span className="text-sm text-blue-600">- {crawlProgress.phase}</span>
                  </div>

                  {/* 進度條 */}
                  {crawlProgress.total > 0 && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-blue-600 mb-1">
                        <span>進度: {crawlProgress.current} / {crawlProgress.total}</span>
                        <span>{Math.round((crawlProgress.current / crawlProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(crawlProgress.current / crawlProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* 當前處理項目 */}
                  {crawlProgress.currentItem && (
                    <p className="text-xs text-blue-600 truncate">
                      處理中: {crawlProgress.currentItem}
                    </p>
                  )}

                  {/* 統計資訊 */}
                  <div className="flex gap-4 mt-2 text-xs">
                    {crawlProgress.collected > 0 && (
                      <span className="text-gray-600">已收集: {crawlProgress.collected}</span>
                    )}
                    {crawlProgress.success > 0 && (
                      <span className="text-green-600">成功: {crawlProgress.success}</span>
                    )}
                    {crawlProgress.errors > 0 && (
                      <span className="text-red-600">錯誤: {crawlProgress.errors}</span>
                    )}
                  </div>
                </div>
              )}

              {/* 結果顯示 */}
              {crawlResult && !crawling && (
                <div className={`p-3 rounded-lg ${crawlResult.inserted !== undefined ? 'bg-green-50' : crawlResult.total_crawled !== undefined ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <p className="font-medium text-sm">{crawlResult.message}</p>
                  {crawlResult.inserted !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      新增 {crawlResult.inserted} 筆，更新 {crawlResult.updated} 筆
                    </p>
                  )}
                  {crawlResult.total_crawled !== undefined && crawlResult.inserted === undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                      共爬取 {crawlResult.total_crawled} 筆資料
                    </p>
                  )}
                </div>
              )}

              {/* 爬蟲執行中的訊息 */}
              {crawling && (!crawlProgress || crawlProgress.status !== 'running') && crawlResult && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full"></div>
                    <p className="text-sm">{crawlResult.message}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCrawlModal(false)
                  setCrawlResult(null)
                }}
                className="flex-1 py-2 border border-gray-200 rounded-xl"
              >
                關閉
              </button>
              <button
                onClick={handleCrawlOnly}
                disabled={crawling}
                className="flex-1 py-2 border border-orange-500 text-orange-500 rounded-xl hover:bg-orange-50 disabled:opacity-50"
              >
                {crawling ? '執行中...' : '只爬取'}
              </button>
              <button
                onClick={handleCrawlAndImport}
                disabled={crawling}
                className="flex-1 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:bg-gray-300"
              >
                {crawling ? '執行中...' : '爬取並匯入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-2">批量匯入公仔</h3>
            <p className="text-sm text-gray-500 mb-4">
              從 Google 試算表複製資料後貼上（支援 Tab 或逗號分隔）
            </p>

            <div className="mb-4">
              <div className="text-xs text-gray-400 mb-2">
                格式：名稱, 工作室, 系列, 原價, 最低價, 最高價（可包含標題行）
              </div>
              <textarea
                value={bulkImportData}
                onChange={(e) => {
                  setBulkImportData(e.target.value)
                  parseBulkData(e.target.value)
                }}
                placeholder={`範例：
名稱\t工作室\t系列\t原價\t最低價\t最高價
魯夫 四檔\tG5 Studio\t1/6\t12000\t10000\t15000
索隆 三刀流\tMega House\t1/8\t8500\t7000\t9000`}
                className="w-full h-40 px-3 py-2 border border-gray-200 rounded-lg focus:border-black focus:outline-none font-mono text-sm"
              />
            </div>

            {/* Preview */}
            {bulkImportPreview.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">預覽 ({bulkImportPreview.length} 筆資料)</span>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left">名稱</th>
                        <th className="px-2 py-1.5 text-left">工作室</th>
                        <th className="px-2 py-1.5 text-left">系列</th>
                        <th className="px-2 py-1.5 text-right">原價</th>
                        <th className="px-2 py-1.5 text-right">最低</th>
                        <th className="px-2 py-1.5 text-right">最高</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bulkImportPreview.slice(0, 10).map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 max-w-[120px] truncate">{item.name}</td>
                          <td className="px-2 py-1.5 text-gray-500 max-w-[80px] truncate">{item.manufacturer || '-'}</td>
                          <td className="px-2 py-1.5 text-gray-500 max-w-[60px] truncate">{item.series || '-'}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{item.original_price || '-'}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{item.market_price_min || '-'}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{item.market_price_max || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bulkImportPreview.length > 10 && (
                    <div className="px-2 py-1.5 text-xs text-gray-400 text-center bg-gray-50">
                      還有 {bulkImportPreview.length - 10} 筆資料...
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBulkImportModal(false)
                  setBulkImportData('')
                  setBulkImportPreview([])
                }}
                className="flex-1 py-2 border border-gray-200 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleBulkImport}
                disabled={bulkImporting || bulkImportPreview.length === 0}
                className="flex-1 py-2 bg-purple-500 text-white rounded-xl disabled:bg-gray-300 hover:bg-purple-600"
              >
                {bulkImporting ? '匯入中...' : `匯入 ${bulkImportPreview.length} 筆資料`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Import Modal */}
      {showPdfImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-2">PDF 匯入公仔</h3>
            <p className="text-sm text-gray-500 mb-4">
              上傳含有公仔資訊的 PDF 檔案，系統會自動提取公仔名稱、工作室、價格等資訊
            </p>

            {/* Hidden PDF input */}
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />

            {/* Upload Button */}
            <div className="mb-4">
              <button
                onClick={() => pdfInputRef.current?.click()}
                disabled={pdfUploading}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50"
              >
                {pdfUploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                    解析中...
                  </span>
                ) : (
                  <span className="text-gray-500">
                    點擊選擇 PDF 檔案或拖放至此
                  </span>
                )}
              </button>
            </div>

            {/* Preview */}
            {pdfPreview.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">解析結果 ({pdfPreview.length} 筆資料)</span>
                  <button
                    onClick={() => {
                      setPdfPreview([])
                      setPdfRawText('')
                    }}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    清除
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left">名稱</th>
                        <th className="px-2 py-1.5 text-left">工作室</th>
                        <th className="px-2 py-1.5 text-right">價格</th>
                        <th className="px-2 py-1.5 text-left">版本</th>
                        <th className="px-2 py-1.5 text-left">比例</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pdfPreview.slice(0, 20).map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 max-w-[150px] truncate">{item.name}</td>
                          <td className="px-2 py-1.5 text-gray-500 max-w-[80px] truncate">{item.manufacturer || '-'}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">
                            {item.price ? `NT$ ${item.price.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-500 max-w-[60px] truncate">{item.version || '-'}</td>
                          <td className="px-2 py-1.5 text-gray-500">{item.scale || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pdfPreview.length > 20 && (
                    <div className="px-2 py-1.5 text-xs text-gray-400 text-center bg-gray-50">
                      還有 {pdfPreview.length - 20} 筆資料...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Raw Text Preview (Collapsible) */}
            {pdfRawText && (
              <details className="mb-4">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                  查看原始文字（除錯用）
                </summary>
                <pre className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-500 max-h-32 overflow-auto whitespace-pre-wrap">
                  {pdfRawText}
                </pre>
              </details>
            )}

            {/* Import Progress Bar */}
            {importProgress && (
              <div className="mb-4 p-3 bg-indigo-50 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-indigo-700">
                    正在匯入第 {importProgress.current} / {importProgress.total} 筆
                  </span>
                  <span className="text-xs text-indigo-500">
                    {Math.round((importProgress.current / importProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-2.5">
                  <div
                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-indigo-500">
                  {importProgress.stage}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPdfImportModal(false)
                  setPdfPreview([])
                  setPdfRawText('')
                }}
                disabled={bulkImporting}
                className="flex-1 py-2 border border-gray-200 rounded-xl disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handlePdfImport}
                disabled={bulkImporting || pdfPreview.length === 0}
                className="flex-1 py-2 bg-indigo-500 text-white rounded-xl disabled:bg-gray-300 hover:bg-indigo-600"
              >
                {bulkImporting ? '匯入中...' : `匯入 ${pdfPreview.length} 筆資料`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCR Image Import Modal */}
      {showOcrImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-2">圖片 OCR 匯入公仔</h3>
            <p className="text-sm text-gray-500 mb-4">
              上傳含有公仔資訊的圖片檔案，系統會使用 OCR 辨識文字並提取公仔名稱、工作室、價格等資訊。
              <br />
              <span className="text-purple-500">適用於：FB 社團截圖、LINE 群組截圖等圖片</span>
              <br />
              <span className="text-orange-500 text-xs">注意：如要處理圖片型 PDF，請先截圖或用線上工具轉成圖片</span>
            </p>

            {/* Hidden OCR input */}
            <input
              ref={ocrInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.bmp,.webp"
              multiple
              onChange={handleOcrUpload}
              className="hidden"
            />

            {/* Upload Button */}
            <div className="mb-4">
              <button
                onClick={() => ocrInputRef.current?.click()}
                disabled={ocrUploading}
                className="w-full py-4 border-2 border-dashed border-purple-300 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50"
              >
                {ocrUploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
                    OCR 辨識中...
                  </span>
                ) : (
                  <span className="text-gray-500">
                    點擊選擇圖片檔案（可多選）
                  </span>
                )}
              </button>
            </div>

            {/* Progress Bar */}
            {ocrProgress && (
              <div className="mb-4 p-3 bg-purple-50 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-purple-700">
                    正在辨識第 {ocrProgress.current} / {ocrProgress.total} 張圖片
                  </span>
                  <span className="text-xs text-purple-500">
                    {Math.round((ocrProgress.current / ocrProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2.5">
                  <div
                    className="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-purple-500 truncate">
                  {ocrProgress.currentFile}
                </div>
              </div>
            )}

            {/* Preview */}
            {ocrPreview.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">OCR 辨識結果 ({ocrPreview.length} 筆資料)</span>
                  <button
                    onClick={() => {
                      setOcrPreview([])
                      setOcrRawText('')
                    }}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    清除
                  </button>
                </div>
                <div className="max-h-60 overflow-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">名稱</th>
                        <th className="text-left px-2 py-1.5 font-medium">工作室</th>
                        <th className="text-right px-2 py-1.5 font-medium">價格</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ocrPreview.slice(0, 20).map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 max-w-[150px] truncate">{item.name}</td>
                          <td className="px-2 py-1.5 text-gray-500 max-w-[80px] truncate">{item.manufacturer || '-'}</td>
                          <td className="px-2 py-1.5 text-right text-green-600">
                            {item.price ? `$${item.price.toLocaleString()}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ocrPreview.length > 20 && (
                    <div className="px-2 py-1.5 text-xs text-gray-400 text-center bg-gray-50">
                      還有 {ocrPreview.length - 20} 筆資料...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Raw Text Preview (Collapsible) */}
            {ocrRawText && (
              <details className="mb-4">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                  查看 OCR 原始文字（除錯用）
                </summary>
                <pre className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-500 max-h-32 overflow-auto whitespace-pre-wrap">
                  {ocrRawText}
                </pre>
              </details>
            )}

            {/* Import Progress Bar */}
            {importProgress && (
              <div className="mb-4 p-3 bg-purple-50 rounded-xl">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-purple-700">
                    正在匯入第 {importProgress.current} / {importProgress.total} 筆
                  </span>
                  <span className="text-xs text-purple-500">
                    {Math.round((importProgress.current / importProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-purple-200 rounded-full h-2.5">
                  <div
                    className="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-purple-500">
                  {importProgress.stage}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowOcrImportModal(false)
                  setOcrPreview([])
                  setOcrRawText('')
                }}
                disabled={bulkImporting}
                className="flex-1 py-2 border border-gray-200 rounded-xl disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleOcrImport}
                disabled={bulkImporting || ocrPreview.length === 0}
                className="flex-1 py-2 bg-purple-500 text-white rounded-xl disabled:bg-gray-300 hover:bg-purple-600"
              >
                {bulkImporting ? '匯入中...' : `匯入 ${ocrPreview.length} 筆資料`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 活動審核懸浮按鈕 */}
      <a
        href="/admin/lottery-management"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
        活動審核
      </a>
    </main>
  )
}
