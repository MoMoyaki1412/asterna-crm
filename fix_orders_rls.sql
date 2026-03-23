-- ====================================================
-- FIX: ADD MISSING RLS POLICIES FOR ORDERS TABLE
-- Run this in Supabase > SQL Editor
-- ====================================================

-- 1. อนุญาตให้ Admin/User ที่เข้าระบบแล้ว แก้ไขข้อมูล Order ได้
CREATE POLICY "Authenticated users can update orders"
  ON orders FOR UPDATE USING (auth.role() = 'authenticated');

-- 2. อนุญาตให้ Admin/User ที่เข้าระบบแล้ว ลบข้อมูล Order ได้
CREATE POLICY "Authenticated users can delete orders"
  ON orders FOR DELETE USING (auth.role() = 'authenticated');
