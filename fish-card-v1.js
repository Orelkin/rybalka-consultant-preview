const FC_EVIDENCE = {
  reference_review:'Биология · видовой справочник',
  official_review:'Биология · официальный обзор', primary_research:'Научное исследование',
  personal_report:'Личный опыт', editorial_practice:'Практика · требует проверки'
};
function fp25Personal(f){
  const needles=(f.aliases?.length?f.aliases:[f.name]).map(s=>s.toLowerCase());
  return (DATA.diary||[]).filter(d=>needles.some(n=>`${d.result||''} ${d.method||''} ${d.conclusion||''}`.toLowerCase().includes(n)));
}
function fp25PersonalHtml(personal){return fishPersonalHtml(personal);}
function fp25Tab(tab){
  const host=document.getElementById('fishProfileContent');
  host.querySelectorAll('.fp25-tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
  host.querySelectorAll('.fp25-pane').forEach(el=>el.classList.toggle('active',el.dataset.pane===tab));
}
function fp25Sources(open){
  const sheet=document.getElementById('fp25SourceSheet');
  if(sheet)sheet.style.display=open?'block':'none';
}
function fishCardV1Section(section, knowledge){
  const esc=fish25Esc;
  const claims=new Map(knowledge.claims.map(c=>[c.id,c]));
  const sources=new Map(knowledge.sources.map(s=>[s.id,s]));
  return `<section class="fp25-card" data-knowledge-section="${esc(section.id)}">
    <div class="fp25-card-title">${esc(section.title)}</div>
    ${section.claim_ids.length ? section.claim_ids.map(id=>{
      const c=claims.get(id);
      if(!c)return '<div class="fp25-note">Сведения требуют восстановления.</div>';
      return `<div class="fc1-claim" data-claim-id="${esc(c.id)}">
        <div class="fp25-lead">${esc(c.text)}</div>
        <details class="fc1-evidence"><summary>${esc(FC_EVIDENCE[c.evidence]||'Требует проверки')} · источник и применимость</summary>
          <p>${esc(c.scope)}</p>${c.source_ids.map(sid=>{
            const s=sources.get(sid); if(!s)return '';
            return `<div class="fc1-source">${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`:esc(s.title)}<p>${esc(s.limits)}</p></div>`;
          }).join('')}
        </details></div>`;
    }).join('') : `<div class="fp25-lead">${esc(section.empty_text||'Данных пока недостаточно.')}</div>`}
  </section>`;
}
function applyFishCardV1(f, host){
  const pack=window.FISH_KNOWLEDGE_V1;
  const card=pack?.cards.find(c=>c.catalog_name===f.name);
  if(!card){
    const tabs=host.querySelector('.fp25-tabs');
    const note=document.createElement('div');
    note.className='fp25-note fc1-review-note';
    note.textContent='Профиль из прежней версии. Проверка утверждений по источникам ещё не завершена.';
    if(tabs)tabs.after(note); else host.appendChild(note);
    return;
  }
  for(const tab of ['overview','where','how','season','tips']){
    const pane=host.querySelector(`[data-pane="${tab}"]`);
    if(pane)pane.innerHTML=card.sections.filter(s=>s.tab===tab).map(s=>fishCardV1Section(s,pack)).join('');
  }
  const sheet=host.querySelector('#fp25SourceSheet');
  if(sheet){
    const used=new Set(card.sections.flatMap(s=>s.claim_ids).flatMap(id=>pack.claims.find(c=>c.id===id)?.source_ids||[]));
    sheet.innerHTML=`<button class="fp25-close" onclick="fp25Sources(false)">×</button><h3>Источники и достоверность</h3>
      <p>Проверка: ${fish25Esc(card.reviewed_at)}. Каждое утверждение связано с источником; исследования, практика и личный опыт разделены.</p>
      <div class="fp25-source-list">${pack.sources.filter(s=>used.has(s.id)).map(s=>`<div>${s.url?`<a href="${fish25Esc(s.url)}" target="_blank" rel="noopener">${fish25Esc(s.title)}</a>`:fish25Esc(s.title)}<p>${fish25Esc(s.limits)}</p></div>`).join('')}</div>${fishImageCreditHtml(f)}`;
  }
}
