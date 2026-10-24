import {canManage} from './goal-metrics-model.mjs?v=20261023-1';
export function configureMetricsNavigation(profile,life) {
  const params=new URLSearchParams(location.search),embedded=params.get('embedded')==='1',manager=canManage(profile);
  if(embedded){document.body.classList.add('metrics-embedded');}
  else{
    const nav=document.createElement('nav');nav.className='metrics-navigation';nav.setAttribute('aria-label','目標・実績');
    for(const [view,label] of [['goals','目標と実績'],...(manager?[['input','月次入力'],['analysis','経営分析']]:[])]){
      const link=document.createElement('a');link.textContent=label;const query=new URLSearchParams(location.search);query.delete('embedded');query.delete('view');link.href='./goal-metrics.html?'+query+'#'+view;if((params.get('view')||'goals')===view)link.setAttribute('aria-current','page');nav.append(link);
    }
    document.body.querySelector('header')?.after(nav);
  }
  if(manager&&params.get('view')==='input')document.querySelector('.analysis-panel')?.setAttribute('hidden','');
  if(!manager)document.querySelector('.break-even-panel')?.setAttribute('hidden','');
  const style=document.createElement('style');
  style.textContent='.metrics-navigation{display:flex;gap:16px;padding:12px 22px;background:#fff}.metrics-navigation a{color:#176b4b;font-weight:bold}.metrics-navigation a[aria-current=page]{text-decoration:none;border-bottom:3px solid #176b4b}.metrics-embedded>header{display:none}[hidden]{display:none!important}';
  document.head.append(style);
  life.add(()=>{document.querySelector('main')?.replaceChildren();document.querySelectorAll('.modal-backdrop').forEach(el=>el.remove());document.querySelector('.metrics-navigation')?.remove();});
}

