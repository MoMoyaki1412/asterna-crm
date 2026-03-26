const { createClient } = require('@supabase/supabase-js');
const url = 'https://nyczcwsdfklqzofeddom.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55Y3pjd3NkZmtscXpvZmVkZG9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjM0MjMsImV4cCI6MjA4OTM5OTQyM30.cOp7g-BFMaw9QwyrO-V8A8qMxnsvKWxtbp0rSQFpcPQ';
const supabase = createClient(url, key);

async function deactivate() {
  const { error } = await supabase.from('products').update({ is_active: false }).eq('id', 1);
  if (error) console.error('Error:', error);
  else console.log('Successfully deactivated product ID 1');
}

deactivate();
