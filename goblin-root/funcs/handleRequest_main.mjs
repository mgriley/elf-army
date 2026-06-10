export async function handle(input) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Notes App</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: linear-gradient(135deg, #1a4a2e, #2d7a4f, #1a4a2e);
      min-height: 100vh;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }

    h1 {
      color: #e0ffe8;
      font-size: 2.5rem;
      margin-bottom: 8px;
      text-shadow: 0 2px 8px rgba(0,0,0,0.3);
      letter-spacing: 2px;
    }

    .subtitle {
      color: #a8d5b5;
      margin-bottom: 32px;
      font-size: 0.95rem;
    }

    .input-area {
      background: rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 24px;
      width: 100%;
      max-width: 620px;
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 24px rgba(0,0,0,0.2);
      margin-bottom: 32px;
    }

    textarea {
      width: 100%;
      height: 120px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 10px;
      color: #e0ffe8;
      font-size: 1rem;
      padding: 12px;
      resize: vertical;
      outline: none;
      transition: border 0.2s;
    }

    textarea::placeholder {
      color: #7ab890;
    }

    textarea:focus {
      border: 1px solid #4caf7d;
    }

    .btn-row {
      display: flex;
      gap: 10px;
      margin-top: 12px;
    }

    input[type="text"] {
      flex: 1;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 10px;
      color: #e0ffe8;
      font-size: 0.95rem;
      padding: 10px 14px;
      outline: none;
      transition: border 0.2s;
    }

    input[type="text"]::placeholder {
      color: #7ab890;
    }

    input[type="text"]:focus {
      border: 1px solid #4caf7d;
    }

    button {
      background: #2d7a4f;
      color: #e0ffe8;
      border: none;
      border-radius: 10px;
      padding: 10px 22px;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    button:hover {
      background: #3a9e66;
      transform: translateY(-1px);
    }

    button:active {
      transform: translateY(0);
    }

    .notes-list {
      width: 100%;
      max-width: 620px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .note-card {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 14px;
      padding: 18px 20px;
      backdrop-filter: blur(4px);
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      position: relative;
      transition: transform 0.15s;
    }

    .note-card:hover {
      transform: translateY(-2px);
    }

    .note-title {
      font-weight: 600;
      font-size: 1rem;
      color: #b2ffcc;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }

    .note-body {
      color: #d4f5df;
      font-size: 0.93rem;
      white-space: pre-wrap;
      line-height: 1.5;
    }

    .note-date {
      font-size: 0.75rem;
      color: #7ab890;
      margin-top: 10px;
    }

    .delete-btn {
      position: absolute;
      top: 14px;
      right: 14px;
      background: rgba(255,80,80,0.15);
      color: #ff9999;
      border: none;
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: background 0.2s;
      box-shadow: none;
    }

    .delete-btn:hover {
      background: rgba(255,80,80,0.35);
      transform: none;
    }

    .empty {
      color: #7ab890;
      font-style: italic;
      text-align: center;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <h1>📝 Notes</h1>
  <p class="subtitle">Simple. Green. Yours.</p>

  <div class="input-area">
    <textarea id="noteBody" placeholder="Write your note here..."></textarea>
    <div class="btn-row">
      <input type="text" id="noteTitle" placeholder="Title (optional)" />
      <button onclick="addNote()">Add Note</button>
    </div>
  </div>

  <div class="notes-list" id="notesList"></div>

  <script>
    const STORAGE_KEY = 'elf_notes';

    function loadNotes() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      } catch {
        return [];
      }
    }

    function saveNotes(notes) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }

    function render() {
      const notes = loadNotes();
      const list = document.getElementById('notesList');
      if (notes.length === 0) {
        list.innerHTML = '<p class="empty">No notes yet. Add one above!</p>';
        return;
      }
      list.innerHTML = notes.map((n, i) => \`
        <div class="note-card">
          <button class="delete-btn" onclick="deleteNote(\${i})">✕ Delete</button>
          \${n.title ? \`<div class="note-title">\${escHtml(n.title)}</div>\` : ''}
          <div class="note-body">\${escHtml(n.body)}</div>
          <div class="note-date">\${n.date}</div>
        </div>
      \`).join('');
    }

    function escHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function addNote() {
      const body = document.getElementById('noteBody').value.trim();
      const title = document.getElementById('noteTitle').value.trim();
      if (!body) return;
      const notes = loadNotes();
      notes.unshift({ title, body, date: new Date().toLocaleString() });
      saveNotes(notes);
      document.getElementById('noteBody').value = '';
      document.getElementById('noteTitle').value = '';
      render();
    }

    function deleteNote(index) {
      const notes = loadNotes();
      notes.splice(index, 1);
      saveNotes(notes);
      render();
    }

    render();
  </script>
</body>
</html>`;

  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: html,
  };
}
