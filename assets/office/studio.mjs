/* Scene is independent of the existing board. Timezone never follows the viewer's device. */
export const TIME_ZONE = 'Asia/Almaty';
export function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}
export function lightingFor(minutes, mode = 'auto') {
  let night;
  if (mode === 'day') night = 0;
  else if (mode === 'evening') night = .58;
  else if (mode === 'night') night = 1;
  else if (minutes < 360 || minutes >= 1140) night = 1;
  else if (minutes < 480) night = 1 - (minutes - 360) / 120;
  else if (minutes < 1020) night = 0;
  else night = .35 + .65 * (minutes - 1020) / 120;
  return {night, sky: night * .96, stars: Math.max(0, (night - .65) / .35), lamps: night * .78, brightness: 1 - night * .36, saturation: 1 - night * .21,
    label: night > .85 ? 'Ночная студия' : night > .05 ? 'Вечерний свет' : 'Дневной свет'};
}
export function safeTaskUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function tasksFor(items, name) {
  const canonical = s => String(s || '').trim().toLocaleLowerCase('ru');
  return items.filter(t => (Array.isArray(t.owners) ? t.owners : [t.owner]).some(n => canonical(n) === canonical(name)))
    .sort((a,b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) || String(a.due || '9').localeCompare(String(b.due || '9')));
}

if (typeof document !== 'undefined') init();
function init() {
  const $ = id => document.getElementById(id);
  const API_URL = 'https://script.google.com/macros/s/AKfycbzBWd4uyyfDpYFpPw9EAl_Adtm6e4mAiniJgj2uBRmBkP5G5zhpqmqu1cF1BFzKp-pR/exec';
  const params = new URLSearchParams(location.search);
  const key = params.get('k') || '';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const readSetting = (key, fallback) => {try {return localStorage.getItem(key) ?? fallback;} catch {return fallback;}};
  const saveSetting = (key, value) => {try {localStorage.setItem(key, value);} catch { /* storage may be disabled */ }};
  let mode = readSetting('axium-studio-light', 'auto');
  if (!['auto','day','evening','night'].includes(mode)) mode = 'auto';
  let motion = !reducedMotion.matches && readSetting('axium-studio-motion', 'on') === 'on';
  let teamVisible = readSetting('axium-studio-team', 'on') === 'on';
  let data = null, connection = key ? 'loading' : 'unconnected', activePerson = null, lastFocus = null;
  let activeMotion = false, motionTimer, returnTimer, walkTimer, travelerIndex = 0, loading = false;
  const members = [
    {id:'dima', name:'Дима', color:'#8aabc7', x:38.5, y:51, size:13},
    {id:'darya', name:'Дарья', color:'#ce9b9b', x:65, y:51.5, size:13},
    {id:'ellina', name:'Эллина', color:'#b9c39e', x:29.5, y:65, size:13.5},
    {id:'maxim', name:'Максим', color:'#e0bc7c', x:79.8, y:84, size:14.5},
    {id:'robot', name:'ИИ-помощник', color:'#9fc5d1', x:53, y:76, size:9, robot:true}
  ];
  $('boardLink').href = 'https://r0s1nante.github.io/axium-board/' + (key ? '?k=' + encodeURIComponent(key) : '');

  // Glass panes, excluding the cream window frames and monitor silhouettes.
  const windows = [
    {topL:436,topR:704,bottomL:449,bottomR:705},
    {topL:750,topR:1031,bottomL:752,bottomR:1026},
    {topL:1105,topR:1375,bottomL:1095,bottomR:1353}
  ];
  const paths = [];
  for (const w of windows) {
    const point = (u,y) => [w.topL + (w.bottomL-w.topL)*y/175 + u*((w.topR-w.topL)+(w.bottomR-w.bottomL-w.topR+w.topL)*y/175),y];
    for (let c=0;c<4;c++) for (const [y0,y1] of [[0,84],[92,172]]) {
      const u0=c/4+.009, u1=(c+1)/4-.009;
      const pts=[point(u0,y0),point(u1,y0),point(u1,y1),point(u0,y1)];
      paths.push('M'+pts.map(p=>p.map(n=>n.toFixed(2)).join(' ')).join('L')+'Z');
    }
  }
  $('panes').setAttribute('d',paths.join(' '));

  for (const [i,m] of members.entries()) {
    const el = document.createElement('button');
    el.className='avatar';el.dataset.member=m.id;
    el.style.cssText=`--x:${m.x}%;--y:${m.y}%;--size:${m.size}%;--color:${m.color};--delay:${-i*.9}s;z-index:${Math.round(m.y)}`;
    el.setAttribute('aria-label',m.robot ? 'ИИ-помощник — открыть информацию' : m.name+' — открыть задачи');
    const img=document.createElement('img');img.src=`assets/office/${m.id}.webp`;img.alt='';img.width=512;img.height=512;img.draggable=false;
    const label=document.createElement('span');label.className='avatar-label';const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');label.append(dot,document.createTextNode(m.name));el.append(img,label);
    el.addEventListener('click',()=>showPerson(m));$('people').append(el);m.el=el;
  }

  function updateLight() {
    const now=new Date(), mins=localMinutes(now), light=lightingFor(mins,mode);
    const variables={night:light.night,sky:light.sky,stars:light.stars,lamps:light.lamps,brightness:light.brightness,saturation:light.saturation};
    for (const [k,v]of Object.entries(variables)) document.documentElement.style.setProperty('--'+k,v);
    $('clock').textContent=new Intl.DateTimeFormat('ru-RU',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
    $('phase').textContent=light.label;
    $('sceneCaption').textContent=light.night>.85 ? 'Тихие часы. Идеи остаются.' : light.night>.05 ? 'Вечер в студии' : 'Студия в своём ритме';
    $('timeHint').textContent=mode==='auto' ? 'После 17:00 за окном темнеет' : 'Предпросмотр · время на часах реальное';
    for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  }
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;saveSetting('axium-studio-light',mode);updateLight();$('announcement').textContent='Освещение: '+b.textContent.trim();}));

  function home(m) { m.el.style.left=m.x+'%';m.el.style.top=m.y+'%';m.el.style.zIndex=Math.round(m.y); }
  function stopMovement() {
    clearTimeout(motionTimer);clearTimeout(returnTimer);clearTimeout(walkTimer);
    members.forEach(m=>{m.el.classList.remove('walking');home(m);});
  }
  function scheduleWalk() { clearTimeout(motionTimer);if(activeMotion)motionTimer=setTimeout(walk,14000); }
  function walk() {
    if(!activeMotion || !$('panel').hidden) {scheduleWalk();return;}
    const m=members[travelerIndex++ % members.length];
    // Paths stay on the open center floor; furniture footprints are never crossed.
    const destination=m.robot ? {x:58,y:66} : m.id==='ellina' ? {x:44,y:65} : m.id==='maxim' ? {x:72,y:70} : {x:m.x+4,y:61};
    m.el.classList.add('walking');m.el.style.left=destination.x+'%';m.el.style.top=destination.y+'%';m.el.style.zIndex=Math.round(destination.y);
    walkTimer=setTimeout(()=>m.el.classList.remove('walking'),4100);
    returnTimer=setTimeout(()=>{if(!activeMotion)return;m.el.classList.add('walking');home(m);walkTimer=setTimeout(()=>{m.el.classList.remove('walking');scheduleWalk();},4100);},8500);
  }
  function updateMotion() {
    const animate=motion&&!reducedMotion.matches&&!document.hidden;
    document.body.classList.toggle('paused',!animate);
    $('motionToggle').setAttribute('aria-pressed',String(motion&&!reducedMotion.matches));
    $('motionState').textContent=motion&&!reducedMotion.matches?'вкл.':'выкл.';
    $('motionToggle').disabled=reducedMotion.matches;
    $('motionToggle').title=reducedMotion.matches?'В системе включено уменьшение движения':'';
    $('people').classList.toggle('off',!teamVisible);$('people').inert=!teamVisible;
    $('teamToggle').setAttribute('aria-pressed',String(teamVisible));$('teamCount').textContent=teamVisible?'4 + ИИ':'скрыта';
    const shouldMove=animate&&teamVisible;
    if(shouldMove!==activeMotion){activeMotion=shouldMove;stopMovement();if(activeMotion)scheduleWalk();}
  }
  $('motionToggle').addEventListener('click',()=>{motion=!motion;saveSetting('axium-studio-motion',motion?'on':'off');updateMotion();});
  $('teamToggle').addEventListener('click',()=>{teamVisible=!teamVisible;saveSetting('axium-studio-team',teamVisible?'on':'off');updateMotion();});
  reducedMotion.addEventListener('change',updateMotion);
  document.addEventListener('visibilitychange',()=>{updateLight();updateMotion();});
  $('fullscreen').addEventListener('click',async()=>{try {if(document.fullscreenElement)await document.exitFullscreen();else await $('scene').requestFullscreen();}catch {$('announcement').textContent='Полноэкранный режим недоступен в этом браузере';}});
  if(!document.fullscreenEnabled) $('fullscreen').hidden=true;

  function openPanel(title,intro,eyebrow) {
    lastFocus=document.activeElement;$('panelTitle').textContent=title;$('panelIntro').textContent=intro;$('panelEyebrow').textContent=eyebrow;
    $('panelBody').replaceChildren();$('panel').hidden=false;$('scrim').hidden=false;document.querySelector('.app').inert=true;$('closePanel').focus();
  }
  function showPerson(m) {
    activePerson=m;
    if(m.robot) {
      openPanel('ИИ-помощник','Маленький коллега для больших идей.','КОМАНДА AXIUM');
      empty('Пока это персонаж офиса. Чат и выполнение задач можно подключить отдельным этапом.');return;
    }
    openPanel(m.name,'Задачи участника из вашей доски.','КОМАНДА AXIUM');renderPersonTasks(m);
  }
  function empty(text) {const el=document.createElement('div');el.className='empty-state';el.textContent=text;$('panelBody').append(el);}
  function renderPersonTasks(m) {
    $('panelBody').replaceChildren();
    if(!data) {empty(connection==='loading'?'Загружаем задачи…':connection==='error'?'Не удалось загрузить задачи. Сцена продолжает работать. Проверьте ключ доступа и подключение к доске.':'Откройте эту страницу с тем же параметром ?k=…, который используете для своей доски. Задачи появятся здесь автоматически.');return;}
    const items=tasksFor(data.items,m.name);
    $('panelIntro').textContent=items.length ? 'Задач в доске: '+items.length : 'Назначенных задач пока нет.';
    if(!items.length){empty('Здесь появятся задачи, в которых '+m.name+' указан(а) ответственным.');return;}
    for(const task of items) {
      const url=safeTaskUrl(task.url);const el=document.createElement(url?'a':'div');el.className='task-item'+(task.status==='overdue'?' overdue':'');
      if(url){el.href=url;el.target='_blank';el.rel='noopener noreferrer';}
      const title=document.createElement('div');title.textContent=task.title||'Задача без названия';
      const meta=document.createElement('small');meta.textContent=[task.project,task.status==='overdue'?'Просрочено':task.status==='waiting'?'Ждём клиента':null,task.due].filter(Boolean).join(' · ');el.append(title,meta);$('panelBody').append(el);
    }
  }
  const zones={coffee:{title:'Кофе & идеи',intro:'Место для короткой паузы и разговоров между проектами.',items:['Кофемашина и любимая кружка','Обсуждение идей перед съёмкой','Пять минут, чтобы переключиться']},gear:{title:'Зона съёмок',intro:'Всё для контента — в одном уголке студии.',items:['Камера и сменная оптика','Штатив для съёмок','Компактный LED-видеосвет','Кейс для хранения техники']}};
  document.querySelectorAll('[data-zone]').forEach(b=>b.addEventListener('click',()=>{
    activePerson=null;const z=zones[b.dataset.zone];openPanel(z.title,z.intro,'ПРОСТРАНСТВО СТУДИИ');const ul=document.createElement('ul');ul.className='zone-list';for(const text of z.items){const li=document.createElement('li');li.textContent=text;ul.append(li);}$('panelBody').append(ul);
  }));
  function closePanel(){$('panel').hidden=true;$('scrim').hidden=true;document.querySelector('.app').inert=false;activePerson=null;if(lastFocus?.isConnected)lastFocus.focus();}
  $('closePanel').addEventListener('click',closePanel);$('scrim').addEventListener('click',closePanel);
  document.addEventListener('keydown',event=>{
    if($('panel').hidden)return;
    if(event.key==='Escape')closePanel();
    if(event.key==='Tab') {const focusables=[...$('panel').querySelectorAll('button,a[href]')],first=focusables[0],last=focusables.at(-1);if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}
  });

  async function loadTasks() {
    if(!key||loading)return;
    loading=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(API_URL+'?k='+encodeURIComponent(key),{signal:controller.signal,referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const next=await response.json();if(next.error||!Array.isArray(next.items))throw new Error('Invalid board response');
      data=next;connection='connected';$('connection').textContent='Задачи подключены · обновление каждые 5 минут';
    }catch{connection='error';$('connection').textContent=data?'Не удалось обновить · показаны последние задачи':'Нет связи с доской · офис работает';}
    finally{clearTimeout(timeout);loading=false;if(activePerson&&!activePerson.robot)renderPersonTasks(activePerson);}
  }
  if(key)$('connection').textContent='Подключаем задачи…';
  $('roomImage').addEventListener('error',()=>{$('connection').textContent='Не удалось загрузить изображение офиса. Обновите страницу.';});
  updateLight();updateMotion();loadTasks();
  setInterval(updateLight,15000);
  setInterval(()=>{if(!document.hidden)loadTasks();},300000);
}
