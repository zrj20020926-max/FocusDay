import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

globalThis.WebSocket ??= WebSocket

const url = process.env.SUPABASE_URL
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !publishableKey || !secretKey) {
  throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required')
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
const anonymous = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
const createdUserIds = []
const results = []
const cleanupErrors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function record(name) {
  results.push({ name, passed: true })
}

async function createConfirmedUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('Unable to create test user')
  createdUserIds.push(data.user.id)
  return data.user
}

try {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const password = `Fd!${randomBytes(18).toString('base64url')}`

  const userAEmail = `focus-day-a-${suffix}@rls-test.invalid`
  const userBEmail = `focus-day-b-${suffix}@rls-test.invalid`
  const userA = await createConfirmedUser(userAEmail, password)
  const userB = await createConfirmedUser(userBEmail, password)

  const clientA = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const clientB = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: loginA, error: loginAError } = await clientA.auth.signInWithPassword({ email: userAEmail, password })
  const { data: loginB, error: loginBError } = await clientB.auth.signInWithPassword({ email: userBEmail, password })
  assert(!loginAError && loginA.session, `User A login failed: ${loginAError?.message}`)
  assert(!loginBError && loginB.session, `User B login failed: ${loginBError?.message}`)
  record('password login')

  const { data: profile, error: profileError } = await clientA.from('profiles').select('user_id').eq('user_id', userA.id).single()
  assert(!profileError && profile?.user_id === userA.id, `Profile registration trigger failed: ${profileError?.message}`)
  record('auth user profile provisioning')

  const { data: restored } = await clientA.auth.getSession()
  assert(restored.session?.user.id === userA.id, 'Session restoration failed')
  record('session restoration')

  const categoryId = randomUUID()
  const taskId = randomUUID()
  const { error: categoryError } = await clientA.from('categories').insert({
    id: categoryId, user_id: userA.id, name: 'RLS verification', color: '#92AA8B', icon: 'ShieldCheck',
  })
  assert(!categoryError, `Category insert failed: ${categoryError?.message}`)
  const { error: taskError } = await clientA.from('tasks').insert({
    id: taskId, user_id: userA.id, category_id: categoryId, title: 'Remote verification task', description: '',
    priority: 'HIGH', status: 'TODO', estimated_duration: 25, estimated_pomodoros: 1, sort_order: 0,
  })
  assert(!taskError, `Task insert failed: ${taskError?.message}`)
  record('authenticated data write')

  const { data: ownRows, error: ownReadError } = await clientA.from('tasks').select('id').eq('id', taskId)
  assert(!ownReadError && ownRows?.length === 1, 'Owner could not read own task')
  const { data: otherRows, error: otherReadError } = await clientB.from('tasks').select('id').eq('id', taskId)
  assert(!otherReadError && otherRows?.length === 0, 'RLS exposed another user task')
  record('cross-user read isolation')

  const { data: modifiedRows, error: otherUpdateError } = await clientB.from('tasks').update({ title: 'forbidden' }).eq('id', taskId).select('id')
  assert(!otherUpdateError && modifiedRows?.length === 0, 'RLS allowed another user to update the task')
  record('cross-user write isolation')

  const { error: anonymousError } = await anonymous.from('categories').insert({
    id: randomUUID(), user_id: userA.id, name: 'forbidden', color: '#92AA8B', icon: 'ShieldCheck',
  })
  assert(anonymousError, 'Unauthenticated insert unexpectedly succeeded')
  record('unauthenticated write rejection')

  const { error: signOutError } = await clientA.auth.signOut()
  assert(!signOutError, `Sign-out failed: ${signOutError?.message}`)
  const { data: signedOutSession } = await clientA.auth.getSession()
  assert(signedOutSession.session === null, 'Session remained after sign-out')
  record('sign-out')

} finally {
  for (const userId of createdUserIds.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) cleanupErrors.push(error.message)
  }
}

assert(cleanupErrors.length === 0, `Test user cleanup failed: ${cleanupErrors.join('; ')}`)
record('temporary user cleanup')
console.log(JSON.stringify({ ok: true, checks: results }, null, 2))
