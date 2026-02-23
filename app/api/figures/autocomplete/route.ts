import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const { data, error } = await supabase
      .from('figures')
      .select('id, name, manufacturer, image_url')
      .ilike('name', `%${q.trim()}%`)
      .order('name')
      .limit(8)

    if (error) {
      console.error('Autocomplete error:', error)
      return NextResponse.json({ results: [] })
    }

    return NextResponse.json({ results: data || [] })
  } catch (error) {
    console.error('Autocomplete error:', error)
    return NextResponse.json({ results: [] })
  }
}
