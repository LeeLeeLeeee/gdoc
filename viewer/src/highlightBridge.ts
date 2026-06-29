// iframe 안에서 실행되는 하이라이트 브리지. 부모와 postMessage로 통신.
// 점진적 향상: 비활성(로그인 안 함)이면 아무 것도 하지 않는다.
export const HIGHLIGHT_BRIDGE_SCRIPT = `
<style data-gdoc-highlight-style>
mark.gdoc-hl { background: rgba(59,130,246,.16); color: inherit; border-radius: 3px; padding: 0 1px; box-decoration-break: clone; -webkit-box-decoration-break: clone; cursor: pointer; }
mark.gdoc-hl.action { background: rgba(224,161,6,.20); }
mark.gdoc-hl.flash { outline: 2px solid rgba(110,173,255,.95); outline-offset: 1px; border-radius: 3px; }
:root[data-theme="dark"] mark.gdoc-hl { background: rgba(125,205,255,.22); }
:root[data-theme="dark"] mark.gdoc-hl.action { background: rgba(255,196,67,.24); }
</style>
<script data-gdoc-highlight-bridge>
(function(){
  var enabled = false;
  var marks = {}; // id -> [<mark> nodes]

  // ---- <script>/<style> 내부 텍스트 노드를 제외한 body 텍스트 노드 목록 ----
  // fullText, selectionOffsets, offsetToRange 세 함수가 동일 도메인을 공유한다.
  function filteredTextNodes(){
    var nodes = [];
    var walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node){
          var p = node.parentNode;
          while (p && p !== document.body){
            var tag = p.nodeName.toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
            p = p.parentNode;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function fullText(){
    if (!document.body) return '';
    return filteredTextNodes().map(function(n){ return n.nodeValue; }).join('');
  }

  // ---- 평문 오프셋 ↔ DOM Range 매핑 (script/style 제외 텍스트 노드 기준) ----
  function offsetToRange(start, end){
    var nodes = filteredTextNodes();
    var pos = 0, range = document.createRange(), set = { s:false, e:false };
    for (var i = 0; i < nodes.length; i++){
      var node = nodes[i];
      var len = node.nodeValue.length;
      if (!set.s && start <= pos + len){ range.setStart(node, Math.max(0, start - pos)); set.s = true; }
      if (!set.e && end <= pos + len){ range.setEnd(node, Math.max(0, end - pos)); set.e = true; break; }
      pos += len;
    }
    return (set.s && set.e) ? range : null;
  }

  function selectionOffsets(){
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    // start 오프셋: 필터링된 텍스트 노드를 순서대로 합산해 선택 시작점까지의 길이를 구한다.
    // (selectNodeContents+toString 방식은 script/style 텍스트를 포함해 도메인이 어긋난다.)
    var nodes = filteredTextNodes();
    var start = 0;
    for (var i = 0; i < nodes.length; i++){
      var node = nodes[i];
      if (node === range.startContainer){
        start += range.startOffset;
        break;
      }
      start += node.nodeValue.length;
    }
    return { start: start, end: start + range.toString().length, text: range.toString(), rect: range.getBoundingClientRect() };
  }

  function send(type, payload){ parent.postMessage(Object.assign({ type: type }, payload), '*'); }

  document.addEventListener('mouseup', function(){
    if (!enabled) return;
    var s = selectionOffsets();
    if (!s || !s.text.trim()) return;
    send('hl:selected', {
      anchor: { start: s.start, end: s.end },
      rect: { x: s.rect.left, y: s.rect.top, w: s.rect.width, h: s.rect.height }
    });
  });

  // Wrap each text-node segment within the range in its own inline <mark>, so only
  // glyph backgrounds are highlighted (no block-spanning bands) and whitespace-only
  // boundary nodes between blocks are skipped (no full-width slivers).
  function onMarkClick(id){
    return function(ev){
      ev.stopPropagation();
      var r = ev.currentTarget.getBoundingClientRect();
      send('hl:clicked', { id: id, rect: { x:r.left, y:r.top, w:r.width, h:r.height } });
    };
  }
  function wrap(range, id, cls){
    var nodes = filteredTextNodes().filter(function(n){ return range.intersectsNode(n); });
    nodes.forEach(function(node){
      var s = (node === range.startContainer) ? range.startOffset : 0;
      var e = (node === range.endContainer) ? range.endOffset : node.nodeValue.length;
      if (e <= s) return;
      if (!node.nodeValue.slice(s, e).trim()) return; // skip whitespace-only segment
      var seg = document.createRange();
      seg.setStart(node, s); seg.setEnd(node, e);
      var mark = document.createElement('mark');
      mark.setAttribute('data-hl-id', id);
      mark.className = 'gdoc-hl ' + (cls || '');
      seg.surroundContents(mark); // single text node → always safe, stays inline
      mark.addEventListener('click', onMarkClick(id));
      (marks[id] = marks[id] || []).push(mark);
    });
  }

  function clear(id){
    (marks[id] || []).forEach(function(m){
      var parentNode = m.parentNode;
      while (m.firstChild) parentNode.insertBefore(m.firstChild, m);
      parentNode.removeChild(m);
      parentNode.normalize();
    });
    delete marks[id];
  }

  window.addEventListener('message', function(ev){
    var d = ev.data || {};
    if (d.type === 'hl:set-enabled'){ enabled = !!d.on; if (!enabled){ Object.keys(marks).forEach(clear); } return; }
    if (d.type === 'hl:render'){
      Object.keys(marks).forEach(clear);
      (d.located || []).forEach(function(h){
        var range = offsetToRange(h.start, h.end);
        if (range){ wrap(range, h.id, h.cls); send('hl:anchored', { id: h.id, ok: true }); }
        else { send('hl:anchored', { id: h.id, ok: false }); }
      });
      return;
    }
    if (d.type === 'hl:scroll-to'){
      var nodes = marks[d.id];
      if (nodes && nodes[0]){ nodes[0].scrollIntoView({ behavior:'smooth', block:'center' });
        nodes.forEach(function(n){ n.classList.add('flash'); setTimeout(function(){ n.classList.remove('flash'); }, 1200); }); }
      return;
    }
    if (d.type === 'hl:remove'){ clear(d.id); return; }
    if (d.type === 'hl:fulltext-request'){ send('hl:fulltext', { text: fullText() }); return; }
  });

  send('hl:ready', {});
})();
</script>`;
