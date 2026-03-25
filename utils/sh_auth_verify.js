const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nyczcwsdfklqzofeddom.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55Y3pjd3NkZmtscXpvZmVkZG9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjM0MjMsImV4cCI6MjA4OTM5OTQyM30.cOp7g-BFMaw9QwyrO-V8A8qMxnsvKWxtbp0rSQFpcPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyAuthorizedFlow() {
    console.log('🧪 เริ่มต้นการทดสอบ Authorized Signup Flow...');
    
    // This email was invited by the subagent in the previous step
    const invitedEmail = 'tester_invited@asterna.test';
    console.log(`1️⃣ สมัครสมาชิกด้วย Email ที่ได้รับเชิญ: ${invitedEmail}`);
    
    const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: invitedEmail,
        password: 'secure_password_123'
    });

    if (authErr) {
        console.error('❌ สมัครสมาชิกไม่สำเร็จ:', authErr.message);
        return;
    }

    console.log('✅ สมัครสมาชิกสำเร็จ!');

    console.log('2️⃣ ตรวจสอบว่า Profile ถูกสร้างอัตโนมัติโดย Trigger หรือไม่...');
    // Wait a bit for trigger to finish
    await new Promise(r => setTimeout(r, 2000));

    const { data: profileData, error: profileErr } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

    if (profileData) {
        console.log('🎯 สำเร็จ! ตรวจพบ Profile ที่ถูกสร้างโดยอัตโนมัติ:', {
            email: profileData.email,
            role: profileData.role,
            display_name: profileData.display_name
        });
        console.log('\n🛡️ สรุป: ระบบ Invitation + Trigger ทำงานได้สมบูรณ์แบบ!');
    } else {
        console.error('❌ ล้มเหลว! ไม่พบ Profile ถูกสร้าง (Trigger อาจทำงานผิดพลาด)');
        if (profileErr) console.error('Error detail:', profileErr.message);
    }
}

verifyAuthorizedFlow();
