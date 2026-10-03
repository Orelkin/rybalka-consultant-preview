/* Local Vosk/WASM dictation: audio and drafts never leave this browser. */
(() => {
  'use strict';
  const diary=document.getElementById('personalDiary');if(!diary)return;
  const base=new URL('.',document.baseURI), MODEL=new URL('assets/voice/vosk-small-ru-0.22-v2.tar.gz',base).href;
  const KEY='rybalka.voice-draft.v1', labels={fish:'Рыба',location:'Место',result:'Улов и поклёвки',method:'Снасти и метод',conditions:'Условия',conclusion:'Ваши наблюдения'};
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel=document.createElement('section');panel.className='vn-panel';
  panel.innerHTML=`<div class="vn-heading"><span aria-hidden="true">♩</span><h3>Голосовая заметка с рыбалки</h3></div><p>Расскажите где ловите, на что, какой улов и что заметили. Затем проверьте текст и добавьте выжимку в дневник.</p><div class="vn-actions"><button type="button" class="vn-primary" data-vn="start">Наговорить заметку</button><button type="button" data-vn="stop" disabled>Остановить</button><button type="button" data-vn="prepare">Подготовить диктовку · 50 МБ</button></div><p class="vn-status" role="status" aria-live="polite">Распознавание на устройстве · русский язык · бесплатно</p><label for="voiceTranscript">Что вы рассказали — можно исправить</label><textarea id="voiceTranscript" maxlength="5000" placeholder="Место: … Улов: … Снасти: … Условия: … Заметил: …"></textarea><p class="vn-partial" aria-live="off"></p><div class="vn-summary"></div><div class="vn-actions"><button type="button" class="vn-primary" data-vn="apply" disabled>В дневник</button><button type="button" data-vn="clear">Очистить черновик</button></div><div class="vn-audio" hidden><audio controls preload="none"></audio><a download="rybalka-voice-note.webm">Скачать запись голоса</a><p>Звук хранится до закрытия страницы. Скачайте его, если хотите оставить; текст войдёт в запись дневника.</p></div><details><summary>Как пользоваться на рыбалке</summary><p>Первый раз подготовьте диктовку через Wi-Fi: загрузятся бесплатный движок Vosk и русская модель, около 50 МБ. Распознавание выполняется здесь; голос не отправляется на сервер. На следующем запуске модель берётся из хранилища браузера, если оно не очищено.</p><p>Говорите короткими фразами и делайте паузы. Ветер, названия приманок и цифры могут распознаваться с ошибками. Выжимка распределяет сказанное по полям; предположения не превращаются в доказанные закономерности. Перед сохранением всё можно поправить.</p></details>`;
  diary.querySelector('form').before(panel);
  const area=panel.querySelector('textarea'), status=panel.querySelector('.vn-status');
  const b=key=>panel.querySelector(`[data-vn="${key}"]`);
  let model=null, preparing=null, stream=null, ctx=null, source=null, processor=null, mute=null, recognizer=null, recorder=null;
  let running=false, stopping=false, cancelled=false, cancelPrepare=null, session=0, prefix='', words=[], partial='', audioURL=null, maxTimer=null, fragmentHandler=null, pendingChunks=0,drainHandler=null,finalizing=false;
  const say=text=>{status.textContent=text;};
  function update(){
    const draft=VoiceNotesCore.extract(area.value);
    panel.querySelector('.vn-summary').innerHTML=Object.entries(labels).map(([key,label])=>`<div class="vn-fact"><strong>${label}</strong><p>${esc(draft[key]||'Не указано')}</p></div>`).join('');
    b('apply').disabled=!draft.text||running||stopping;
    try{localStorage.setItem(KEY,JSON.stringify({text:area.value,updatedAt:Date.now()}));}catch{say('Текст не удалось сохранить автоматически. Скопируйте его или добавьте в дневник.');}
  }
  function setButtons(){area.readOnly=running||stopping;b('start').disabled=running||stopping||!!preparing;b('stop').disabled=!running&&!preparing;b('prepare').disabled=running||stopping||!!preparing;b('clear').disabled=running||stopping||!!preparing;update();}
  async function loadLibrary(){
    if(window.Vosk)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('assets/voice/vosk-0.0.8.js',base).href;s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('Не удалось загрузить движок. Проверьте интернет.'));};document.head.appendChild(s);});
  }
  async function prepare(){
    if(model?.ready)return model;if(preparing)return preparing;
    cancelled=false;
    preparing=(async()=>{
      say('Готовим диктовку: первая загрузка около 50 МБ. Можно остановить.');
      await loadLibrary();if(cancelled)throw new Error('Подготовка остановлена.');
      // A stable URL lets Vosk reuse its extracted IndexedDB model across launches.
        model=new Vosk.Model(MODEL,-1);
        await new Promise((resolve,reject)=>{
          cancelPrepare=()=>{clearTimeout(timer);model?.terminate();reject(new Error('Подготовка остановлена.'));};
          const timer=setTimeout(()=>{model?.terminate();reject(new Error('Устройству не удалось подготовить диктовку. Попробуйте закрыть другие вкладки.'));},180000);
          model.on('load',m=>{clearTimeout(timer);m.result?resolve():reject(new Error('Не удалось открыть русскую модель.'));});
          model.on('error',()=>{clearTimeout(timer);reject(new Error('Ошибка движка диктовки. Попробуйте ещё раз.'));});
          model.worker.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Браузер не смог запустить диктовку. Попробуйте обновить страницу.'));});
        });
      if(cancelled){model?.terminate();model=null;throw new Error('Подготовка остановлена.');}
      say('Диктовка готова. Можно говорить — речь обрабатывается на этом устройстве.');return model;
    })().catch(error=>{model?.terminate();model=null;throw error;}).finally(()=>{preparing=null;cancelPrepare=null;setButtons();});
    setButtons();return preparing;
  }
  function textChanged(){area.value=[prefix,...words].filter(Boolean).join('\n').slice(0,5000);panel.querySelector('.vn-partial').textContent=partial;update();if(area.value.length>=5000&&running)stop('Достигнут предел заметки. Сохраните её и начните следующую.');}
  async function start(){
    if(running||preparing||stopping)return;
    if(!navigator.mediaDevices?.getUserMedia||!(window.AudioContext||window.webkitAudioContext)){say('Браузер не поддерживает микрофон для этой страницы. Откройте приложение по HTTPS в современном браузере.');return;}
    const own=++session;prefix=area.value.trim();words=[];partial='';pendingChunks=0;finalizing=false;
    // Create/resume inside the user's gesture, required on iOS.
    ctx=new (window.AudioContext||window.webkitAudioContext)();await ctx.resume();
    try{
      await prepare();if(own!==session)return;
      say('Разрешите микрофон. Запись начнётся после разрешения.');
      stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
      if(own!==session){stream.getTracks().forEach(t=>t.stop());return;}
      recognizer=new model.KaldiRecognizer(ctx.sampleRate);
      const ack=()=>{if(!finalizing){pendingChunks=Math.max(0,pendingChunks-1);if(pendingChunks===0)drainHandler?.();}};
      recognizer.on('result',m=>{if(own!==session)return;ack();const text=m.result?.text?.trim();if(text)words.push(text);partial='';textChanged();if(finalizing)fragmentHandler?.();});
      recognizer.on('partialresult',m=>{if(own!==session)return;ack();partial=m.result?.partial||'';if(!stopping)panel.querySelector('.vn-partial').textContent=partial;});
      recognizer.on('error',()=>{if(own===session&&running)stop('Распознавание прервалось. Проверьте текст и скачайте запись звука.');});
      source=ctx.createMediaStreamSource(stream);processor=ctx.createScriptProcessor(4096,1,1);mute=ctx.createGain();mute.gain.value=0;
      processor.onaudioprocess=event=>{if(running)try{pendingChunks++;recognizer.acceptWaveform(event.inputBuffer);}catch{pendingChunks--;stop('Распознавание прервалось. Полученный текст сохранён.');}};
      source.connect(processor);processor.connect(mute);mute.connect(ctx.destination);
      const chunks=[];
      if(window.MediaRecorder)try{
        const recording=new MediaRecorder(stream);recorder=recording;recording.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
        recording.onstop=()=>{if(audioURL)URL.revokeObjectURL(audioURL);const blob=new Blob(chunks,{type:recording.mimeType});audioURL=URL.createObjectURL(blob);const box=panel.querySelector('.vn-audio');box.hidden=false;box.querySelector('audio').src=audioURL;const a=box.querySelector('a');a.href=audioURL;a.download='rybalka-voice-note-'+new Date().toISOString().slice(0,10)+(blob.type.includes('mp4')?'.mp4':'.webm');};recording.start(1000);
      }catch{recorder=null;}
      running=true;setButtons();say('Слушаю… Говорите короткими фразами.');
      maxTimer=setTimeout(()=>stop('Пятиминутная заметка завершена. Проверьте текст.'),5*60e3);
      for(const track of stream.getAudioTracks())track.onended=()=>{if(running)stop('Микрофон отключён. Текст заметки сохранён.');};
    }catch(error){cleanup();say(error.name==='NotAllowedError'?'Доступ к микрофону закрыт. Разрешите его в настройках браузера.':error.message||'Не удалось начать диктовку.');setButtons();}
  }
  function cleanup(){clearTimeout(maxTimer);processor&&(processor.onaudioprocess=null);source?.disconnect();processor?.disconnect();mute?.disconnect();stream?.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});stream=null;ctx=null;source=null;processor=null;mute=null;running=false;}
  async function stop(message='Заметка готова. Проверьте текст и выжимку.'){
    if(preparing){cancelled=true;++session;cancelPrepare?.();cleanup();say('Подготовка остановлена.');return;}
    if(!running||stopping)return;
    stopping=true;running=false;if(recorder?.state==='recording')recorder.stop();cleanup();setButtons();
    if(pendingChunks>0)await new Promise(resolve=>{drainHandler=resolve;setTimeout(resolve,10000);});
    drainHandler=null;finalizing=true;
    let complete=false;
    await new Promise(resolve=>{let done=false;const end=()=>{if(done)return;done=true;complete=true;resolve();};fragmentHandler=end;recognizer?.retrieveFinalResult();setTimeout(resolve,10000);});
    if(!complete&&partial)words.push('Незавершённая фраза (проверьте): '+partial);
    recognizer?.remove();recognizer=null;fragmentHandler=null;stopping=false;partial='';panel.querySelector('.vn-partial').textContent='';textChanged();setButtons();say(complete?message:'Диктовка прервалась. Проверьте текст; запись звука можно скачать.');
  }
  b('start').addEventListener('click',start);b('stop').addEventListener('click',()=>stop());
  b('prepare').addEventListener('click',()=>prepare().catch(error=>say(error.message)));
  area.addEventListener('input',()=>{try{update();}catch(error){say(error.message);}});
  b('clear').addEventListener('click',()=>{area.value='';update();say('Черновик очищен. Сохранённые рыбалки остаются в дневнике.');});
  b('apply').addEventListener('click',()=>{const draft=VoiceNotesCore.extract(area.value);window.dispatchEvent(new CustomEvent('rybalka-voice-draft',{detail:draft}));});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop('Запись остановлена при закрытии экрана. Проверьте текст.');});
  window.addEventListener('pagehide',()=>{++session;cleanup();model?.terminate();if(audioURL)URL.revokeObjectURL(audioURL);});
  try{const draft=JSON.parse(localStorage.getItem(KEY)||'null');if(typeof draft?.text==='string'&&draft.text.length<=5000)area.value=draft.text;}catch{}
  update();
})();
