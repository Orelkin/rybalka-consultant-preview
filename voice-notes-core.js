/* Extract a draft using only words actually present. No causal catch claims. */
(() => {
  'use strict';
  const species=[['щук','Щука'],['судак','Судак'],['окун','Окунь'],['карас','Карась'],['лещ','Лещ'],['плотв','Плотва'],['карп','Карп'],['жерех','Жерех'],['сом','Сом'],['голавл','Голавль'],['яз','Язь'],['форел','Форель'],['налим','Налим']];
  const cues={
    method:/(?:джиг|воблер|блесн|виб\b|спиннинг|фидер|поплав|живец|живца|отводн|дроп.?шот|поводок|плетен|приманк|силикон|кормуш|черв|опарыш|кукуруз|удилищ|катушк|тест\s|грамм)/iu,
    result:/(?:поймал|поймали|пойман|поймать удалось|улов|вытащил|рыб[уыа]\s|килограмм|\bкг\b|сход|покл[её]в|кл[её]в|не клев|без рыбы|без улова|отпустил)/iu,
    conclusion:/(?:заметил|вывод|сработал|лучше работ|хуже работ|следующий раз|в следующий|надо попроб|нужно попроб|не сработ|перестал|начал брать)/iu,
    conditions:/(?:ветер|ветр|давлен|температур|вода|уровень|течени|мутн|прозрач|глубин|метр|бровк|камыш|трава|травы|коряг|дожд|облач|солнц|пасмур|рассвет|закат|утром|вечером|берег|с лодк)/iu};
  function extract(value){
    const text=String(value||'').normalize('NFC').replace(/\r\n?/g,'\n').trim();
    if(!text)return {text:'',fish:'',location:'',method:'',result:'',conclusion:'',conditions:'',other:''};
    if(text.length>5000)throw new Error('Заметка длиннее 5000 символов. Разделите её на две записи.');
    // Dictation often has no punctuation; spoken field labels also delimit sections.
    const parts=text.split(/(?:[.!?;\n]+|(?=\s(?:место|улов|снасти|условия|вывод|заметил)(?:\s*:|\s)))/u).map(s=>s.trim()).filter(Boolean);
    const buckets={location:[],method:[],result:[],conclusion:[],conditions:[],other:[]};
    for(const part of parts){
      const label=part.match(/^(место|улов|снасти|условия|вывод|заметил)(?:\s*:\s*|\s+)(.*)$/iu);
      if(label){const key={'место':'location','улов':'result','снасти':'method','условия':'conditions','вывод':'conclusion','заметил':'conclusion'}[label[1].toLowerCase()];buckets[key].push(label[2]);continue;}
      let found=false;
      if(/(?:ловил|ловили|рыбачил|рыбачили|нахожусь|приехал|место|озер[ео]|оз[её]р|водохранилищ|на реке|у деревни)/iu.test(part)){buckets.location.push(part);found=true;}
      for(const key of ['method','result','conclusion','conditions'])if(cues[key].test(part)){buckets[key].push(part);found=true;}
      if(!found)buckets.other.push(part);
    }
    const fish=species.filter(([stem])=>new RegExp('(?:^|[^а-яё])'+stem+'[а-яё]*(?=$|[^а-яё])','iu').test(text)).map(([,name])=>name).join(', ');
    return {text,fish,...Object.fromEntries(Object.entries(buckets).map(([key,values])=>[key,[...new Set(values)].join('. ')]))};
  }
  window.VoiceNotesCore=Object.freeze({extract});
})();
