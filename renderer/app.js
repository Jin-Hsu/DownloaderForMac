const $ = s => document.querySelector(s);
let items = [], filter = 'all', selected = new Set(), pageUrl = '';

function esc(value='') { const d=document.createElement('div'); d.textContent=value; return d.innerHTML; }
function shortName(item) { try { return decodeURIComponent(new URL(item.url).pathname.split('/').pop()) || item.title || item.type; } catch { return item.title || item.type; } }
function status(text, error=false) { const el=$('#message'); el.textContent=text; el.style.color=error?'#ff7c70':''; }
function visible() { return items.filter(x => filter === 'all' || x.type === filter); }
function updateSelected() { $('#selected-count').textContent=selected.size; }

function render() {
  const list = visible();
  $('#grid').innerHTML = list.map(item => {
    const i=items.indexOf(item), name=shortName(item), isImage=['image','gif'].includes(item.type);
    const preview=isImage?`<img loading="lazy" src="${esc(item.url)}" alt="">`:item.type==='video'?`<video preload="metadata" muted src="${esc(item.url)}"></video>`:`<div class="media-icon">♫</div>`;
    return `<article class="card ${selected.has(i)?'selected':''}" data-i="${i}"><div class="preview">${preview}</div><span class="badge">${item.type}</span><span class="check">${selected.has(i)?'✓':''}</span><div class="meta"><div class="name" title="${esc(name)}">${esc(name)}</div><div class="detail">${item.width&&item.height?`${item.width} × ${item.height} · `:''}${esc(item.ext||'未知格式')}</div></div></article>`;
  }).join('');
  document.querySelectorAll('.card').forEach(card => card.onclick=()=>{const i=+card.dataset.i;selected.has(i)?selected.delete(i):selected.add(i);render();updateSelected()});
}

async function scan() {
  const url=$('#url').value.trim(); if(!url)return status('请输入一个网页地址',true);
  $('#scan').disabled=true; $('#scan').textContent='扫描中…'; status('正在打开网页并识别素材，通常需要几秒…');
  try {
    const data=await window.mediaHarbor.scan(url); items=data.items; pageUrl=data.url; selected.clear();
    ['all','image','gif','video','audio'].forEach(t=>$(`#count-${t}`).textContent=t==='all'?items.length:items.filter(x=>x.type===t).length);
    $('#toolbar').classList.remove('hidden'); $('#empty').classList.toggle('hidden',items.length>0); render(); updateSelected();
    status(`已从「${data.title||data.url}」发现 ${items.length} 个素材${data.warning?`；${data.warning}`:''}`);
  } catch(e) { status(`扫描失败：${e.message}`,true); }
  finally { $('#scan').disabled=false; $('#scan').textContent='扫描素材'; }
}

$('#scan').onclick=scan; $('#url').addEventListener('keydown',e=>{if(e.key==='Enter')scan()});
document.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{document.querySelector('.filter.active').classList.remove('active');btn.classList.add('active');filter=btn.dataset.type;render()});
$('#select-visible').onclick=()=>{visible().forEach(x=>selected.add(items.indexOf(x)));render();updateSelected()};
$('#clear').onclick=()=>{selected.clear();render();updateSelected()};
$('#download').onclick=async()=>{
  if(!selected.size)return status('请先勾选要下载的素材',true);
  const button=$('#download');button.disabled=true;status(`准备下载 ${selected.size} 个素材…`);
  try { const result=await window.mediaHarbor.download([...selected].map(i=>({...items[i],pageUrl})));if(!result.canceled){const ok=result.results.filter(x=>x.ok).length,failed=result.results.filter(x=>!x.ok);const reason=failed.length?`；原因：${failed[0].error}`:'';status(`下载完成：成功 ${ok} 个，失败 ${failed.length} 个${reason}。保存于 ${result.dir}`,failed.length>0)}}
  catch(e){status(`下载失败：${e.message}`,true)}finally{button.disabled=false}
};
window.mediaHarbor.onProgress(p=>status(`正在下载 ${p.index}/${p.total}：${shortName({url:p.name,type:'素材'})}`));
