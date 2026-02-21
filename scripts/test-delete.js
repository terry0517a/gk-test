/**
 * 測試並修復刪除功能
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testDelete() {
  console.log('🔍 測試刪除功能...\n');

  // 新增測試資料
  const { data: testData, error: insertError } = await supabase
    .from('figures')
    .insert({ name: '測試刪除用_請刪除_' + Date.now() })
    .select()
    .single();

  if (insertError) {
    console.log('❌ 新增測試資料失敗:', insertError.message);
    return;
  }

  console.log('✅ 新增測試資料成功');
  console.log('   ID:', testData.id);
  console.log('   名稱:', testData.name);

  // 嘗試刪除
  const { data: deleted, error: deleteError } = await supabase
    .from('figures')
    .delete()
    .eq('id', testData.id)
    .select();

  if (deleteError) {
    console.log('\n❌ 刪除失敗:', deleteError.message);
    printFixInstructions();
    return;
  }

  if (!deleted || deleted.length === 0) {
    console.log('\n❌ 刪除操作沒有影響任何資料（RLS 政策阻擋）');
    printFixInstructions();
    return;
  }

  console.log('\n✅ 刪除功能正常！測試資料已刪除');
  console.log('   如果後台刪除還是有問題，可能是前端快取，請清除瀏覽器快取後重試');
}

function printFixInstructions() {
  console.log('\n========================================');
  console.log('請到 Supabase SQL Editor 執行以下指令：');
  console.log('========================================\n');
  console.log(`-- 為 figures 表格新增 DELETE 權限
CREATE POLICY "allow_delete_figures" ON public.figures
FOR DELETE TO anon
USING (true);

-- 為 transactions 表格新增 DELETE 權限
CREATE POLICY "allow_delete_transactions" ON public.transactions
FOR DELETE TO anon
USING (true);`);
  console.log('\n========================================');
}

testDelete().catch(console.error);
