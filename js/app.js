/* ═══════════════════════════════════════════════════════
   js/app.js
   Stay Hydrated, Baby — Main Application Logic
   ═══════════════════════════════════════════════════════ */

const App = (() => {

  /* ── STATE ──────────────────────────────────────────── */
  let user       = null;   // row from users table
  let dailyLog   = null;   // row from daily_logs
  let beverages  = [];     // today's beverage_entries
  let waterHours = [];     // today's hourly water breakdown
  let achievements = null; // row from achievements
  let streak     = 0;

  let remTimer   = null;
  let remOn      = false;
  let remMins    = 60;
  let tipIndex   = 0;
  let charts     = {};

  /* ── CONSTANTS ──────────────────────────────────────── */
  const TIPS = [
    "Drinking water improves focus and concentration throughout the day.",
    "Water helps regulate your body temperature — especially in warm weather.",
    "Sugary drinks should always be balanced with extra water intake.",
    "Staying hydrated supports healthy, glowing skin from within.",
    "Even mild dehydration can cause fatigue and headaches.",
    "Drinking a glass of water before meals can help with portion control.",
    "Your muscles are about 75% water — hydrate for better performance.",
    "Cold water can help your body burn a few extra calories as it warms up.",
    "Headaches are often an early sign of dehydration.",
    "Proper hydration keeps your joints lubricated and reduces soreness."
  ];

  const BEV_META = {
    softdrink: { label: 'Soft Drink',   icon: '🥤', ratio: 0.5  },
    coffee:    { label: 'Coffee',        icon: '☕', ratio: 0.5  },
    tea:       { label: 'Tea',           icon: '🍵', ratio: 0.15 },
    energy:    { label: 'Energy Drink',  icon: '⚡', ratio: 0.6  },
    alcohol:   { label: 'Alcohol',       icon: '🍺', ratio: 1.0  },
    juice:     { label: 'Juice',         icon: '🍊', ratio: 0.1  },
    milk:      { label: 'Milk',          icon: '🥛', ratio: 0.0  }
  };

  const ACH_DEF = [
    { key: 'first_sip', emoji: '🌊', name: 'First Sip',       desc: 'Drink water for the first time.' },
    { key: 'hero',      emoji: '🏆', name: 'Hydration Hero',  desc: 'Reach your daily goal.' },
    { key: 'streak7',   emoji: '🔥', name: '7-Day Streak',    desc: 'Meet goal 7 days in a row.' },
    { key: 'champ30',   emoji: '💎', name: 'Water Champion',  desc: 'Meet goal 30 consecutive days.' }
  ];

  /* ── CHART DEFAULTS ─────────────────────────────────── */
  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: 'rgba(160,220,255,0.45)', font: { size: 10, family: 'DM Sans' } },
        grid:  { color: 'rgba(0,200,255,0.05)' }
      },
      y: {
        ticks: { color: 'rgba(160,220,255,0.45)', font: { size: 10, family: 'DM Sans' } },
        grid:  { color: 'rgba(0,200,255,0.05)' }
      }
    }
  };

  /* ── HELPERS ────────────────────────────────────────── */
  function today() { return new Date().toISOString().split('T')[0]; }

  function calcGoal(weight, activity) {
    const base = weight * 30;
    const mult = { low: 1.0, moderate: 1.15, high: 1.3 }[activity] || 1.0;
    return Math.round((base * mult) / 50) * 50;
  }

  function fmtTime(isoStr) {
    const d = new Date(isoStr);
    let h = d.getHours(), m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2,'0')} ${ap}`;
  }

  /* ── TOAST ──────────────────────────────────────────── */
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ── SCREENS / PAGES ────────────────────────────────── */
  function showScreen(id) {
    ['screen-welcome','screen-setup','screen-main'].forEach(s => {
      const el = document.getElementById(s);
      el.classList.remove('active');
      el.style.display = '';
    });
    const target = document.getElementById(id);
    target.style.display = 'flex';
    target.classList.add('active');
  }

  function navigate(page, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (page === 'stats') refreshCharts();
  }

  /* ── BUBBLES ────────────────────────────────────────── */
  function createBubbles() {
    const wrap = document.getElementById('bubbles');
    for (let i = 0; i < 14; i++) {
      const b = document.createElement('div');
      b.className = 'bubble';
      const sz = 7 + Math.random() * 42;
      b.style.cssText = `
        width:${sz}px;height:${sz}px;
        left:${Math.random()*100}%;
        animation-duration:${12+Math.random()*22}s;
        animation-delay:-${Math.random()*20}s;
      `;
      wrap.appendChild(b);
    }
  }

  /* ── INIT ───────────────────────────────────────────── */
  async function init() {
    createBubbles();
    rotateTip();
    setInterval(rotateTip, 9000);

    // Check if user was previously logged in
    const savedName = sessionStorage.getItem('shb_name');
    if (savedName) {
      await resumeSession(savedName);
    }

    document.getElementById('rem-interval').addEventListener('change', changeInterval);
    document.getElementById('inp-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') enterName();
    });
  }

  /* ── NAME ENTRY ─────────────────────────────────────── */
  async function enterName() {
    const nameRaw = document.getElementById('inp-name').value.trim();
    if (!nameRaw) { document.getElementById('hint-name').textContent = 'Please enter your name.'; return; }
    document.getElementById('hint-name').textContent = '';

    const btn = document.getElementById('btn-enter');
    btn.textContent = 'Loading…';
    btn.disabled = true;

    const existing = await dbGetUserByName(nameRaw);

    if (existing) {
      // Returning user — resume session
      await resumeSession(nameRaw, existing);
    } else {
      // New user — go to setup
      sessionStorage.setItem('shb_name', nameRaw);
      user = { name: nameRaw };
      showScreen('screen-setup');
    }

    btn.textContent = "Let's Go 💧";
    btn.disabled = false;
  }

  async function resumeSession(name, existingUser = null) {
    const dbUser = existingUser || await dbGetUserByName(name);
    if (!dbUser) {
      // Name not in DB yet (edge case) — send to setup
      user = { name };
      sessionStorage.setItem('shb_name', name);
      showScreen('screen-setup');
      return;
    }

    user = dbUser;
    sessionStorage.setItem('shb_name', user.name);
    await loadUserData();
    showMain();
    toast(`Welcome back, ${user.name}! 💧`);
  }

  /* ── SETUP ──────────────────────────────────────────── */
  function previewGoal() {
    const w = parseFloat(document.getElementById('inp-weight').value);
    const a = document.getElementById('inp-activity').value;
    if (!w || w < 20) { toast('Enter a valid weight!'); return; }
    const goal = calcGoal(w, a);
    document.getElementById('goal-display').textContent = goal + ' mL';
    document.getElementById('goal-liters').textContent = (goal/1000).toFixed(1) + ' Liters per Day';
    document.getElementById('goal-preview').style.display = 'block';
  }

  async function saveSetup() {
    const w = parseFloat(document.getElementById('inp-weight').value);
    const a = document.getElementById('inp-activity').value;
    if (!w || w < 20) { toast('Enter your weight first!'); return; }
    const goal = calcGoal(w, a);

    const created = await dbCreateUser(user.name, w, a, goal);
    if (!created) { toast('Could not save — check your Supabase setup.'); return; }

    user = created;
    await loadUserData();
    showMain();
    toast(`Welcome, ${user.name}! Your goal is ${goal} mL 💧`);
  }

  /* ── LOAD TODAY'S DATA ──────────────────────────────── */
  async function loadUserData() {
    // Load in parallel
    [dailyLog, beverages, waterHours, achievements, streak] = await Promise.all([
      dbGetOrCreateDailyLog(user.id, user.goal_ml),
      dbGetTodayBeverages(user.id),
      dbGetTodayHourlyWater(user.id),
      dbGetAchievements(user.id),
      dbCalcStreak(user.id)
    ]);
  }

  /* ── SHOW MAIN ──────────────────────────────────────── */
  function showMain() {
    showScreen('screen-main');
    document.getElementById('nav').classList.add('visible');
    document.getElementById('greet-name').textContent = user.name;
    updateDashboard();
    renderBeverageLog();
    renderAchievements();
    renderStatsPage();
    rotateTip();
  }

  /* ── DASHBOARD UPDATE ───────────────────────────────── */
  function updateDashboard() {
    const consumed = dailyLog?.consumed_ml || 0;
    const extra    = dailyLog?.extra_ml    || 0;
    const total    = (user.goal_ml || 0) + extra;
    const pct      = total > 0 ? Math.min(100, Math.round(consumed / total * 100)) : 0;
    const remaining = Math.max(0, total - consumed);

    // Ring
    document.getElementById('ring-pct').textContent = pct + '%';
    document.getElementById('ring').style.strokeDashoffset = 490 - (490 * pct / 100);
    // Progress bar
    document.getElementById('progress-bar').style.width = pct + '%';
    // Stats
    document.getElementById('stat-goal').textContent      = total + ' mL';
    document.getElementById('stat-consumed').textContent  = consumed + ' mL';
    document.getElementById('stat-remaining').textContent = remaining + ' mL';
    // Score
    document.getElementById('score-badge').textContent = pct;
    // Mini stats
    document.getElementById('ms-water').textContent = consumed + ' mL';
    document.getElementById('ms-bevs').textContent  = beverages.length;
    document.getElementById('ms-extra').textContent = extra + ' mL';
    document.getElementById('ms-pct').textContent   = pct + '%';
    document.getElementById('streak-val').textContent = streak;
  }

  /* ── ADD WATER ──────────────────────────────────────── */
  async function addWater(ml) {
    if (!user) return;
    // Optimistic UI
    dailyLog.consumed_ml += ml;
    const h = new Date().getHours();
    if (waterHours[h] !== undefined) waterHours[h] += ml; else waterHours[h] = ml;
    updateDashboard();

    // Persist
    await Promise.all([
      dbAddWaterEntry(user.id, ml),
      syncDailyLog()
    ]);

    await checkAchievements();
    renderAchievements();
    toast(`+${ml} mL 💧 Great job!`);
    if (dailyLog.consumed_ml >= (user.goal_ml + (dailyLog.extra_ml || 0))) {
      setTimeout(() => toast('🎉 Goal reached! You\'re a hydration hero!'), 700);
    }
  }

  function addCustom() {
    const v = parseInt(document.getElementById('custom-ml').value);
    if (!v || v < 1) { toast('Enter a valid amount!'); return; }
    document.getElementById('custom-ml').value = '';
    addWater(v);
  }

  /* ── SYNC DAILY LOG ─────────────────────────────────── */
  async function syncDailyLog() {
    const consumed = dailyLog.consumed_ml;
    const extra    = dailyLog.extra_ml || 0;
    const met      = consumed >= (user.goal_ml + extra);
    dailyLog.met_goal = met;
    await dbUpdateDailyLog(user.id, {
      consumed_ml: consumed,
      extra_ml:    extra,
      met_goal:    met
    });
  }

  /* ── LOG BEVERAGE ───────────────────────────────────── */
  async function logBeverage() {
    const type = document.getElementById('bev-type').value;
    const ml   = parseInt(document.getElementById('bev-ml').value);
    if (!type)     { toast('Choose a beverage type!'); return; }
    if (!ml || ml < 1) { toast('Enter the amount!'); return; }

    const meta  = BEV_META[type];
    const extra = Math.round(ml * meta.ratio);

    // Optimistic
    const entry = {
      bev_type: type, bev_label: meta.label, bev_icon: meta.icon,
      amount_ml: ml, extra_ml: extra,
      logged_at: new Date().toISOString()
    };
    beverages.push(entry);
    dailyLog.extra_ml = (dailyLog.extra_ml || 0) + extra;
    updateDashboard();
    renderBeverageLog();

    // Persist
    await Promise.all([
      dbAddBeverageEntry(user.id, entry),
      syncDailyLog()
    ]);

    document.getElementById('bev-type').value = '';
    document.getElementById('bev-ml').value   = '';

    if (extra > 0) {
      const alertEl  = document.getElementById('comp-alert');
      const alertBev = document.getElementById('comp-alert-bev');
      const msg = `You drank ${ml} mL of ${meta.label.toLowerCase()}. Drink an extra ${extra} mL of water to stay hydrated.`;
      document.getElementById('comp-msg').textContent = msg;
      alertEl.classList.add('show');
      alertBev.textContent = '💧 ' + msg;
      alertBev.classList.add('show');
      setTimeout(() => { alertEl.classList.remove('show'); alertBev.classList.remove('show'); }, 7000);
      toast(`⚠️ +${extra} mL extra water required`);
    } else {
      toast(`${meta.icon} ${meta.label} logged (${ml} mL)`);
    }

    await checkAchievements();
    renderAchievements();
  }

  /* ── RENDER BEVERAGE LOG ────────────────────────────── */
  function renderBeverageLog() {
    const log = document.getElementById('bev-log');
    if (!beverages.length) {
      log.innerHTML = '<div class="empty-state">No beverages logged yet.</div>';
      return;
    }
    log.innerHTML = [...beverages].reverse().map(b => `
      <div class="bev-item">
        <div class="bev-icon">${b.bev_icon}</div>
        <div class="bev-info">
          <div class="bev-name">${b.bev_label}</div>
          <div class="bev-meta">
            ${b.amount_ml} mL · ${fmtTime(b.logged_at)}
            ${b.extra_ml ? `· <span class="bev-extra-tag">+${b.extra_ml} mL needed</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  /* ── ACHIEVEMENTS ───────────────────────────────────── */
  async function checkAchievements() {
    if (!achievements) return;
    const consumed = dailyLog?.consumed_ml || 0;
    const total    = (user.goal_ml || 0) + (dailyLog?.extra_ml || 0);
    const updates  = {};

    if (!achievements.first_sip && consumed > 0)             updates.first_sip = true;
    if (!achievements.hero      && consumed >= total)         updates.hero      = true;
    if (!achievements.streak7   && streak >= 7)               updates.streak7   = true;
    if (!achievements.champ30   && streak >= 30)              updates.champ30   = true;

    if (Object.keys(updates).length) {
      Object.assign(achievements, updates);
      await dbUpdateAchievements(user.id, updates);
      const newOnes = ACH_DEF.filter(a => updates[a.key]);
      if (newOnes.length) {
        setTimeout(() => toast(`🏅 Achievement unlocked: ${newOnes[0].name}!`), 800);
      }
    }
  }

  function renderAchievements() {
    const grid = document.getElementById('ach-grid');
    if (!achievements) { grid.innerHTML = ''; return; }
    grid.innerHTML = ACH_DEF.map(a => {
      const earned = achievements[a.key];
      return `
        <div class="ach-card ${earned ? 'earned' : 'locked'}">
          <div class="ach-emoji">${a.emoji}</div>
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
          ${earned ? '<div class="ach-earned">✓ Earned</div>' : ''}
        </div>
      `;
    }).join('');
  }

  /* ── TIPS ───────────────────────────────────────────── */
  function rotateTip() {
    const el = document.getElementById('tip-text');
    if (!el) return;
    el.style.opacity = 0;
    setTimeout(() => {
      el.textContent = TIPS[tipIndex % TIPS.length];
      el.style.opacity = 1;
      tipIndex++;
    }, 300);
  }

  /* ── REMINDERS ──────────────────────────────────────── */
  function toggleReminders() {
    remOn = !remOn;
    const tog = document.getElementById('rem-toggle');
    tog.classList.toggle('on', remOn);
    document.getElementById('rem-status-label').textContent = remOn ? 'On ✓' : 'Off';
    if (remOn) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
          if (p !== 'granted') {
            toast('Enable browser notifications for reminders!');
            remOn = false;
            tog.classList.remove('on');
            document.getElementById('rem-status-label').textContent = 'Off';
          }
        });
      }
      scheduleReminder();
    } else {
      if (remTimer) clearInterval(remTimer);
    }
  }

  function changeInterval() {
    const val = document.getElementById('rem-interval').value;
    const wrap = document.getElementById('rem-custom-wrap');
    wrap.style.display = val === 'custom' ? 'block' : 'none';
    if (val !== 'custom') remMins = parseInt(val);
    if (remOn) scheduleReminder();
  }

  function scheduleReminder() {
    if (remTimer) clearInterval(remTimer);
    const val = document.getElementById('rem-interval').value;
    if (val === 'custom') {
      const v = parseInt(document.getElementById('rem-custom-min').value);
      remMins = (v && v > 0) ? v : 60;
    } else {
      remMins = parseInt(val);
    }
    remTimer = setInterval(fireReminder, remMins * 60 * 1000);
  }

  function fireReminder() {
    const hasSoda = beverages.some(b => ['softdrink','energy','alcohol'].includes(b.bev_type));
    const msgs = hasSoda
      ? ['🥤 You recently drank soda. Don\'t forget to drink extra water!']
      : ['💧 Time to drink water!', '💙 Stay Hydrated, Baby!', '🌊 Hydration check — drink up!'];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    toast(msg);
    if (Notification.permission === 'granted') {
      new Notification('Stay Hydrated, Baby! 💧', { body: msg });
    }
  }

  /* ── CHARTS ─────────────────────────────────────────── */
  function switchTab(btn, id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    setTimeout(() => {
      if (id === 'daily')   buildDailyChart();
      if (id === 'weekly')  buildWeeklyChart();
      if (id === 'monthly') buildMonthlyChart();
    }, 50);
  }

  function refreshCharts() {
    setTimeout(() => {
      buildDailyChart();
    }, 80);
  }

  function renderStatsPage() {
    document.getElementById('streak-val').textContent = streak;
  }

  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }

  function buildDailyChart() {
    destroyChart('daily');
    const ctx = document.getElementById('chart-daily').getContext('2d');
    const hours = [0,3,6,9,12,15,18,21];
    const labels = hours.map(h => h === 0 ? '12am' : h < 12 ? h+'am' : h === 12 ? '12pm' : (h-12)+'pm');
    const data   = hours.map(h => (waterHours[h] || 0) + (waterHours[h+1] || 0) + (waterHours[h+2] || 0));
    charts.daily = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: 'rgba(0,200,255,0.22)',
          borderColor:     'rgba(0,200,255,0.65)',
          borderWidth: 1.5,
          borderRadius: 5
        }]
      },
      options: CHART_DEFAULTS
    });
  }

  async function buildWeeklyChart() {
    destroyChart('weekly');
    const ctx  = document.getElementById('chart-weekly').getContext('2d');
    const logs = await dbGetRecentLogs(user.id, 7);
    const days  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const labels = [];
    const data   = [];
    const goalLine = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = days[d.getDay() === 0 ? 6 : d.getDay() - 1];
      labels.push(dayName);
      const row = logs.find(l => l.log_date === dateStr);
      data.push(row ? row.consumed_ml : 0);
      goalLine.push(user.goal_ml);
    }
    charts.weekly = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Water',
            data,
            borderColor: 'rgba(0,200,255,0.85)',
            backgroundColor: 'rgba(0,200,255,0.07)',
            borderWidth: 2, fill: true, tension: 0.4,
            pointBackgroundColor: 'rgba(0,200,255,0.9)',
            pointRadius: 4
          },
          {
            label: 'Goal',
            data: goalLine,
            borderColor: 'rgba(0,255,200,0.40)',
            borderWidth: 1.5, borderDash: [4,4],
            pointRadius: 0, fill: false, tension: 0
          }
        ]
      },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } } }
    });
  }

  async function buildMonthlyChart() {
    destroyChart('monthly');
    const ctx  = document.getElementById('chart-monthly').getContext('2d');
    const logs = await dbGetRecentLogs(user.id, 30);
    const dom  = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
    const labels = [], data = [], colors = [], borders = [];

    for (let d = 1; d <= dom; d++) {
      labels.push(d);
      const dateStr = new Date(new Date().getFullYear(), new Date().getMonth(), d).toISOString().split('T')[0];
      const row = logs.find(l => l.log_date === dateStr);
      const val = row ? row.consumed_ml : 0;
      const met = row ? row.met_goal : false;
      data.push(val);
      colors.push(met  ? 'rgba(0,255,200,0.30)' : 'rgba(0,200,255,0.18)');
      borders.push(met ? 'rgba(0,255,200,0.65)' : 'rgba(0,200,255,0.45)');
    }

    charts.monthly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor:     borders,
          borderWidth: 1,
          borderRadius: 3
        }]
      },
      options: CHART_DEFAULTS
    });
  }

  /* ── UPDATE GOAL ────────────────────────────────────── */
  async function updateGoal() {
    const w = parseFloat(document.getElementById('upd-weight').value);
    const a = document.getElementById('upd-activity').value;
    if (!w || w < 20) { toast('Enter a valid weight!'); return; }
    const goal = calcGoal(w, a);
    user.goal_ml = goal;
    await dbUpdateUser(user.id, { weight: w, activity: a, goal_ml: goal });
    dailyLog.goal_ml = goal;
    await syncDailyLog();
    updateDashboard();
    toast(`Goal updated to ${goal} mL 🎯`);
  }

  /* ── SIGN OUT ───────────────────────────────────────── */
  async function signOut() {
    // Save latest state before leaving
    await syncDailyLog();
    toast('Saved! See you next time 👋');
    setTimeout(() => {
      sessionStorage.removeItem('shb_name');
      user = null; dailyLog = null; beverages = []; waterHours = []; achievements = null; streak = 0;
      if (remTimer) clearInterval(remTimer);
      Object.values(charts).forEach(c => { if (c) c.destroy(); });
      charts = {};
      document.getElementById('nav').classList.remove('visible');
      document.getElementById('inp-name').value = '';
      showScreen('screen-welcome');
    }, 900);
  }

  /* ── KICK OFF ───────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', init);

  /* ── PUBLIC API ─────────────────────────────────────── */
  return {
    enterName,
    previewGoal,
    saveSetup,
    addWater,
    addCustom,
    logBeverage,
    toggleReminders,
    changeInterval,
    switchTab,
    navigate,
    updateGoal,
    signOut
  };

})();
