(() => {
  function show(profile){
    if(!profile||profile.portalRole==='terminal'||document.querySelector('.portal-common-nav'))return;
    const nav=document.createElement('nav');nav.className='portal-common-nav';nav.setAttribute('aria-label','院内ポータル共通ナビ');
    const page=location.pathname.split('/').pop()||'index.html';
    const links=[['index.html','ホーム'],['task-manager.html','タスク'],['shift.html','シフト'],['schedule.html','日程調整'],['meeting-management.html','ミーティング']];
    if(profile.staffId!=='guest')links.push(['https://ssl.jobcan.jp/employee','Jobcan（本運用）'],['attendance.html','院内勤怠（試験）']);
    for(const [href,label] of links){const a=document.createElement('a');a.href=href;a.textContent=label;if(href===page)a.setAttribute('aria-current','page');if(href.startsWith('https:')){a.target='_blank';a.rel='noopener';}nav.append(a);}
    if(page==='index.html'){
      nav.dataset.home='true';
      const menu=document.createElement('button');menu.type='button';menu.textContent='メニュー';menu.addEventListener('click',()=>window.togglePortalMenu?.());nav.append(menu);
    }
    document.body.prepend(nav);
  }
  window.addEventListener('portalAuthReady',e=>show(e.detail));
  if(window.portalAuth)show(window.portalAuth.profile);
})();
