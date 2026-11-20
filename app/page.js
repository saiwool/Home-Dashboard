import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { landingHref } from '@/lib/theme'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('user_preferences')
    .select('default_tab')
    .eq('id', user.id)
    .maybeSingle()

  redirect(landingHref(data?.default_tab))
}
