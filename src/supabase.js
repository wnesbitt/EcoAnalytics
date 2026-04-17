import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tvaneuwfoixzchgonhyx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2YW5ldXdmb2l4emNoZ29uaHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzU2NjIsImV4cCI6MjA5MjAxMTY2Mn0.gwg0XLHB2IQlWz9ZRSWa1EqJcZRvdRbLshGIQcz-0oI'

export const supabase = createClient(supabaseUrl, supabaseKey)