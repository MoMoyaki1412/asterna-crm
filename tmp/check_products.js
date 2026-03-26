const { createClient } = require('@supabase/supabase-js');
const url = 'https://nyczcwsdfklqzofeddom.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55Y3pjd3NkZmtscXpvZmVkZG9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjM0MjMsImV4cCI6MjA4OTM5OTQyM30.cOp7g-BFMaw9QwyrO-V8A8qMxnsvKWxtbp0rSQFpcPQ';
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('products').select('id, name, sku, is_active').order('id');
  if (error) console.error('Error:', error);
  else console.log('Result:', JSON.stringify(data));
}

check();
