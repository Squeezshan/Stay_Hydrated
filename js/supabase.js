/* ═══════════════════════════════════════════════════════
   js/supabase.js
   Supabase client setup + all database operations.

   ⚠️  SETUP:  Replace SUPABASE_URL and SUPABASE_ANON_KEY
       with your own project values from:
       https://supabase.com/dashboard → Settings → API

   Required Supabase tables (run this SQL in the SQL Editor):
   ─────────────────────────────────────────────────────────

   -- Users table
   create table users (
     id         uuid primary key default gen_random_uuid(),
     name       text not null unique,
     weight     numeric,
     activity   text,
     goal_ml    integer,
     streak      integer default 0,
     created_at timestamp with time zone default now()
   );

   -- Daily logs (one row per user per day)
   create table daily_logs (
     id          uuid primary key default gen_random_uuid(),
     user_id     uuid references users(id) on delete cascade,
     log_date    date not null,
     consumed_ml integer default 0,
     extra_ml    integer default 0,
     goal_ml     integer,
     met_goal    boolean default false,
     created_at  timestamp with time zone default now(),
     unique(user_id, log_date)
   );

   -- Water entries
   create table water_entries (
     id         uuid primary key default gen_random_uuid(),
     user_id    uuid references users(id) on delete cascade,
     log_date   date not null,
     amount_ml  integer,
     logged_at  timestamp with time zone default now()
   );

   -- Beverage entries
   create table beverage_entries (
     id           uuid primary key default gen_random_uuid(),
     user_id      uuid references users(id) on delete cascade,
     log_date     date not null,
     bev_type     text,
     bev_label    text,
     bev_icon     text,
     amount_ml    integer,
     extra_ml     integer default 0,
     logged_at    timestamp with time zone default now()
   );

   -- Achievements
   create table achievements (
     id         uuid primary key default gen_random_uuid(),
     user_id    uuid references users(id) on delete cascade unique,
     first_sip  boolean default false,
     hero       boolean default false,
     streak7    boolean default false,
     champ30    boolean default false,
     updated_at timestamp with time zone default now()
   );

   ─────────────────────────────────────────────────────────
   Enable Row Level Security (RLS) then add a policy for
   anon reads/writes if you want fully public access:

   alter table users enable row level security;
   create policy "public access" on users for all using (true) with check (true);
   -- (repeat for each table)
   ═══════════════════════════════════════════════════════ */

const SUPABASE_URL      = '';
const SUPABASE_ANON_KEY = '';

const DB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── USERS ──────────────────────────────────────── */

/**
 * Look up a user by name (case-insensitive).
 * Returns the user row or null if not found.
 */
async function dbGetUserByName(name) {
  const { data, error } = await DB
    .from('users')
    .select('*')
    .ilike('name', name.trim())
    .maybeSingle();
  if (error) console.error('dbGetUserByName:', error);
  return data;
}

/**
 * Create a new user. Returns the created row.
 */
async function dbCreateUser(name, weight, activity, goalMl) {
  const { data, error } = await DB
    .from('users')
    .insert({ name: name.trim(), weight, activity, goal_ml: goalMl, streak: 0 })
    .select()
    .single();
  if (error) { console.error('dbCreateUser:', error); return null; }
  return data;
}

/**
 * Update user profile (weight, activity, goal).
 */
async function dbUpdateUser(userId, fields) {
  const { error } = await DB
    .from('users')
    .update(fields)
    .eq('id', userId);
  if (error) console.error('dbUpdateUser:', error);
}

/* ─── DAILY LOG ──────────────────────────────────── */

const todayDate = () => new Date().toISOString().split('T')[0];

/**
 * Get or create today's daily log for the user.
 */
async function dbGetOrCreateDailyLog(userId, goalMl) {
  const date = todayDate();
  let { data, error } = await DB
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', date)
    .maybeSingle();

  if (error) { console.error('dbGetOrCreateDailyLog get:', error); }

  if (!data) {
    const { data: created, error: err2 } = await DB
      .from('daily_logs')
      .insert({ user_id: userId, log_date: date, consumed_ml: 0, extra_ml: 0, goal_ml: goalMl, met_goal: false })
      .select()
      .single();
    if (err2) console.error('dbGetOrCreateDailyLog insert:', err2);
    data = created;
  }
  return data;
}

/**
 * Update today's daily log totals.
 */
async function dbUpdateDailyLog(userId, { consumed_ml, extra_ml, met_goal }) {
  const date = todayDate();
  const { error } = await DB
    .from('daily_logs')
    .update({ consumed_ml, extra_ml, met_goal })
    .eq('user_id', userId)
    .eq('log_date', date);
  if (error) console.error('dbUpdateDailyLog:', error);
}

/* ─── WATER ENTRIES ──────────────────────────────── */

/**
 * Insert a water entry.
 */
async function dbAddWaterEntry(userId, amountMl) {
  const { error } = await DB
    .from('water_entries')
    .insert({ user_id: userId, log_date: todayDate(), amount_ml: amountMl });
  if (error) console.error('dbAddWaterEntry:', error);
}

/**
 * Get today's water entries for a user.
 */
async function dbGetTodayWaterEntries(userId) {
  const { data, error } = await DB
    .from('water_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', todayDate())
    .order('logged_at', { ascending: true });
  if (error) console.error('dbGetTodayWaterEntries:', error);
  return data || [];
}

/* ─── BEVERAGE ENTRIES ───────────────────────────── */

/**
 * Insert a beverage entry.
 */
async function dbAddBeverageEntry(userId, { bev_type, bev_label, bev_icon, amount_ml, extra_ml }) {
  const { error } = await DB
    .from('beverage_entries')
    .insert({ user_id: userId, log_date: todayDate(), bev_type, bev_label, bev_icon, amount_ml, extra_ml });
  if (error) console.error('dbAddBeverageEntry:', error);
}

/**
 * Get today's beverage entries for a user.
 */
async function dbGetTodayBeverages(userId) {
  const { data, error } = await DB
    .from('beverage_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', todayDate())
    .order('logged_at', { ascending: true });
  if (error) console.error('dbGetTodayBeverages:', error);
  return data || [];
}

/* ─── ACHIEVEMENTS ───────────────────────────────── */

/**
 * Get or create the achievements row for a user.
 */
async function dbGetAchievements(userId) {
  let { data, error } = await DB
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('dbGetAchievements:', error);
  if (!data) {
    const { data: created } = await DB
      .from('achievements')
      .insert({ user_id: userId })
      .select()
      .single();
    data = created;
  }
  return data;
}

/**
 * Update achievements row.
 */
async function dbUpdateAchievements(userId, fields) {
  const { error } = await DB
    .from('achievements')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) console.error('dbUpdateAchievements:', error);
}

/* ─── ANALYTICS ──────────────────────────────────── */

/**
 * Get last N days of daily logs for a user.
 */
async function dbGetRecentLogs(userId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const { data, error } = await DB
    .from('daily_logs')
    .select('log_date, consumed_ml, goal_ml, met_goal')
    .eq('user_id', userId)
    .gte('log_date', sinceStr)
    .order('log_date', { ascending: true });
  if (error) console.error('dbGetRecentLogs:', error);
  return data || [];
}

/**
 * Get today's hourly water breakdown for the daily chart.
 */
async function dbGetTodayHourlyWater(userId) {
  const entries = await dbGetTodayWaterEntries(userId);
  const hours = Array(24).fill(0);
  entries.forEach(e => {
    const h = new Date(e.logged_at).getHours();
    hours[h] += e.amount_ml;
  });
  return hours;
}

/**
 * Calculate current streak from daily logs.
 */
async function dbCalcStreak(userId) {
  const { data, error } = await DB
    .from('daily_logs')
    .select('log_date, met_goal')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(60);
  if (error || !data) return 0;

  let streak = 0;
  const today = todayDate();
  let checkDate = new Date(today);

  for (const row of data) {
    const d = row.log_date;
    const expected = checkDate.toISOString().split('T')[0];
    if (d === expected && row.met_goal) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (d === today && !row.met_goal) {
      // today hasn't been met yet, keep checking previous
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
