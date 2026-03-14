(() => {
  const siteTemplates = [
    { key:'house', finished:'assets/buildings/house_finished.svg', reward:5200, speed:1.15, title:'Дом' },
    { key:'school', finished:'assets/buildings/school_finished.svg', reward:6800, speed:1.0, title:'Школа' },
    { key:'tower', finished:'assets/buildings/tower_finished.svg', reward:7600, speed:0.92, title:'Башня' },
    { key:'clinic', finished:'assets/buildings/clinic_finished.svg', reward:7000, speed:0.98, title:'Клиника' },
    { key:'office', finished:'assets/buildings/office_finished.svg', reward:6100, speed:1.04, title:'Офис' },
    { key:'factory', finished:'assets/buildings/factory_finished.svg', reward:8100, speed:0.9, title:'Завод' }
  ];

  const workerNames = ['Руслан','Антон','Илья','Максим','Лёня','Олег','Саша','Глеб','Дима','Иван','Паша','Тимур'];
  const statusMeta = {
    normal: { emoji:'🙂', speed:1, mood:-0.005 },
    slow: { emoji:'🐌', speed:0.48, mood:-0.035 },
    weak: { emoji:'🩹', speed:0.58, mood:-0.025 },
    scared: { emoji:'😟', speed:0.72, mood:-0.018 },
    reckless: { emoji:'⚠️', speed:1.08, mood:-0.04 }
  };

  const app = {
    running:false,
    ended:false,
    sound:true,
    worldW:3000,
    worldH:1800,
    scale:0.82,
    minScale:0.52,
    maxScale:1.35,
    camX:430,
    camY:220,
    viewportW:window.innerWidth,
    viewportH:window.innerHeight,
    budget:23637,
    timeLeft:233,
    reputation:52,
    built:0,
    totalSites:6,
    selectedSiteId:null,
    selectedWorkerId:null,
    lastTime:0,
    secAcc:0,
    issueAcc:0,
    truckT:0,
    nextReplacements:[],
    stats:{ fired:0, helped:0, jobless:0, replaced:0, promoted:0, problemCount:0 },
    workers:[],
    sites:[],
    clouds:[],
    sounds:{}
  };

  const els = {
    viewport:document.getElementById('mapViewport'),
    world:document.getElementById('world'),
    budget:document.getElementById('budgetValue'),
    time:document.getElementById('timeValue'),
    built:document.getElementById('builtValue'),
    rep:document.getElementById('repValue'),
    soundBtn:document.getElementById('soundBtn'),
    restartBtn:document.getElementById('restartBtn'),
    startOverlay:document.getElementById('startOverlay'),
    startBtn:document.getElementById('startBtn'),
    endOverlay:document.getElementById('endOverlay'),
    statsGrid:document.getElementById('statsGrid'),
    playAgainBtn:document.getElementById('playAgainBtn'),
    siteMenu:document.getElementById('siteMenu'),
    siteMenuTitle:document.getElementById('siteMenuTitle'),
    siteMenuSub:document.getElementById('siteMenuSub'),
    siteWorkersList:document.getElementById('siteWorkersList'),
    promoteBtn:document.getElementById('promoteBtn'),
    replaceBtn:document.getElementById('replaceBtn'),
    fireBtn:document.getElementById('fireBtn')
  };

  let dragState = null;
  let dragMoved = false;

  const fmtMoney = v => `${Math.round(v).toLocaleString('ru-RU')} ₽`;
  const fmtTime = t => `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const rand = (a,b) => Math.random()*(b-a)+a;
  const randInt = (a,b) => Math.floor(rand(a,b+1));
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];

  function initSounds(){
    ['click','hire','fire','support','complete','warn','end'].forEach(name => {
      const audio = new Audio(`assets/sounds/${name}.wav`);
      audio.preload = 'auto';
      app.sounds[name] = audio;
    });
  }
  function playSound(name){
    if(!app.sound || !app.sounds[name]) return;
    const c = app.sounds[name].cloneNode();
    c.volume = name === 'warn' ? 0.4 : 0.55;
    c.play().catch(() => {});
  }

  function createSites(){
    const positions = [
      {x:340,y:280, workers:2},
      {x:940,y:270, workers:2},
      {x:1540,y:290, workers:3},
      {x:570,y:990, workers:2},
      {x:1270,y:1010, workers:2},
      {x:2030,y:930, workers:3}
    ];
    return positions.map((p,i)=>({
      id:`site_${i+1}`,
      x:p.x,
      y:p.y,
      needWorkers:p.workers,
      progress:i===0?18:0,
      finished:false,
      asset:`assets/buildings/construction_${(i%3)+1}.svg`,
      ...siteTemplates[i]
    }));
  }

  function createWorker(siteId, replacement=false){
    const index = randInt(1,12);
    const site = app.sites.find(s => s.id===siteId);
    const startStateRoll = Math.random();
    let state = 'normal';
    if(startStateRoll < 0.12) state = 'slow';
    else if(startStateRoll < 0.19) state = 'weak';
    else if(startStateRoll < 0.24) state = 'scared';
    else if(startStateRoll < 0.28) state = 'reckless';
    return {
      id:`w_${Math.random().toString(36).slice(2,8)}`,
      name:pick(workerNames),
      asset:`assets/workers/worker_${String(index).padStart(2,'0')}.svg`,
      state,
      siteId,
      mood:randInt(48,90),
      speed:randInt(60,95),
      x: replacement ? 140 : site.x + rand(-40,40),
      y: replacement ? 1500 + rand(-40,40) : site.y + 140 + rand(-12,12),
      targetX: site.x + rand(-44,44),
      targetY: site.y + 142 + rand(-12,12),
      entering:replacement,
      leaving:false,
      remove:false,
      leaveX:0,
      leaveY:0,
      issueCooldown:randInt(7,16),
      promoteCount:0
    };
  }

  function resetGame(){
    app.running=false;
    app.ended=false;
    app.budget=23637;
    app.timeLeft=233;
    app.reputation=52;
    app.built=0;
    app.selectedSiteId=null;
    app.selectedWorkerId=null;
    app.secAcc=0;
    app.issueAcc=0;
    app.truckT=0;
    app.stats={ fired:0, helped:0, jobless:0, replaced:0, promoted:0, problemCount:0 };
    app.sites=createSites();
    app.workers=[];
    app.nextReplacements=[];
    app.clouds = [
      {x:180, y:90, speed:8},
      {x:880, y:150, speed:11},
      {x:1680, y:110, speed:6},
      {x:2450, y:140, speed:9}
    ];
    app.sites.forEach(site => {
      for(let i=0;i<site.needWorkers;i++) app.workers.push(createWorker(site.id));
    });
    renderEverything();
    updateHUD();
    hideSiteMenu();
    els.endOverlay.classList.remove('show');
  }

  function worldToScreen(x,y){ return { x:(x - app.camX) * app.scale, y:(y - app.camY) * app.scale }; }

  function moveCamera(dx,dy){
    const maxX = Math.max(0, app.worldW - app.viewportW / app.scale);
    const maxY = Math.max(0, app.worldH - app.viewportH / app.scale);
    app.camX = clamp(app.camX + dx, 0, maxX);
    app.camY = clamp(app.camY + dy, 0, maxY);
    renderEverything();
  }

  function centerInitial(){
    app.viewportW = window.innerWidth;
    app.viewportH = window.innerHeight;
    app.scale = clamp(Math.min(app.viewportW / 1800, app.viewportH / 1080), 0.58, 0.92);
    app.camX = 320;
    app.camY = 150;
    renderEverything();
  }

  const selectedSite = () => app.sites.find(s => s.id === app.selectedSiteId) || null;
  const selectedWorker = () => app.workers.find(w => w.id === app.selectedWorkerId) || null;
  const siteWorkers = siteId => app.workers.filter(w => w.siteId === siteId && !w.leaving);

  function sitePower(siteId){
    const site = app.sites.find(s => s.id===siteId);
    const ws = siteWorkers(siteId);
    return ws.reduce((sum,w) => sum + ((w.speed / 90) * statusMeta[w.state].speed * site.speed), 0);
  }

  function chooseWorkerForSite(siteId){
    const ws = siteWorkers(siteId).sort((a,b) => {
      const sa = statusMeta[a.state].speed * (a.speed/100);
      const sb = statusMeta[b.state].speed * (b.speed/100);
      return sa - sb;
    });
    return ws[0] || null;
  }

  function openSiteMenu(siteId, workerId=null){
    app.selectedSiteId = siteId;
    const team = siteWorkers(siteId);
    app.selectedWorkerId = workerId || chooseWorkerForSite(siteId)?.id || team[0]?.id || null;
    renderSiteMenu();
    placeSiteMenu();
    playSound('click');
  }

  function hideSiteMenu(){
    app.selectedSiteId = null;
    app.selectedWorkerId = null;
    els.siteMenu.classList.add('hidden');
  }

  function renderSiteMenu(){
    const site = selectedSite();
    if(!site || app.ended){ hideSiteMenu(); return; }
    els.siteMenuTitle.textContent = `${site.title} • ${Math.round(site.progress)}%`;
    els.siteMenuSub.textContent = `Сила: ${sitePower(site.id).toFixed(1)}`;

    const workers = siteWorkers(site.id);
    els.siteWorkersList.innerHTML = workers.map(w => {
      const active = w.id === app.selectedWorkerId ? 'active' : '';
      return `
        <div class="site-worker-row ${active}" data-site-worker="${w.id}">
          <img class="site-worker-avatar" src="${w.asset}" alt="${w.name}">
          <div>
            <div class="site-worker-top">
              <div class="site-worker-name">${w.name}</div>
              <div class="site-worker-emoji">${statusMeta[w.state].emoji}</div>
            </div>
            <div class="mini-meters">
              <div class="mini-line">
                <span>⚙️</span>
                <div class="mini-track"><div class="mini-fill" style="width:${clamp(w.speed,0,100)}%"></div></div>
                <span>${Math.round(w.speed)}</span>
              </div>
              <div class="mini-line">
                <span>❤</span>
                <div class="mini-track"><div class="mini-fill mood" style="width:${clamp(w.mood,0,100)}%"></div></div>
                <span>${Math.round(w.mood)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    els.siteWorkersList.querySelectorAll('[data-site-worker]').forEach(node => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        app.selectedWorkerId = node.dataset.siteWorker;
        renderSiteMenu();
        placeSiteMenu();
        playSound('click');
      });
    });

    const hasWorker = !!selectedWorker();
    els.promoteBtn.disabled = !hasWorker;
    els.replaceBtn.disabled = !hasWorker;
    els.fireBtn.disabled = !hasWorker;
    els.siteMenu.classList.remove('hidden');
  }

  function placeSiteMenu(){
    const site = selectedSite();
    if(!site || app.ended){ hideSiteMenu(); return; }
    const p = worldToScreen(site.x + 150, site.y + 40);
    const menuW = Math.min(320, window.innerWidth - 24);
    const left = clamp(p.x, 12 + menuW/2, window.innerWidth - 12 - menuW/2);
    const top = clamp(p.y, 92, window.innerHeight - 240);
    if(window.innerWidth <= 640){
      els.siteMenu.style.left = `${clamp(left - menuW/2, 12, window.innerWidth - menuW - 12)}px`;
      els.siteMenu.style.top = `${top}px`;
    } else {
      els.siteMenu.style.left = `${left}px`;
      els.siteMenu.style.top = `${top}px`;
    }
  }

  function promoteWorker(){
    const w = selectedWorker();
    if(!w) return;
    w.promoteCount += 1;
    w.state = 'normal';
    w.speed = clamp(w.speed + randInt(8,15), 60, 100);
    w.mood = clamp(w.mood + randInt(12,18), 0, 100);
    app.budget -= 450;
    app.timeLeft = Math.max(0, app.timeLeft - 1);
    app.reputation = clamp(app.reputation + 2, 0, 100);
    app.stats.promoted += 1;
    app.stats.helped += 1;
    playSound('support');
    renderSiteMenu();
    updateHUD();
  }

  function startLeaving(w){
    w.leaving = true;
    w.state = 'normal';
    w.leaveX = -140;
    w.leaveY = app.worldH - 130;
    if(app.selectedWorkerId === w.id) app.selectedWorkerId = null;
  }

  function replaceWorker(){
    const w = selectedWorker();
    if(!w || w.leaving) return;
    startLeaving(w);
    app.budget += 350;
    app.reputation = clamp(app.reputation - 4, 0, 100);
    app.stats.replaced += 1;
    app.stats.jobless += 1;
    app.nextReplacements.push({ siteId: w.siteId, timer: 1.8 });
    playSound('fire');
    const fallback = chooseWorkerForSite(w.siteId);
    app.selectedWorkerId = fallback?.id || null;
    renderSiteMenu();
    updateHUD();
  }

  function fireWorker(){
    const w = selectedWorker();
    if(!w || w.leaving) return;
    startLeaving(w);
    app.budget += 700;
    app.reputation = clamp(app.reputation - 7, 0, 100);
    app.stats.fired += 1;
    app.stats.jobless += 1;
    playSound('fire');
    const remaining = chooseWorkerForSite(w.siteId);
    app.selectedWorkerId = remaining?.id || null;
    renderSiteMenu();
    updateHUD();
  }

  function scheduleIssues(){
    const candidates = app.workers.filter(w => !w.leaving && !w.entering && w.state === 'normal');
    if(!candidates.length) return;
    const w = pick(candidates);
    const roll = Math.random();
    w.state = roll < 0.44 ? 'slow' : roll < 0.68 ? 'weak' : roll < 0.88 ? 'scared' : 'reckless';
    w.mood = clamp(w.mood - randInt(6,15), 0, 100);
    app.stats.problemCount += 1;
    playSound('warn');
    if(app.selectedSiteId === w.siteId) renderSiteMenu();
  }

  function updateSites(dtSec){
    app.sites.forEach(site => {
      if(site.finished) return;
      const ws = siteWorkers(site.id);
      let power = 0;
      ws.forEach(w => {
        const status = statusMeta[w.state];
        power += (w.speed / 90) * status.speed * site.speed;
      });
      site.progress += power * dtSec * 1.9;
      if(site.progress >= 100){
        site.progress = 100;
        site.finished = true;
        app.built += 1;
        app.budget += site.reward;
        app.reputation = clamp(app.reputation + 5, 0, 100);
        playSound('complete');
      }
    });
  }

  function updateWorkers(dtSec){
    const walkSpeed = 130;
    app.workers.forEach(w => {
      if(!w.leaving && !w.entering){
        w.mood = clamp(w.mood + statusMeta[w.state].mood * 100 * dtSec, 0, 100);
        if(w.mood < 24 && w.state === 'normal') w.state = Math.random() < 0.5 ? 'slow' : 'scared';
      }
      if(w.entering){
        const dx = w.targetX - w.x;
        const dy = w.targetY - w.y;
        const d = Math.hypot(dx,dy);
        if(d < 4){
          w.x = w.targetX; w.y = w.targetY; w.entering = false;
        } else {
          w.x += dx / d * walkSpeed * dtSec;
          w.y += dy / d * walkSpeed * dtSec;
        }
      } else if(w.leaving){
        const dx = w.leaveX - w.x;
        const dy = w.leaveY - w.y;
        const d = Math.hypot(dx,dy);
        if(d < 8){
          w.remove = true;
        } else {
          w.x += dx / d * walkSpeed * dtSec;
          w.y += dy / d * walkSpeed * dtSec;
        }
      } else {
        const site = app.sites.find(s => s.id === w.siteId);
        const driftX = Math.sin((Date.now()/1000 + w.x) * .7) * 0.18;
        w.x = clamp(w.x + driftX, site.x - 56, site.x + 56);
      }
    });
    app.workers = app.workers.filter(w => !w.remove);
  }

  function updateReplacements(dtSec){
    app.nextReplacements.forEach(r => r.timer -= dtSec);
    const ready = app.nextReplacements.filter(r => r.timer <= 0);
    ready.forEach(r => {
      const nw = createWorker(r.siteId, true);
      app.workers.push(nw);
      if(app.selectedSiteId === r.siteId && !app.selectedWorkerId) app.selectedWorkerId = nw.id;
      playSound('hire');
    });
    app.nextReplacements = app.nextReplacements.filter(r => r.timer > 0);
    if(app.selectedSiteId) renderSiteMenu();
  }

  function updateClouds(dtSec){
    app.clouds.forEach(c => { c.x += c.speed * dtSec; if(c.x > app.worldW + 220) c.x = -220; });
  }

  function roadPoint(t){
    const pts = [[180,1460],[720,1460],[1300,1460],[2080,1460],[2550,1280],[2550,760],[2550,250],[2100,180],[1380,180],[720,180],[180,250],[180,760],[180,1460]];
    const p = (t % 1) * (pts.length - 1);
    const i = Math.floor(p);
    const local = p - i;
    const a = pts[i], b = pts[i+1];
    return { x: a[0] + (b[0] - a[0]) * local, y: a[1] + (b[1] - a[1]) * local, angle: Math.atan2(b[1]-a[1], b[0]-a[0]) * 180 / Math.PI };
  }

  function tick(dt){
    if(!app.running || app.ended) return;
    const dtSec = dt / 1000;
    app.secAcc += dtSec;
    app.issueAcc += dtSec;
    app.truckT += dtSec * 0.03;
    updateWorkers(dtSec);
    updateSites(dtSec);
    updateReplacements(dtSec);
    updateClouds(dtSec);
    if(app.issueAcc >= 6.3){ app.issueAcc = 0; scheduleIssues(); }

    while(app.secAcc >= 1){
      app.secAcc -= 1;
      app.timeLeft -= 1;
      app.reputation = clamp(app.reputation - app.workers.filter(w => ['slow','weak','scared','reckless'].includes(w.state)).length * 0.22, 0, 100);
      if(app.timeLeft <= 0 || app.built >= app.totalSites){ finishGame(); break; }
    }

    updateHUD();
    renderEverything();
    if(app.selectedSiteId) placeSiteMenu();
  }

  function finishGame(){
    if(app.ended) return;
    app.ended = true;
    app.running = false;
    playSound('end');
    hideSiteMenu();
    const items = [
      ['Построено', `${app.built}/${app.totalSites}`],
      ['Бюджет', fmtMoney(app.budget)],
      ['Репутация', `${Math.round(app.reputation)}%`],
      ['Без работы', `${app.stats.jobless}`],
      ['Уволили', `${app.stats.fired}`],
      ['Заменили', `${app.stats.replaced}`],
      ['Повысили', `${app.stats.promoted}`],
      ['Проблем', `${app.stats.problemCount}`]
    ];
    els.statsGrid.innerHTML = items.map(([k,v]) => `<div class="stat-card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    els.endOverlay.classList.add('show');
  }

  function updateHUD(){
    els.budget.textContent = fmtMoney(app.budget);
    els.time.textContent = fmtTime(Math.max(0, app.timeLeft));
    els.built.textContent = `${app.built}/${app.totalSites}`;
    els.rep.textContent = `${Math.round(app.reputation)}%`;
    els.soundBtn.textContent = app.sound ? '🔊' : '🔈';
  }

  function createRoads(){
    const pieces = [
      ['road-h', 130, 220, 2480, 110], ['road-h', 130, 710, 2520, 110], ['road-h', 130, 1410, 2480, 110],
      ['road-v', 130, 180, 110, 1350], ['road-v', 820, 180, 110, 1340], ['road-v', 1510, 180, 110, 1340], ['road-v', 2440, 180, 110, 1110]
    ];
    return pieces.map(([cls,x,y,w,h]) => `<div class="${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`).join('');
  }

  function renderEverything(){
    els.world.style.transform = `translate(${-app.camX * app.scale}px, ${-app.camY * app.scale}px) scale(${app.scale})`;
    const bg = `
      ${createRoads()}
      <div class="park" style="left:2060px;top:980px;width:430px;height:340px"></div>
      <div class="park" style="left:188px;top:940px;width:300px;height:270px"></div>
      <div class="park" style="left:980px;top:970px;width:220px;height:190px"></div>
      <div class="pond" style="left:1980px;top:380px;width:340px;height:210px"></div>
      <div class="gate" style="left:52px;top:1450px">🚪</div>
      <div class="crane" style="left:2680px;top:1280px"><img src="assets/decor/crane.svg" alt=""></div>
      <div class="tree" style="left:2180px;top:1080px"><img src="assets/decor/tree.svg" alt=""></div>
      <div class="tree" style="left:2280px;top:1140px"><img src="assets/decor/tree.svg" alt=""></div>
      <div class="tree" style="left:355px;top:1080px"><img src="assets/decor/tree.svg" alt=""></div>
      <div class="tree" style="left:1080px;top:1140px"><img src="assets/decor/tree.svg" alt=""></div>
      ${app.clouds.map(c => `<div class="cloud" style="left:${c.x}px;top:${c.y}px"></div>`).join('')}
    `;

    const sites = app.sites.map(site => {
      const stroke = Math.round((site.progress / 100) * 628);
      return `
        <div class="site" data-site="${site.id}" style="left:${site.x - 145}px; top:${site.y - 120}px">
          <div class="site-shadow"></div>
          <div class="site-core ${site.finished ? 'site-finished' : ''}">
            <svg class="progress-ring" viewBox="0 0 220 220" aria-hidden="true">
              <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(91,124,250,.12)" stroke-width="10"></circle>
              <circle cx="110" cy="110" r="100" fill="none" stroke="${site.finished ? '#2fbf71' : '#5b7cfa'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="628" stroke-dashoffset="${628-stroke}" transform="rotate(-90 110 110)"></circle>
            </svg>
            <img src="${site.finished ? site.finished : site.asset}" alt="">
          </div>
          <div class="site-label">${Math.round(site.progress)}%</div>
        </div>`;
    }).join('');

    const workers = app.workers.map(w => `
      <div class="worker ${w.entering ? 'entering' : ''} ${w.leaving ? 'leaving' : ''}" style="left:${w.x}px;top:${w.y}px">
        ${w.id === app.selectedWorkerId ? '<div class="selection-ring"></div>' : ''}
        ${w.state !== 'normal' && !w.leaving ? `<div class="bubble">${statusMeta[w.state].emoji}</div>` : ''}
        <img src="${w.asset}" alt="${w.name}">
      </div>`).join('');

    const truck = roadPoint(app.truckT);
    const truckHtml = `<div class="truck" style="left:${truck.x}px;top:${truck.y}px;transform:translate(-50%,-50%) rotate(${truck.angle}deg)"><img src="assets/decor/truck.svg" alt=""></div>`;
    const sparks = app.sites.filter(s => !s.finished).map((s,i)=>`<div class="spark" style="left:${s.x + 62 + (i%2)*12}px;top:${s.y + 26 + (i%3)*8}px"></div>`).join('');
    els.world.innerHTML = bg + sites + truckHtml + workers + sparks;

    els.world.querySelectorAll('[data-site]').forEach(node => {
      node.addEventListener('pointerdown', e => e.stopPropagation());
      node.addEventListener('click', e => {
        e.stopPropagation();
        openSiteMenu(node.dataset.site);
      });
    });
  }

  function onWheel(e){
    e.preventDefault();
    const oldScale = app.scale;
    app.scale = clamp(app.scale + (e.deltaY < 0 ? 0.06 : -0.06), app.minScale, app.maxScale);
    const rect = els.viewport.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldX = app.camX + sx / oldScale;
    const worldY = app.camY + sy / oldScale;
    app.camX = worldX - sx / app.scale;
    app.camY = worldY - sy / app.scale;
    moveCamera(0,0);
  }

  function loop(ts){
    if(!app.lastTime) app.lastTime = ts;
    const dt = Math.min(33, ts - app.lastTime);
    app.lastTime = ts;
    tick(dt);
    requestAnimationFrame(loop);
  }

  function bind(){
    els.startBtn.addEventListener('click', () => {
      els.startOverlay.classList.remove('show');
      app.running = true;
      playSound('click');
    });
    els.playAgainBtn.addEventListener('click', () => {
      els.endOverlay.classList.remove('show');
      resetGame();
      els.startOverlay.classList.add('show');
    });
    els.soundBtn.addEventListener('click', () => { app.sound = !app.sound; updateHUD(); playSound('click'); });
    els.restartBtn.addEventListener('click', () => { playSound('click'); resetGame(); els.startOverlay.classList.add('show'); });
    els.promoteBtn.addEventListener('click', e => { e.stopPropagation(); promoteWorker(); });
    els.replaceBtn.addEventListener('click', e => { e.stopPropagation(); replaceWorker(); });
    els.fireBtn.addEventListener('click', e => { e.stopPropagation(); fireWorker(); });
    els.siteMenu.addEventListener('click', e => e.stopPropagation());
    els.siteMenu.addEventListener('pointerdown', e => e.stopPropagation());

    els.viewport.addEventListener('pointerdown', e => {
      if(e.target.closest('[data-site]') || e.target.closest('#siteMenu')) return;
      dragState = { x:e.clientX, y:e.clientY, camX:app.camX, camY:app.camY };
      dragMoved = false;
      els.viewport.classList.add('dragging');
    });
    window.addEventListener('pointerup', e => {
      const hadDrag = !!dragState;
      dragState = null;
      els.viewport.classList.remove('dragging');
      if(hadDrag && !dragMoved && !e.target.closest('[data-site]') && !e.target.closest('#siteMenu')) hideSiteMenu();
    });
    window.addEventListener('pointermove', e => {
      if(!dragState) return;
      const dx = (e.clientX - dragState.x) / app.scale;
      const dy = (e.clientY - dragState.y) / app.scale;
      if(Math.abs(e.clientX - dragState.x) > 4 || Math.abs(e.clientY - dragState.y) > 4) dragMoved = true;
      app.camX = dragState.camX - dx;
      app.camY = dragState.camY - dy;
      moveCamera(0,0);
      if(app.selectedSiteId) placeSiteMenu();
    });
    els.viewport.addEventListener('wheel', onWheel, { passive:false });
    window.addEventListener('resize', () => {
      app.viewportW = window.innerWidth;
      app.viewportH = window.innerHeight;
      moveCamera(0,0);
      renderEverything();
      if(app.selectedSiteId) placeSiteMenu();
    });
  }

  initSounds();
  bind();
  resetGame();
  centerInitial();
  requestAnimationFrame(loop);
})();
