import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

// 清除所有公仔資料（保留交易記錄）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { confirm } = body

    if (confirm !== 'DELETE_ALL_FIGURES') {
      return NextResponse.json(
        { error: '請確認刪除操作' },
        { status: 400 }
      )
    }

    // 先刪除所有交易記錄（因為有外鍵關聯）
    const { error: txError } = await supabase
      .from('transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // 刪除所有

    if (txError) {
      console.error('Delete transactions error:', txError)
      return NextResponse.json(
        { error: `刪除交易記錄失敗: ${txError.message}` },
        { status: 500 }
      )
    }

    // 刪除所有公仔
    const { error: figError } = await supabase
      .from('figures')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // 刪除所有

    if (figError) {
      console.error('Delete figures error:', figError)
      return NextResponse.json(
        { error: `刪除公仔失敗: ${figError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '已清除所有公仔和交易記錄'
    })
  } catch (error) {
    console.error('Clear figures error:', error)
    return NextResponse.json(
      { error: '清除失敗' },
      { status: 500 }
    )
  }
}
