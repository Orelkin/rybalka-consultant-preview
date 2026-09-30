(async function(){
  'use strict';
  const host=document.getElementById('personalDiary');
  if(!host)return;
  const status=host.querySelector('[role="status"]');
  const form=host.querySelector('form');
  const list=host.querySelector('.pd-list');
  const archiveButton=host.querySelector('[data-action="archive"]');
  let records=[], showArchive=false, editingId=null, pendingImport=null, exportUrl=null;
  const fields=['date','location','fish','result','method','conclusion','notes'];
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('pd-error',error);};
  const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  function button(text,action){const b=element('button','pd-button',text);b.type='button';b.addEventListener('click',action);return b;}
  function openForm(record){
    editingId=record?.id||null;
    form.reset();
    const now=new Date();
    form.elements.date.value=record?.date||[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    for(const key of fields.filter(k=>k!=='date'))form.elements[key].value=record?.[key]||'';
    form.querySelector('h3').textContent=record?'Изменить запись':'Новая рыбалка';
    form.hidden=false;form.elements.location.focus();
  }
  async function refresh(){
    records=await PersonalStore.list({includeArchived:true});
    window.PERSONAL_DIARY_RECORDS=records.filter(r=>!r.archived);
    host.querySelector('.pd-export-preview').hidden=true;
    if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;}
    const archived=records.filter(r=>r.archived).length;
    archiveButton.textContent=showArchive?'К моим записям':`Архив (${archived})`;
    list.replaceChildren();
    const visible=records.filter(r=>r.archived===showArchive).sort((a,b)=>b.date.localeCompare(a.date));
    if(!visible.length){list.append(element('p','pd-muted',showArchive?'В архиве пока нет записей.':'Здесь появятся ваши новые рыбалки. История из проекта сохранена ниже.'));return;}
    for(const r of visible){
      const card=element('article','pd-record');
      card.append(element('div','pd-date',r.date.split('-').reverse().join('.')),element('h3','',r.location));
      if(r.fish)card.append(element('p','pd-muted',`Рыба: ${r.fish}`));
      card.append(element('p','pd-text',r.result));
      for(const [key,label] of [['method','Метод'],['conclusion','Вывод'],['notes','Заметки']]){
        if(r[key])card.append(element('strong','',label),element('p','pd-text',r[key]));
      }
      const actions=element('div','pd-actions');
      if(!r.archived)actions.append(button('Изменить',()=>openForm(r)));
      actions.append(button(r.archived?'Восстановить':'В архив',async()=>{
        try{await PersonalStore.archive(r.id,!r.archived);await refresh();message(r.archived?'Запись восстановлена.':'Запись перенесена в архив. Её можно восстановить.');}
        catch(e){message(e.message,true);}
      }));
      card.append(actions);list.append(card);
    }
  }
  host.querySelector('[data-action="new"]').addEventListener('click',()=>openForm());
  host.querySelector('[data-action="cancel"]').addEventListener('click',()=>{form.hidden=true;editingId=null;});
  archiveButton.addEventListener('click',async()=>{showArchive=!showArchive;await refresh();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{
      const data=Object.fromEntries(fields.map(key=>[key,form.elements[key].value]));
      if(editingId)await PersonalStore.update(editingId,data);else await PersonalStore.add(data);
      form.hidden=true;editingId=null;showArchive=false;await refresh();message('Запись сохранена в этом браузере.');
    }catch(e){message(e.message,true);}finally{submit.disabled=false;}
  });
  host.querySelector('[data-action="export"]').addEventListener('click',async()=>{
    try{
      const backup=await PersonalStore.exportBackup();
      const text=JSON.stringify(backup);
      if(exportUrl)URL.revokeObjectURL(exportUrl);
      exportUrl=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
      const panel=host.querySelector('.pd-export-preview');
      const a=panel.querySelector('a');a.href=exportUrl;a.download=`rybalka-personal-data-${new Date().toISOString().slice(0,10)}.json`;
      panel.querySelector('textarea').value=text;panel.hidden=false;
      message(`Копия подготовлена: рыбалок — ${backup.data.diary.length}, снастей — ${(backup.data.gear||[]).length}, включая архив. Сохраните файл вместе с архивом проекта.`);
    }catch(e){message(e.message,true);}
  });
  host.querySelector('[data-action="copy-backup"]').addEventListener('click',async()=>{
    const textarea=host.querySelector('.pd-export-preview textarea');
    try{
      await Promise.race([navigator.clipboard.writeText(textarea.value),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Копирование не подтверждено.')),1500))]);
      message('Содержимое копии скопировано. Его можно сохранить в текстовый файл с расширением .json.');
    }
    catch(e){message('Автоматическое копирование недоступно. Выделите и скопируйте содержимое копии вручную.',true);}
  });
  const input=host.querySelector('[type="file"]');
  const importPreview=host.querySelector('.pd-import-preview');
  const importConfirm=host.querySelector('[data-action="confirm-import"]');
  host.querySelector('[data-action="import"]').addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    pendingImport=null;importPreview.hidden=true;
    try{
      const file=input.files[0];if(!file)return;
      if(file.size>8*1024*1024)throw new Error('Файл слишком большой: максимум 8 МБ.');
      const data=JSON.parse(await file.text());
      const validated=PersonalStore.validateImport(data);pendingImport=data;
      importPreview.querySelector('p').textContent=`Копия проверена. Рыбалок: ${validated.count}, снастей: ${validated.gearCount||0}. Новые записи будут добавлены, более новые версии заменят записи с тем же идентификатором. При конфликте сохранится запись этого браузера.`;
      importPreview.hidden=false;
    }catch(e){message(`Импорт не выполнен: ${e.message}`,true);}finally{input.value='';}
  });
  importConfirm.addEventListener('click',async()=>{
    if(!pendingImport)return;importConfirm.disabled=true;
    try{
      const result=await PersonalStore.importBackup(pendingImport);
      pendingImport=null;importPreview.hidden=true;await refresh();
      const gear=result.gear||{added:0,updated:0,conflicts:0};
      message(`Данные объединены. Рыбалки: добавлено ${result.added}, обновлено ${result.updated}. Снасти: добавлено ${gear.added}, обновлено ${gear.updated}. Конфликтов: ${result.conflicts+gear.conflicts}.`);
    }catch(e){message(`Импорт не выполнен: ${e.message}`,true);}finally{importConfirm.disabled=false;}
  });
  host.querySelector('[data-action="cancel-import"]').addEventListener('click',()=>{pendingImport=null;importPreview.hidden=true;});
  const inheritedSearch=globalSearchAll;
  globalSearchAll=function(q){
    const query=String(q||'').trim().toLowerCase();
    const personal=query?records.filter(r=>!r.archived&&fields.some(k=>r[k].toLowerCase().includes(query))).map(r=>({
      type:'Мой дневник',title:esc(r.location),text:esc(`${r.date} · ${r.result}`),
      action:()=>{go('diary');showArchive=false;refresh();openForm(r);}
    })):[];
    return [...personal,...inheritedSearch(q)].slice(0,30);
  };
  window.addEventListener('rybalka-personal-data-changed',()=>{refresh().catch(e=>message(e.message,true));});
  try{await PersonalStore.ready();await refresh();}
  catch(e){message('Личные записи недоступны. Проверьте, разрешено ли браузеру сохранять данные для этой страницы.',true);host.querySelectorAll('button').forEach(b=>b.disabled=true);}
})();
