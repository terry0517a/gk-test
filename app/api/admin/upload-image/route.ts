import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const figureId = formData.get('figureId') as string

    if (!file || !figureId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    // 檢查檔案類型
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '請上傳圖片檔案' }, { status: 400 })
    }

    // 產生唯一檔名
    const fileExt = file.name.split('.').pop()
    const fileName = `${figureId}-${Date.now()}.${fileExt}`

    // 將 File 轉換為 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // 上傳到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('figures')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      // 如果 bucket 不存在，嘗試建立
      if (uploadError.message.includes('not found')) {
        return NextResponse.json({
          error: '請先在 Supabase Storage 建立名為 "figures" 的 Bucket，並設為 Public'
        }, { status: 400 })
      }
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // 取得公開 URL
    const { data: urlData } = supabase.storage
      .from('figures')
      .getPublicUrl(fileName)

    const imageUrl = urlData.publicUrl

    // 更新資料庫
    const { error: updateError } = await supabase
      .from('figures')
      .update({ image_url: imageUrl })
      .eq('id', figureId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: '更新資料庫失敗' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      message: '圖片上傳成功'
    })
  } catch (error) {
    console.error('Upload image error:', error)
    return NextResponse.json({ error: '上傳失敗' }, { status: 500 })
  }
}
