// Tiny signal/effect reactive core
let _current = null

function signal(val) {
  const subs = new Set()
  return {
    get() { if (_current) subs.add(_current); return val },
    set(v) { val = v; subs.forEach(fn => fn()) },
  }
}

function effect(fn) {
  const run = () => { _current = run; try { fn() } finally { _current = null } }
  run()
}

// State
const tree = signal(null)
const selectedPath = signal(null)
const expanded = signal(new Set([''])) // root open by default
const status = signal(null)            // null | { ok: bool, text: string }

// Find a node by path in the tree
function findNode(node, target) {
  if (node.path === target) return node
  for (const child of node.children ?? []) {
    const found = findNode(child, target)
    if (found) return found
  }
  return null
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatContent(node) {
  if (!node.content) return '(empty)'
  if (node.name.endsWith('.json')) {
    try { return JSON.stringify(JSON.parse(node.content), null, 2) } catch {}
  }
  return node.content
}

// Build HTML for one tree node (recursive)
function renderNode(node, depth = 0) {
  const pad = `padding-left:${depth * 14 + 8}px`

  if (node.type === 'dir') {
    const open = expanded.get().has(node.path)
    const kids = open && node.children
      ? node.children.map(c => renderNode(c, depth + 1)).join('') : ''
    return `<div class="row dir" data-action="toggle" data-path="${esc(node.path)}" style="${pad}">
        <span class="chevron">${open ? '▾' : '▸'}</span><span class="name">${esc(node.name)}</span>
      </div>${kids}`
  }

  const sel = selectedPath.get() === node.path ? ' selected' : ''
  return `<div class="row file${sel}" data-action="select" data-path="${esc(node.path)}" style="${pad}">
      <span class="chevron">·</span><span class="name">${esc(node.name)}</span>
    </div>`
}

// DOM refs
const sidebar  = document.getElementById('sidebar')
const content  = document.getElementById('content')
const statusEl = document.getElementById('status')

// Re-render sidebar when tree, selection, or expanded state changes
effect(() => {
  const t = tree.get()
  selectedPath.get() // subscribe
  expanded.get()     // subscribe
  sidebar.innerHTML = t ? renderNode(t) : '<div class="dim">Loading…</div>'
})

// Re-render content when selection or tree changes
effect(() => {
  const t = tree.get()
  const p = selectedPath.get()
  if (!t || !p) { content.innerHTML = '<div class="dim">Select a file to inspect</div>'; return }
  const node = findNode(t, p)
  if (!node) { content.innerHTML = '<div class="dim">File not found</div>'; return }
  content.innerHTML = `<div id="file-path">${esc(node.path)}</div><pre id="file-body">${esc(formatContent(node))}</pre>`
})

// Update status chip
effect(() => {
  const s = status.get()
  statusEl.textContent = s?.text ?? ''
  statusEl.className   = s?.ok ? 'live' : (s ? 'error' : '')
})

// Sidebar click delegation: toggle dirs, select files
sidebar.addEventListener('click', e => {
  const row = e.target.closest('[data-action]')
  if (!row) return
  const { action, path } = row.dataset
  if (action === 'toggle') {
    const exp = expanded.get()
    exp.has(path) ? exp.delete(path) : exp.add(path)
    expanded.set(exp)
  } else if (action === 'select') {
    selectedPath.set(path)
  }
})

// Poll /tree every 3 s
async function fetchTree() {
  try {
    const res = await fetch('/tree')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    tree.set(await res.json())
    status.set({ ok: true, text: '● Live' })
  } catch (e) {
    status.set({ ok: false, text: `⚠ ${e.message}` })
  }
}

fetchTree()
setInterval(fetchTree, 3000)
