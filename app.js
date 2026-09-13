// ============================================================
// app.js - WhatsChat - Logica Principal
// ES6+ Modules | Vanilla JS | Supabase Realtime
// ============================================================

import { supabase, getCurrentUser, uploadFile, getSignedUrl } from './supabaseClient.js';

// ESTADO GLOBAL
const state = {
  user: null,
  profile: null,
  themeMode: 'dark',
  themeColor: 'green',
  chatBg: 'default',
  customWallpaper: null,
  conversations: [],
  activeConversation: null,
  messages: [],
  participants: {},
  realtimeChannel: null,
  presenceChannel: null,
  convChannel: null,
  recorder: null,
  recorderChunks: [],
  recorderTimer: null,
  recorderSeconds: 0,
  pendingMedia: null,
  pendingGroupAvatar: null,
  pendingProfileAvatar: null,
  pendingGroupEditAvatar: null,
  selectedParticipants: [],
  cameraStream: null,
  cameraFacing: 'user',
  capturedPhotoBlob: null,
  unreadCounts: {},
  searchTimeout: null,
  editingMessageId: null,
  selectedMessageId: null,
  adminUsers: [],
};

const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗',
  '🤔','🤗','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷',
  '🤒','🤕','🤑','🤠','😈','👿','👹','👺','💀','👻','👽','🤖','💩','😺','😸','😹',
  '❤️','🧡','💛','💚','💙','💜','🖤','💔','💕','💞','💓','💗','💖','💘','💝','💟',
  '👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤙','👌','👋','🙌','👏','🙏','🤝','💪',
  '🔥','⭐','✨','💫','🎉','🎊','🎈','🎁','🎂','🍕','🍔','🍟','🌮','🍜','🍣','🍰',
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el)  { if (typeof el === 'string') el = $(el); el?.removeAttribute('hidden'); }
function hide(el)  { if (typeof el === 'string') el = $(el); el?.setAttribute('hidden', ''); }

// PERSISTENCE HELPERS (LOCALSTORAGE CACHE)
function setLocalCache(key, data) {
  try {
    localStorage.setItem(`whatschat_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
}

function getLocalCache(key) {
  try {
    const item = localStorage.getItem(`whatschat_${key}`);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    return null;
  }
}

function removeLocalCache(key) {
  try {
    localStorage.removeItem(`whatschat_${key}`);
  } catch (e) { /* ignore */ }
}

function createEl(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') el.className = v;
    else if (k === 'innerHTML') el.innerHTML = v;
    else if (k === 'textContent') el.textContent = v;
    else el.setAttribute(k, v);
  });
  children.forEach(c => typeof c === 'string' ? el.append(document.createTextNode(c)) : el.append(c));
  return el;
}

function showToast(message, type = 'default', duration = 3500) {
  const toast = createEl('div', { className: `toast ${type}`, textContent: message });
  const container = $('#toast-container');
  container.append(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getDefaultAvatar(name = '?') {
  const initial = name.trim()[0]?.toUpperCase() || '?';
  const colors = ['#1e6091','#1a5276','#148f77','#7d6608','#784212','#4a235a'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>
      <circle cx='20' cy='20' r='20' fill='${color}'/>
      <text x='20' y='26' text-anchor='middle' fill='white' font-family='Arial,sans-serif' font-size='18' font-weight='700'>${initial}</text>
    </svg>`
  )}`;
}

function avatarSrc(profile) {
  return profile?.avatar_url || getDefaultAvatar(profile?.full_name || profile?.email || '?');
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSep(isoStr) {
  const d = new Date(isoStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function needsDateSep(messages, index) {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].created_at);
  const curr = new Date(messages[index].created_at);
  return prev.toDateString() !== curr.toDateString();
}

function ticksHTML(msg) {
  if (!state.user || msg.sender_id !== state.user.id) return '';
  const cls = msg.is_read ? 'read' : 'sent';
  const svg = msg.is_read
    ? `<svg viewBox="0 0 18 11" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M17.394.004l-8.5 8.5-2.5-2.5-1.415 1.414 3.914 3.914 9.916-9.914L17.394.004zm-4.508 0l-4.5 4.5-.707-.707L6.264.382 4.85 1.796l5.536 5.536 5.914-5.914L12.886.004z"/></svg>`
    : `<svg viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M11.071 0L5 6.071 1.929 3 0 4.929l5 5 8.071-8.071L11.071 0z"/></svg>`;
  return `<span class="msg-ticks tick ${cls}">${svg}</span>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function formatAudioTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}


// Comprime uma imagem File/Blob para Blob JPEG
function compressImageFile(file, maxSize = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        else if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem')),
          'image/jpeg', quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// AUTH
async function handleLogin(email, password, btnEl) {
  setButtonLoading(btnEl, true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setButtonLoading(btnEl, false);
  if (error) showAuthError('login-error', error.message);
}

async function handleRegister(name, email, password, btnEl) {
  setButtonLoading(btnEl, true);
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  setButtonLoading(btnEl, false);
  if (error) return showAuthError('register-error', error.message);
  const el = $('#register-success');
  el.textContent = 'Conta criada! Verifique seu e-mail para confirmar o cadastro.';
  show(el);
}

function showAuthError(id, msg) {
  const el = $(`#${id}`);
  el.textContent = msg;
  show(el);
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (text) { loading ? text.setAttribute('hidden','') : text.removeAttribute('hidden'); }
  if (loader) { loading ? loader.removeAttribute('hidden') : loader.setAttribute('hidden',''); }
}

function clearAppState() {
  teardownRealtime();
  state.user = null;
  state.profile = null;
  state.conversations = [];
  state.activeConversation = null;
  state.messages = [];
  state.participants = {};
  state.unreadCounts = {};
  state.adminUsers = [];

  const list = $('#conversation-list');
  if (list) list.innerHTML = '';
  const msgList = $('#messages-list');
  if (msgList) msgList.innerHTML = '';

  hide('#chat-window');
  hide('#btn-admin');
  show('#chat-welcome');
  closeModal('modal-new-group');
  closeModal('modal-profile');
  closeModal('modal-camera');
  closeModal('modal-edit-group');
  closeModal('modal-admin');
}

// INIT
async function init() {
  initTheme();
  initWallpaper();
  buildEmojiPicker();
  attachAuthListeners();
  attachModalListeners();
  attachInputListeners();
  attachCameraListeners();
  attachVirtualKeyboardFix();

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      clearAppState();
      showAuthScreen();
      return;
    }

    if (session?.user) {
      if (state.user && state.user.id !== session.user.id) {
        clearAppState();
      }
      state.user = session.user;
      await loadProfile();

      // Bloquear usuários não aprovados (exceto admins)
      if (state.profile?.is_approved === false && state.profile?.role !== 'admin') {
        showAuthError('login-error', 'Sua conta foi criada e está aguardando a aprovação de um administrador.');
        showToast('Sua conta está aguardando aprovação do administrador', 'error', 6000);
        showAuthScreen();
        return;
      }

      showApp();
      await loadConversations();
      setupPresence();
    }
  });

  const user = await getCurrentUser();
  if (!user) {
    clearAppState();
    showAuthScreen();
  }
}

function showAuthScreen() {
  hide('#app');
  show('#auth-screen');
  clearAppState();
}

function showApp() {
  hide('#auth-screen');
  show('#app');
  updateSidebarAvatar();
}

// PROFILE
async function loadProfile() {
  const cachedProfile = getLocalCache(`profile_${state.user.id}`);
  if (cachedProfile) {
    state.profile = cachedProfile;
    updateSidebarAvatar();
  }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', state.user.id).single();
  if (!error && data) {
    state.profile = data;
    setLocalCache(`profile_${state.user.id}`, data);
  } else {
    state.profile = {
      id: state.user.id,
      email: state.user.email,
      full_name: state.user.user_metadata?.full_name || state.user.email?.split('@')[0] || '',
      avatar_url: null,
      status_msg: 'Disponível',
      is_online: true,
      last_seen: new Date().toISOString(),
    };
    await supabase.from('profiles').upsert(state.profile);
    setLocalCache(`profile_${state.user.id}`, state.profile);
  }
  updateSidebarAvatar();
}

function updateSidebarAvatar() {
  const img = $('#sidebar-avatar');
  if (img) img.src = avatarSrc(state.profile);
  const btnAdmin = $('#btn-admin');
  if (btnAdmin) {
    if (state.profile?.role === 'admin') show(btnAdmin);
    else hide(btnAdmin);
  }
}

// CONVERSATIONS
async function loadConversations() {
  if (!state.user) return;
  // Load cached conversations for instantaneous UI render
  const cached = getLocalCache(`conversations_${state.user.id}`);
  if (cached && Array.isArray(cached) && cached.length) {
    state.conversations = cached;
    renderConversationList();

    const lastActiveId = getLocalCache(`active_conv_${state.user.id}`);
    if (lastActiveId && !state.activeConversation) {
      const active = state.conversations.find(c => c.id === lastActiveId);
      if (active) openConversation(active);
    }
  } else {
    renderConvListLoading();
  }

  const { data: parts, error: partErr } = await supabase
    .from('participants').select('conversation_id').eq('user_id', state.user.id);
  if (partErr || !parts?.length) {
    state.conversations = [];
    removeLocalCache(`conversations_${state.user.id}`);
    renderConvListEmpty();
    return;
  }

  const convIds = parts.map(p => p.conversation_id);
  const { data: convs, error: convErr } = await supabase
    .from('conversations').select('*').in('id', convIds).order('created_at', { ascending: false });
  if (convErr || !convs?.length) {
    state.conversations = [];
    removeLocalCache(`conversations_${state.user.id}`);
    renderConvListEmpty();
    return;
  }

  for (const conv of convs) { await enrichConversation(conv); }
  state.conversations = convs;
  setLocalCache(`conversations_${state.user.id}`, convs);
  renderConversationList();
  subscribeToConversationUpdates();

  const lastActiveId = getLocalCache(`active_conv_${state.user.id}`);
  if (lastActiveId) {
    const active = state.conversations.find(c => c.id === lastActiveId);
    if (active && (!state.activeConversation || state.activeConversation.id !== active.id)) {
      openConversation(active);
    }
  }
}

async function enrichConversation(conv) {
  const { data: parts } = await supabase.from('participants')
    .select('user_id, profiles(id, full_name, avatar_url, email, is_online)')
    .eq('conversation_id', conv.id);
  conv.participants = parts?.map(p => p.profiles).filter(Boolean) || [];
  state.participants[conv.id] = conv.participants;

  const { data: msgs } = await supabase.from('messages').select('content, media_type, created_at')
    .eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1);
  conv.lastMessage = msgs?.[0] || null;

  if (!conv.is_group) {
    const other = conv.participants.find(p => p.id !== state.user.id);
    conv.displayName = other?.full_name || other?.email || 'Conversa';
    conv.displayAvatar = other?.avatar_url || getDefaultAvatar(conv.displayName);
    conv.otherUser = other;
  } else {
    conv.displayName = conv.name || 'Grupo';
    conv.displayAvatar = conv.avatar_url || getDefaultAvatar(conv.displayName);
  }
}

function renderConvListLoading() {
  $('#conversation-list').innerHTML = Array(4).fill(`
    <div class="conv-loading">
      <div class="conv-loading-avatar"></div>
      <div class="conv-loading-text">
        <div class="conv-loading-line"></div>
        <div class="conv-loading-line"></div>
      </div>
    </div>`).join('');
}

function renderConvListEmpty() {
  $('#conversation-list').innerHTML = `
    <div class="conv-list-empty">
      <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>
      <p>Nenhuma conversa ainda.<br/>Pesquise um usuario para comecar.</p>
    </div>`;
}

function renderConversationList() {
  const list = $('#conversation-list');
  if (!state.conversations.length) { renderConvListEmpty(); return; }
  list.innerHTML = '';
  state.conversations.forEach(conv => list.append(buildConvItem(conv)));
}

function buildConvItem(conv) {
  const isActive = state.activeConversation?.id === conv.id;
  const unread = state.unreadCounts[conv.id] || 0;
  const lastMsg = conv.lastMessage;
  let previewText = 'Clique para abrir';
  if (lastMsg) {
    if (lastMsg.media_type === 'image') previewText = 'Foto';
    else if (lastMsg.media_type === 'audio') previewText = 'Áudio';
    else previewText = lastMsg.content || '';
  }
  const onlineOther = !conv.is_group && conv.otherUser?.is_online;
  const item = createEl('div', { className: `conv-item${isActive ? ' active' : ''}`, 'data-id': conv.id });
  item.innerHTML = `
    <div class="conv-item-avatar">
      <img src="${conv.displayAvatar}" alt="${escapeHtml(conv.displayName)}" class="avatar"
        onerror="this.src='${getDefaultAvatar(conv.displayName)}'" />
      ${onlineOther ? '<span class="presence-dot presence-online"></span>' : ''}
    </div>
    <div class="conv-item-body">
      <div class="conv-item-row1">
        <span class="conv-item-name">${escapeHtml(conv.displayName)}</span>
        <span class="conv-item-time">${lastMsg ? formatTime(lastMsg.created_at) : ''}</span>
      </div>
      <div class="conv-item-row2">
        <span class="conv-item-preview">${escapeHtml(previewText)}</span>
        ${unread > 0 ? `<span class="conv-item-badge">${unread}</span>` : ''}
      </div>
    </div>`;
  
  item.addEventListener('click', () => openConversation(conv));
  return item;
}

function isMobileView() {
  return window.innerWidth <= 960 || ('ontouchstart' in window && window.innerWidth <= 1024);
}

// OPEN CONVERSATION
async function openConversation(conv) {
  if (window._deselectMessage) window._deselectMessage();
  state.activeConversation = conv;
  state.unreadCounts[conv.id] = 0;
  if (state.user) setLocalCache(`active_conv_${state.user.id}`, conv.id);

  if (isMobileView()) {
    $('#sidebar').classList.add('slide-out');
    $('#chat-area').classList.add('slide-in');
    if (!history.state?.chatOpen) {
      history.pushState({ chatOpen: true, convId: conv.id }, '');
    }
  }
  updateChatHeader(conv);
  hide('#chat-welcome');
  show('#chat-window');
  applyWallpaper(state.chatBg, state.customWallpaper);
  $$('.conv-item').forEach(el => el.classList.toggle('active', el.dataset.id === conv.id));

  // Restore draft for this conversation
  const draft = getLocalCache(`draft_${conv.id}`) || '';
  const input = $('#message-input');
  if (input) {
    input.value = draft;
    autoResizeTextarea(input);
    toggleSendButton();
  }

  await loadMessages(conv.id);
  subscribeToMessages(conv.id);
  markMessagesAsRead(conv.id);
}

function closeMobileChat(fromPopState = false) {
  $('#sidebar').classList.remove('slide-out');
  $('#chat-area').classList.remove('slide-in');
  state.activeConversation = null;
  if (state.user) removeLocalCache(`active_conv_${state.user.id}`);
  if (!fromPopState && history.state?.chatOpen) {
    history.back();
  }
}

function updateChatHeader(conv) {
  $('#chat-avatar').src = conv.displayAvatar;
  $('#chat-name').textContent = conv.displayName;

  const editBtn = $('#btn-edit-group');
  if (editBtn) {
    if (conv.is_group) show(editBtn);
    else hide(editBtn);
  }

  if (conv.is_group) {
    const count = conv.participants?.length || 0;
    $('#chat-status').textContent = `${count} participante${count !== 1 ? 's' : ''}`;
    $('#chat-presence').className = 'presence-dot';
  } else {
    const online = conv.otherUser?.is_online;
    $('#chat-status').textContent = online ? 'online' : 'offline';
    $('#chat-presence').className = `presence-dot ${online ? 'presence-online' : 'presence-offline'}`;
  }
}

// MESSAGES
async function loadMessages(convId) {
  const list = $('#messages-list');
  // Load cached messages first for instantaneous display
  const cached = getLocalCache(`messages_${convId}`);
  if (cached && Array.isArray(cached) && cached.length) {
    state.messages = cached;
    renderMessages();
    scrollToBottom(true);
  } else {
    list.innerHTML = '<div class="date-sep"><span>Carregando...</span></div>';
  }

  const { data, error } = await supabase.from('messages')
    .select('*, sender:profiles(id, full_name, avatar_url, email)')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (!error && data) {
    state.messages = data;
    setLocalCache(`messages_${convId}`, data);
    renderMessages();
    scrollToBottom(true);
  } else if (!state.messages.length) {
    list.innerHTML = '<div class="date-sep"><span>Sem mensagens. Diga olá! 👋</span></div>';
  }
}

function renderMessages() {
  const list = $('#messages-list');
  list.innerHTML = '';
  const msgs = state.messages;
  if (!msgs.length) {
    list.innerHTML = '<div class="date-sep"><span>Sem mensagens. Diga ola! 👋</span></div>';
    return;
  }
  msgs.forEach((msg, i) => {
    if (needsDateSep(msgs, i)) {
      list.append(createEl('div', { className: 'date-sep', innerHTML: `<span>${formatDateSep(msg.created_at)}</span>` }));
    }
    list.append(buildMsgEl(msg));
  });
}

window._toggleMessageSelection = function(msg) {
  if (state.selectedMessageId === msg.id) {
    window._deselectMessage();
  } else {
    window._selectMessage(msg);
  }
};

window._selectMessage = function(msg) {
  window._deselectMessage();
  state.selectedMessageId = msg.id;

  const msgEl = $(`.msg[data-id="${msg.id}"]`);
  if (msgEl) msgEl.classList.add('selected');

  const isOwner = msg.sender_id === state.user?.id;
  const isAdmin = state.profile?.role === 'admin';
  const canEdit = isOwner && msg.media_type === 'text';
  const canDelete = isOwner || isAdmin;

  const btnEdit = $('#btn-hdr-edit-msg');
  const btnDelete = $('#btn-hdr-delete-msg');
  const btnCancel = $('#btn-hdr-cancel-sel');
  const btnEditGroup = $('#btn-edit-group');

  if (btnEditGroup) hide(btnEditGroup);

  if (canEdit && btnEdit) show(btnEdit); else if (btnEdit) hide(btnEdit);
  if (canDelete && btnDelete) show(btnDelete); else if (btnDelete) hide(btnDelete);
  if (btnCancel) show(btnCancel);
};

window._deselectMessage = function() {
  state.selectedMessageId = null;
  $$('.msg.selected').forEach(el => el.classList.remove('selected'));

  const btnEdit = $('#btn-hdr-edit-msg');
  const btnDelete = $('#btn-hdr-delete-msg');
  const btnCancel = $('#btn-hdr-cancel-sel');
  const btnEditGroup = $('#btn-edit-group');

  if (btnEdit) hide(btnEdit);
  if (btnDelete) hide(btnDelete);
  if (btnCancel) hide(btnCancel);

  if (state.activeConversation?.is_group && btnEditGroup) {
    show(btnEditGroup);
  }
};

function buildMsgEl(msg) {
  const isOut = msg.sender_id === state.user?.id;
  const isSelected = state.selectedMessageId === msg.id;
  const wrapper = createEl('div', { className: `msg ${isOut ? 'out' : 'in'}${isSelected ? ' selected' : ''}`, 'data-id': msg.id });
  let senderHtml = '';
  if (!isOut && state.activeConversation?.is_group) {
    const senderName = msg.sender?.full_name || msg.sender?.email || 'Usuario';
    senderHtml = `<div class="msg-sender">${escapeHtml(senderName)}</div>`;
  }
  let contentHtml = '';
  if (msg.media_type === 'image' && msg.media_url) {
    contentHtml = `<div class="msg-image"><img src="${msg.media_url}" alt="Imagem" loading="lazy"
      style="cursor:pointer" onclick="window._openLightbox('${msg.media_url}')" /></div>`;
    if (msg.content) contentHtml += `<div>${escapeHtml(msg.content)}</div>`;
  } else if (msg.media_type === 'audio' && msg.media_url) {
    contentHtml = buildAudioPlayer(msg.media_url, msg.id);
  } else {
    contentHtml = `<div>${escapeHtml(msg.content || '')}</div>`;
  }
  wrapper.innerHTML = `
    <div class="msg-bubble">
      ${senderHtml}
      ${contentHtml}
      <div class="msg-meta">
        <span class="msg-time">${formatTime(msg.created_at)}${msg.is_edited ? ' (editado)' : ''}</span>
        ${ticksHTML(msg)}
      </div>
    </div>`;

  wrapper.addEventListener('click', (e) => {
    if (e.target.closest('.audio-play-btn, .audio-progress, .msg-image img, a')) return;
    window._toggleMessageSelection(msg);
  });

  return wrapper;
}

function buildAudioPlayer(url, id) {
  return `
    <div class="msg-audio-player" data-audio-url="${url}" data-audio-id="${id}">
      <button class="audio-play-btn" onclick="window._toggleAudio(this)" aria-label="Reproduzir">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <div class="audio-progress-wrap">
        <input type="range" class="audio-progress" value="0" min="0" max="100" step="0.1"
          oninput="window._seekAudio(this)" />
        <span class="audio-duration">0:00</span>
      </div>
    </div>`;
}

window._audioMap = {};
window._toggleAudio = function(btn) {
  const player = btn.closest('.msg-audio-player');
  const url = player.dataset.audioUrl;
  const id  = player.dataset.audioId;
  const dur = player.querySelector('.audio-duration');
  const prog = player.querySelector('.audio-progress');
  if (!window._audioMap[id]) {
    const audio = new Audio(url);
    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      prog.value = (audio.currentTime / audio.duration) * 100;
      dur.textContent = formatAudioTime(audio.currentTime);
    });
    audio.addEventListener('ended', () => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      prog.value = 0;
    });
    window._audioMap[id] = audio;
  }
  const audio = window._audioMap[id];
  if (audio.paused) {
    Object.values(window._audioMap).forEach(a => { if (a !== audio && !a.paused) a.pause(); });
    audio.play();
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  } else {
    audio.pause();
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  }
};

window._openLightbox = function(url) {
  let overlay = $('#lightbox-overlay');
  if (overlay) overlay.remove();
  overlay = createEl('div', { id: 'lightbox-overlay', className: 'lightbox-overlay' });
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Fechar">&times;</button>
    <img class="lightbox-img" src="${url}" alt="Imagem ampliada" />
  `;
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.lightbox-close')) {
      overlay.remove();
    }
  });
  document.body.append(overlay);
};

window._seekAudio = function(input) {
  const player = input.closest('.msg-audio-player');
  const id = player.dataset.audioId;
  const audio = window._audioMap[id];
  if (audio?.duration) audio.currentTime = (input.value / 100) * audio.duration;
};

function scrollToBottom(instant = false) {
  const container = $('#messages-container');
  if (!container) return;
  if (instant) container.scrollTop = container.scrollHeight;
  else container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

// SEND OR EDIT MESSAGE
async function sendMessage() {
  const conv = state.activeConversation;
  if (!conv) return;
  const input = $('#message-input');
  const text = input.value.trim();
  const media = state.pendingMedia;
  if (!text && !media && !state.editingMessageId) return;

  if (state.editingMessageId) {
    if (!text) {
      showToast('A mensagem nao pode ser vazia', 'error');
      return;
    }
    const msgId = state.editingMessageId;
    window._cancelEdit();
    const { data, error } = await supabase.from('messages')
      .update({ content: text, is_edited: true })
      .eq('id', msgId)
      .select('*, sender:profiles(id, full_name, avatar_url, email)')
      .single();
    if (error) { showToast('Erro ao editar: ' + (error.message || ''), 'error'); return; }
    
    const idx = state.messages.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      state.messages[idx] = data;
      setLocalCache(`messages_${conv.id}`, state.messages);
      const oldEl = $(`.msg[data-id="${msgId}"]`);
      if (oldEl) oldEl.replaceWith(buildMsgEl(data));
    }
    showToast('Mensagem editada!', 'success');
    return;
  }

  const payload = {
    conversation_id: conv.id,
    sender_id: state.user.id,
    content: text || null,
    media_type: 'text',
    media_url: null,
  };

  if (media) {
    try {
      const ext = media.type === 'audio' ? 'webm' : 'jpg';
      const path = `${state.user.id}/${conv.id}/${Date.now()}.${ext}`;
      const storedPath = await uploadFile('chat-media', path, media.blob, media.blob.type);
      payload.media_url = await getSignedUrl(storedPath);
      payload.media_type = media.type;
    } catch (err) {
      showToast('Erro ao enviar midia: ' + err.message, 'error');
      return;
    }
  }

  input.value = '';
  input.style.height = 'auto';
  clearPendingMedia();
  toggleSendButton();

  const { data, error } = await supabase.from('messages')
    .insert([payload])
    .select('*, sender:profiles(id, full_name, avatar_url, email)')
    .single();
  if (error) { showToast('Erro ao enviar mensagem: ' + (error.message || ''), 'error'); return; }

  state.messages.push(data);
  setLocalCache(`messages_${conv.id}`, state.messages);
  removeLocalCache(`draft_${conv.id}`);

  const list = $('#messages-list');
  const i = state.messages.length - 1;
  if (needsDateSep(state.messages, i)) {
    list.append(createEl('div', { className: 'date-sep', innerHTML: `<span>${formatDateSep(data.created_at)}</span>` }));
  }
  list.append(buildMsgEl(data));
  scrollToBottom();

  const convInList = state.conversations.find(c => c.id === conv.id);
  if (convInList) {
    convInList.lastMessage = { content: payload.content, media_type: payload.media_type, created_at: data.created_at };
    setLocalCache(`conversations_${state.user.id}`, state.conversations);
    renderConversationList();
  }
}

// EDIT CANCEL & DELETE
window._editMsg = function(msgId) {
  const msg = state.messages.find(m => m.id === msgId);
  if (!msg || msg.media_type !== 'text') return;
  state.editingMessageId = msgId;
  const input = $('#message-input');
  input.value = msg.content;
  autoResizeTextarea(input);
  input.focus();
  toggleSendButton();
  
  let cancelBtn = $('#btn-cancel-edit');
  if (!cancelBtn) {
    cancelBtn = createEl('button', { id: 'btn-cancel-edit', className: 'input-icon-btn', title: 'Cancelar', innerHTML: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>` });
    cancelBtn.addEventListener('click', window._cancelEdit);
    $('#message-input').parentElement.parentElement.prepend(cancelBtn);
  }
  show(cancelBtn);
};

window._cancelEdit = function() {
  state.editingMessageId = null;
  const input = $('#message-input');
  input.value = '';
  autoResizeTextarea(input);
  toggleSendButton();
  const cancelBtn = $('#btn-cancel-edit');
  if (cancelBtn) hide(cancelBtn);
};

window._deleteMsg = async function(msgId) {
  if (!confirm('Deseja excluir esta mensagem?')) return;
  const conv = state.activeConversation;
  const { error } = await supabase.from('messages').delete().eq('id', msgId);
  if (error) { showToast('Erro ao excluir: ' + error.message, 'error'); return; }
  
  state.messages = state.messages.filter(m => m.id !== msgId);
  if (conv) setLocalCache(`messages_${conv.id}`, state.messages);
  
  const msgEl = $(`.msg[data-id="${msgId}"]`);
  if (msgEl) {
    const prev = msgEl.previousElementSibling;
    const next = msgEl.nextElementSibling;
    msgEl.remove();
    // Remover o date-sep se ficar sozinho
    if (prev?.classList.contains('date-sep') && (!next || next.classList.contains('date-sep'))) {
      prev.remove();
    }
  }
  
  // Update last message preview if needed
  if (conv && state.messages.length) {
    const convInList = state.conversations.find(c => c.id === conv.id);
    if (convInList) {
      const last = state.messages[state.messages.length - 1];
      convInList.lastMessage = { content: last.content, media_type: last.media_type, created_at: last.created_at };
      setLocalCache(`conversations_${state.user.id}`, state.conversations);
      renderConversationList();
    }
  }
};

function clearPendingMedia() {
  state.pendingMedia = null;
  hide('#media-preview');
  const prevImg = $('#media-preview-img');
  const prevAudio = $('#media-preview-audio');
  if (prevImg) { prevImg.setAttribute('hidden',''); prevImg.src = ''; }
  if (prevAudio) { prevAudio.setAttribute('hidden',''); prevAudio.src = ''; }
}

function toggleSendButton() {
  const input = $('#message-input');
  const hasTxt = input.value.trim().length > 0;
  const hasMedia = !!state.pendingMedia;
  const showSend = hasTxt || hasMedia;
  const btnSend = $('#btn-send');
  const btnAudio = $('#btn-audio');
  if (showSend) { show(btnSend); hide(btnAudio); }
  else { hide(btnSend); show(btnAudio); }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// SEARCH USERS
async function searchUsers(query) {
  let q = supabase.from('profiles').select('id, full_name, avatar_url, email').neq('id', state.user.id);
  if (query) {
    q = q.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
  }
  const { data, error } = await q.limit(10);
  const container = $('#search-results');
  container.innerHTML = '';
  if (error) {
    console.error('Erro ao buscar usuários:', error);
    return;
  }
  if (!data?.length) {
    container.innerHTML = `<div class="search-result-item"><div class="search-result-info"><p style="color:var(--text-secondary);font-size:.85rem;padding:8px 0">${query ? 'Nenhum usuário encontrado' : 'Nenhum outro usuário cadastrado'}</p></div></div>`;
    show(container);
    return;
  }
  data.forEach(user => {
    const item = createEl('div', { className: 'search-result-item' });
    item.innerHTML = `
      <img src="${avatarSrc(user)}" alt="" class="avatar" />
      <div class="search-result-info">
        <div class="search-result-name">${escapeHtml(user.full_name || user.email || 'Usuário')}</div>
        <div class="search-result-email">${escapeHtml(user.email || '')}</div>
      </div>`;
    item.addEventListener('click', () => {
      hide('#search-results');
      $('#search-input').value = '';
      startDirectChat(user);
    });
    container.append(item);
  });
  show(container);
}

async function startDirectChat(otherUser) {
  if (!otherUser?.id) return;
  const existing = state.conversations.find(c =>
    !c.is_group &&
    c.participants?.some(p => p.id === otherUser.id) &&
    c.participants?.some(p => p.id === state.user.id)
  );
  if (existing) { openConversation(existing); return; }

  const { data: conv, error } = await supabase.from('conversations')
    .insert([{ is_group: false, created_by: state.user.id }]).select().single();
  if (error) {
    console.error('Erro ao criar conversa:', error);
    showToast('Erro ao criar conversa: ' + (error.message || ''), 'error');
    return;
  }

  const { error: partErr } = await supabase.from('participants').insert([
    { conversation_id: conv.id, user_id: state.user.id },
    { conversation_id: conv.id, user_id: otherUser.id },
  ]);
  if (partErr) {
    console.error('Erro ao vincular participantes:', partErr);
    showToast('Erro ao iniciar conversa: ' + (partErr.message || ''), 'error');
    return;
  }

  await enrichConversation(conv);
  state.conversations.unshift(conv);
  setLocalCache(`conversations_${state.user.id}`, state.conversations);
  renderConversationList();
  openConversation(conv);
}

// GROUPS
async function createGroup() {
  const name = $('#group-name-input').value.trim();
  if (!name) { showToast('Informe o nome do grupo', 'error'); return; }
  if (!state.selectedParticipants.length) { showToast('Adicione ao menos 1 participante', 'error'); return; }
  const btn = $('#btn-create-group');
  setButtonLoading(btn, true);

  let avatarUrl = null;
  if (state.pendingGroupAvatar) {
    try {
      const path = `groups/${Date.now()}.jpg`;
      const stored = await uploadFile('chat-media', path, state.pendingGroupAvatar, 'image/jpeg');
      avatarUrl = await getSignedUrl(stored);
    } catch (e) {
      console.warn('Erro ao fazer upload do avatar do grupo:', e);
    }
  }

  const { data: conv, error } = await supabase.from('conversations')
    .insert([{ is_group: true, name, avatar_url: avatarUrl, created_by: state.user.id }]).select().single();
  if (error) {
    console.error('Erro ao criar conversa do grupo:', error);
    setButtonLoading(btn, false);
    showToast('Erro ao criar grupo: ' + (error.message || ''), 'error');
    return;
  }

  const parts = [
    { conversation_id: conv.id, user_id: state.user.id },
    ...state.selectedParticipants.map(p => ({ conversation_id: conv.id, user_id: p.id }))
  ];
  const { error: partErr } = await supabase.from('participants').insert(parts);
  if (partErr) {
    console.error('Erro ao adicionar participantes:', partErr);
    setButtonLoading(btn, false);
    showToast('Erro ao adicionar participantes: ' + (partErr.message || ''), 'error');
    return;
  }

  await enrichConversation(conv);
  state.conversations.unshift(conv);
  setLocalCache(`conversations_${state.user.id}`, state.conversations);
  renderConversationList();
  openConversation(conv);
  setButtonLoading(btn, false);
  closeModal('modal-new-group');
  resetGroupModal();
  showToast(`Grupo "${name}" criado!`, 'success');
}

// DELETE CONVERSATION
async function deleteConversation(conv) {
  if (!conv || !state.user) return;
  const isCreator = conv.created_by === state.user.id || !conv.is_group;
  const confirmMsg = isCreator
    ? `Deseja excluir permanentemente a conversa "${conv.displayName}"? Todas as mensagens serão apagadas.`
    : `Deseja sair e remover o grupo "${conv.displayName}" da sua lista?`;

  if (!confirm(confirmMsg)) return;

  try {
    if (isCreator) {
      const { error } = await supabase.from('conversations').delete().eq('id', conv.id);
      if (error) {
        const { error: partErr } = await supabase.from('participants')
          .delete()
          .eq('conversation_id', conv.id)
          .eq('user_id', state.user.id);
        if (partErr) throw partErr;
      }
    } else {
      const { error } = await supabase.from('participants')
        .delete()
        .eq('conversation_id', conv.id)
        .eq('user_id', state.user.id);
      if (error) throw error;
    }

    state.conversations = state.conversations.filter(c => c.id !== conv.id);
    delete state.unreadCounts[conv.id];
    removeLocalCache(`messages_${conv.id}`);
    removeLocalCache(`draft_${conv.id}`);
    setLocalCache(`conversations_${state.user.id}`, state.conversations);

    if (state.activeConversation?.id === conv.id) {
      state.activeConversation = null;
      hide('#chat-window');
      show('#chat-welcome');
      if (window.innerWidth < 768) closeMobileChat(true);
    }

    renderConversationList();
    showToast('Conversa excluída com sucesso!', 'success');
  } catch (err) {
    console.error('Erro ao excluir conversa:', err);
    showToast('Erro ao excluir conversa: ' + (err.message || ''), 'error');
  }
}

// EDIT GROUP
function openEditGroupModal() {
  const conv = state.activeConversation;
  if (!conv || !conv.is_group) return;

  $('#edit-group-name-input').value = conv.name || conv.displayName || '';
  $('#edit-group-avatar-preview').src = conv.displayAvatar;
  state.pendingGroupEditAvatar = null;
  const fileInput = $('#edit-group-avatar-input');
  if (fileInput) fileInput.value = '';
  openModal('modal-edit-group');
}

async function saveGroupEdit() {
  const conv = state.activeConversation;
  if (!conv || !conv.is_group) return;

  const name = $('#edit-group-name-input').value.trim();
  if (!name) { showToast('Informe o nome do grupo', 'error'); return; }

  const btn = $('#btn-save-group-edit');
  setButtonLoading(btn, true);

  let avatarUrl = conv.avatar_url;
  if (state.pendingGroupEditAvatar) {
    try {
      const path = `groups/${conv.id}/${Date.now()}.jpg`;
      const stored = await uploadFile('chat-media', path, state.pendingGroupEditAvatar, 'image/jpeg');
      avatarUrl = await getSignedUrl(stored);
    } catch (e) {
      console.warn('Erro ao fazer upload do avatar do grupo:', e);
    }
  }

  const { error } = await supabase.from('conversations')
    .update({ name, avatar_url: avatarUrl })
    .eq('id', conv.id);

  setButtonLoading(btn, false);
  if (error) {
    showToast('Erro ao salvar alterações do grupo: ' + error.message, 'error');
    return;
  }

  conv.name = name;
  conv.displayName = name;
  if (avatarUrl) {
    conv.avatar_url = avatarUrl;
    conv.displayAvatar = avatarUrl;
  }

  const convInList = state.conversations.find(c => c.id === conv.id);
  if (convInList) {
    convInList.name = name;
    convInList.displayName = name;
    if (avatarUrl) {
      convInList.avatar_url = avatarUrl;
      convInList.displayAvatar = avatarUrl;
    }
  }

  setLocalCache(`conversations_${state.user.id}`, state.conversations);
  updateChatHeader(conv);
  renderConversationList();
  closeModal('modal-edit-group');
  showToast('Grupo atualizado com sucesso!', 'success');
}

// ─── ADMIN PANEL FUNCTIONS ─────────────────────────────────────
async function openAdminModal() {
  if (state.profile?.role !== 'admin') {
    showToast('Acesso negado. Apenas administradores podem acessar este painel.', 'error');
    return;
  }
  openModal('modal-admin');
  await loadAdminUsers();
  await loadAdminSettings();
  await loadAdminPermissions();
}

async function loadAdminUsers() {
  const container = $('#admin-users-list');
  if (!container) return;
  container.innerHTML = '<div class="date-sep"><span>Carregando usuários...</span></div>';

  const { data, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
  if (error) {
    console.error('Erro ao carregar usuários admin:', error);
    showToast('Erro ao carregar usuários: ' + error.message, 'error');
    container.innerHTML = '<div class="date-sep"><span>Erro ao carregar usuários.</span></div>';
    return;
  }
  state.adminUsers = data || [];
  renderAdminUsers($('#admin-users-search')?.value.trim() || '');
}

state.adminUserFilter = 'all';
state.editingUser = null;

function renderAdminUsers(query = '') {
  const container = $('#admin-users-list');
  if (!container) return;
  container.innerHTML = '';

  let users = state.adminUsers || [];

  // Atualizar badge de pendentes
  const pendingCount = users.filter(u => u.is_approved === false && u.role !== 'admin').length;
  const badgeEl = $('#admin-pending-badge');
  if (badgeEl) badgeEl.textContent = pendingCount;

  // Filtrar por aba de status
  if (state.adminUserFilter === 'pending') {
    users = users.filter(u => u.is_approved === false && u.role !== 'admin');
  } else if (state.adminUserFilter === 'approved') {
    users = users.filter(u => u.is_approved !== false || u.role === 'admin');
  }

  // Filtrar por busca de texto
  if (query) {
    const q = query.toLowerCase();
    users = users.filter(u =>
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  }

  if (!users.length) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Nenhum usuário encontrado neste filtro.</div>`;
    return;
  }

  users.forEach(u => {
    const isSelf = u.id === state.user?.id;
    const role = u.role || 'user';
    const isApproved = u.is_approved !== false || role === 'admin';

    const item = createEl('div', { className: 'admin-user-item' });
    item.innerHTML = `
      <div class="admin-user-info">
        <img src="${avatarSrc(u)}" alt="" class="avatar" />
        <div class="admin-user-details">
          <div class="admin-user-name">${escapeHtml(u.full_name || u.email)} ${isSelf ? ' (Você)' : ''}</div>
          <div class="admin-user-email">${escapeHtml(u.email)}</div>
        </div>
      </div>
      <div class="admin-user-actions">
        <span class="role-badge ${role}">${role}</span>
        <span class="status-badge ${isApproved ? 'approved' : 'pending'}">${isApproved ? 'Aprovado' : 'Pendente'}</span>
        ${!isApproved ? `<button class="btn-user-approve" data-user-id="${u.id}" title="Aprovar Usuário"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Aceitar</button>` : ''}
        <button class="btn-user-edit" data-user-id="${u.id}" title="Editar Usuário"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
        ${!isSelf ? `<button class="btn-user-delete" data-user-id="${u.id}" title="Excluir Usuário"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>` : ''}
      </div>
    `;

    const approveBtn = item.querySelector('.btn-user-approve');
    if (approveBtn) approveBtn.addEventListener('click', () => approveUser(u));

    const editBtn = item.querySelector('.btn-user-edit');
    if (editBtn) editBtn.addEventListener('click', () => openAdminEditUserModal(u));

    const delBtn = item.querySelector('.btn-user-delete');
    if (delBtn) delBtn.addEventListener('click', () => deleteAdminUser(u));

    container.append(item);
  });
}

async function approveUser(u) {
  const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', u.id);
  if (error) {
    showToast('Erro ao aprovar usuário: ' + error.message, 'error');
    return;
  }
  u.is_approved = true;
  renderAdminUsers($('#admin-users-search')?.value.trim() || '');
  showToast(`Usuário "${u.full_name || u.email}" aprovado com sucesso!`, 'success');
}

function openAdminEditUserModal(u) {
  state.editingUser = u;
  $('#admin-edit-user-avatar').src = avatarSrc(u);
  $('#admin-edit-user-email').value = u.email || '';
  $('#admin-edit-user-name').value = u.full_name || '';
  $('#admin-edit-user-status').value = u.status_msg || 'Disponível';
  $('#admin-edit-user-role').value = u.role || 'user';
  $('#admin-edit-user-approved').value = (u.is_approved !== false || u.role === 'admin') ? 'true' : 'false';
  const pwdInput = $('#admin-edit-user-password');
  if (pwdInput) {
    pwdInput.value = '';
    pwdInput.type = 'password';
  }
  openModal('modal-admin-edit-user');
}

async function saveAdminEditUser() {
  const u = state.editingUser;
  if (!u) return;

  const name = $('#admin-edit-user-name').value.trim();
  const statusMsg = $('#admin-edit-user-status').value.trim();
  const role = $('#admin-edit-user-role').value;
  const isApproved = $('#admin-edit-user-approved').value === 'true';
  const newPassword = $('#admin-edit-user-password')?.value.trim();

  if (!name) { showToast('Informe o nome de exibição', 'error'); return; }

  if (newPassword && newPassword.length < 6) {
    showToast('A nova senha deve ter no mínimo 6 caracteres', 'error');
    return;
  }

  const btn = $('#btn-save-admin-edit-user');
  setButtonLoading(btn, true);

  const { error } = await supabase.from('profiles')
    .update({ full_name: name, status_msg: statusMsg, role, is_approved: isApproved })
    .eq('id', u.id);

  if (error) {
    setButtonLoading(btn, false);
    showToast('Erro ao salvar usuário: ' + error.message, 'error');
    return;
  }

  if (newPassword) {
    let pwdError = null;
    if (u.id === state.user?.id) {
      const { error: e } = await supabase.auth.updateUser({ password: newPassword });
      pwdError = e;
    } else {
      const { error: e } = await supabase.rpc('admin_update_user_password', {
        target_user_id: u.id,
        new_password: newPassword
      });
      pwdError = e;
    }

    if (pwdError) {
      console.error('Erro ao alterar senha:', pwdError);
      showToast('Perfil salvo, mas falhou ao alterar senha: ' + pwdError.message, 'warning');
    } else {
      showToast('Senha do usuário alterada com sucesso!', 'success');
    }
  }

  setButtonLoading(btn, false);
  u.full_name = name;
  u.status_msg = statusMsg;
  u.role = role;
  u.is_approved = isApproved;

  if (u.id === state.user?.id) {
    state.profile = { ...state.profile, full_name: name, status_msg: statusMsg, role, is_approved: isApproved };
    updateSidebarAvatar();
  }

  renderAdminUsers($('#admin-users-search')?.value.trim() || '');
  closeModal('modal-admin-edit-user');
  showToast('Usuário atualizado com sucesso!', 'success');
}

window._openAdminAddUserModal = function() {
  if ($('#admin-add-user-name')) $('#admin-add-user-name').value = '';
  if ($('#admin-add-user-email')) $('#admin-add-user-email').value = '';
  if ($('#admin-add-user-password')) $('#admin-add-user-password').value = '';
  if ($('#admin-add-user-role')) $('#admin-add-user-role').value = 'user';
  if ($('#admin-add-user-approved')) $('#admin-add-user-approved').value = 'true';
  openModal('modal-admin-add-user');
};

function openAdminAddUserModal() {
  window._openAdminAddUserModal();
}

window._saveAdminAddUser = async function() {
  const name = $('#admin-add-user-name').value.trim();
  const email = $('#admin-add-user-email').value.trim().toLowerCase();
  const password = $('#admin-add-user-password').value;
  const role = $('#admin-add-user-role').value;
  const isApproved = $('#admin-add-user-approved').value === 'true';

  if (!name) { showToast('Informe o nome completo do usuário', 'error'); return; }
  if (!email || !email.includes('@')) { showToast('Informe um e-mail válido', 'error'); return; }
  if (!password || password.length < 6) { showToast('A senha deve ter no mínimo 6 caracteres', 'error'); return; }

  const btn = $('#btn-save-admin-add-user');
  setButtonLoading(btn, true);

  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }
      }
    });

    if (authError) {
      showToast('Erro ao cadastrar no Supabase: ' + (authError.message || ''), 'error');
      setButtonLoading(btn, false);
      return;
    }

    const userId = authData.user?.id;
    if (userId) {
      const { error: updateErr } = await supabase.from('profiles')
        .update({ full_name: name, role: role, is_approved: isApproved })
        .eq('id', userId);

      if (updateErr) {
        await supabase.from('profiles').upsert({
          id: userId,
          email,
          full_name: name,
          status_msg: 'Disponível',
          role,
          is_approved: isApproved
        });
      }
    }

    await loadAdminUsers();
    setButtonLoading(btn, false);
    closeModal('modal-admin-add-user');
    showToast(`Usuário "${name}" criado com sucesso no Supabase!`, 'success');
  } catch (err) {
    console.error('Erro em saveAdminAddUser:', err);
    setButtonLoading(btn, false);
    showToast('Erro ao criar usuário: ' + (err.message || ''), 'error');
  }
};

async function saveAdminAddUser() {
  return window._saveAdminAddUser();
}

async function toggleUserRole(u) {
  const newRole = u.role === 'admin' ? 'user' : 'admin';
  if (u.id === state.user?.id && newRole === 'user') {
    if (!confirm('Atenção: Ao remover seu próprio cargo de admin, você perderá acesso ao painel administrativo. Continuar?')) {
      return;
    }
  }

  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', u.id);
  if (error) {
    showToast('Erro ao atualizar cargo: ' + error.message, 'error');
    return;
  }

  u.role = newRole;
  if (u.id === state.user?.id) {
    state.profile.role = newRole;
    updateSidebarAvatar();
  }

  renderAdminUsers($('#admin-users-search')?.value.trim() || '');
  showToast(`Cargo de "${u.full_name || u.email}" alterado para ${newRole.toUpperCase()}`, 'success');
}

async function deleteAdminUser(u) {
  if (!confirm(`Deseja realmente excluir a conta do usuário "${u.full_name || u.email}"? Esta ação não pode ser desfeita.`)) return;

  const { error } = await supabase.from('profiles').delete().eq('id', u.id);
  if (error) {
    showToast('Erro ao excluir usuário: ' + error.message, 'error');
    return;
  }

  state.adminUsers = state.adminUsers.filter(user => user.id !== u.id);
  renderAdminUsers($('#admin-users-search')?.value.trim() || '');
  showToast('Usuário excluído com sucesso!', 'success');
}

// ADMIN SETTINGS
async function loadAdminSettings() {
  const { data, error } = await supabase.from('system_settings').select('*').eq('key', 'global_settings').single();
  if (!error && data?.value) {
    const s = data.value;
    if ($('#admin-setting-app-name')) $('#admin-setting-app-name').value = s.appName || 'WhatsChat Web';
    if ($('#admin-setting-upload-limit')) $('#admin-setting-upload-limit').value = s.uploadLimit || 10;
    if ($('#admin-setting-allow-reg')) $('#admin-setting-allow-reg').checked = s.allowRegistration !== false;
    if ($('#admin-setting-maintenance')) $('#admin-setting-maintenance').checked = !!s.maintenanceMode;
    if ($('#admin-setting-notice')) $('#admin-setting-notice').value = s.notice || '';
  }
}

async function saveAdminSettings(e) {
  e.preventDefault();
  if (state.profile?.role !== 'admin') return;

  const settings = {
    appName: $('#admin-setting-app-name').value.trim() || 'WhatsChat Web',
    uploadLimit: parseInt($('#admin-setting-upload-limit').value) || 10,
    allowRegistration: $('#admin-setting-allow-reg').checked,
    maintenanceMode: $('#admin-setting-maintenance').checked,
    notice: $('#admin-setting-notice').value.trim(),
  };

  const { error } = await supabase.from('system_settings').upsert({
    key: 'global_settings',
    value: settings,
    updated_at: new Date().toISOString()
  });

  if (error) {
    showToast('Erro ao salvar configurações: ' + error.message, 'error');
    return;
  }

  showToast('Configurações salvas com sucesso!', 'success');
}

// ADMIN PERMISSIONS
async function loadAdminPermissions() {
  const { data, error } = await supabase.from('system_settings').select('*').eq('key', 'permissions').single();
  if (!error && data?.value) {
    const p = data.value;
    if ($('#perm-create-groups')) $('#perm-create-groups').checked = p.canCreateGroups !== false;
    if ($('#perm-send-media')) $('#perm-send-media').checked = p.canSendMedia !== false;
    if ($('#perm-edit-msgs')) $('#perm-edit-msgs').checked = p.canEditMessages !== false;
    if ($('#perm-delete-msgs')) $('#perm-delete-msgs').checked = p.canDeleteMessages !== false;
  }
}

async function saveAdminPermissions(e) {
  e.preventDefault();
  if (state.profile?.role !== 'admin') return;

  const perms = {
    canCreateGroups: $('#perm-create-groups').checked,
    canSendMedia: $('#perm-send-media').checked,
    canEditMessages: $('#perm-edit-msgs').checked,
    canDeleteMessages: $('#perm-delete-msgs').checked,
  };

  const { error } = await supabase.from('system_settings').upsert({
    key: 'permissions',
    value: perms,
    updated_at: new Date().toISOString()
  });

  if (error) {
    showToast('Erro ao salvar permissões: ' + error.message, 'error');
    return;
  }

  showToast('Permissões salvas com sucesso!', 'success');
}


function resetGroupModal() {
  $('#group-name-input').value = '';
  const searchInput = $('#participants-search');
  if (searchInput) searchInput.value = '';
  state.selectedParticipants = [];
  state.pendingGroupAvatar = null;
  $('#participants-results').innerHTML = '';
  $('#selected-participants').innerHTML = '';
  const prev = $('#group-avatar-preview');
  if (prev) {
    prev.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='100' fill='%232a3942'/%3E%3Cpath d='M65 80a20 20 0 1 1 40 0 20 20 0 0 1-40 0zm55 0a15 15 0 1 1 30 0 15 15 0 0 1-30 0zM30 150c0-20 16-30 35-30a36 36 0 0 1 20 6c-4 5-6 11-6 17v7H30v-7-.007zm65-7c0-22 18-33 40-33s40 11 40 33v7h-80v-7z' fill='%238696a0'/%3E%3C/svg%3E";
  }
  const fileInput = $('#group-avatar-input');
  if (fileInput) fileInput.value = '';
}

async function searchParticipants(query) {
  const container = $('#participants-results');
  let q = supabase.from('profiles').select('id, full_name, avatar_url, email').neq('id', state.user.id);
  if (query) {
    q = q.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
  }
  const { data, error } = await q.limit(10);
  container.innerHTML = '';
  if (error) {
    console.error('Erro ao buscar participantes:', error);
    return;
  }
  const filtered = (data || []).filter(u => !state.selectedParticipants.some(p => p.id === u.id));
  if (!filtered.length) {
    container.innerHTML = `<div style="padding: 8px 12px; font-size: 0.85rem; color: var(--text-muted);">${query ? 'Nenhum usuário encontrado' : 'Nenhum outro usuário disponível'}</div>`;
    return;
  }
  filtered.forEach(u => {
    const item = createEl('div', { className: 'participant-opt' });
    item.innerHTML = `<img src="${avatarSrc(u)}" alt="" class="avatar" /><span>${escapeHtml(u.full_name || u.email)}</span>`;
    item.addEventListener('click', () => addParticipant(u));
    container.append(item);
  });
}

function addParticipant(user) {
  if (state.selectedParticipants.find(p => p.id === user.id)) return;
  state.selectedParticipants.push(user);
  renderSelectedParticipants();
  $('#participants-search').value = '';
  searchParticipants('');
}

function removeParticipant(id) {
  state.selectedParticipants = state.selectedParticipants.filter(p => p.id !== id);
  renderSelectedParticipants();
  searchParticipants($('#participants-search').value.trim());
}

function renderSelectedParticipants() {
  const container = $('#selected-participants');
  container.innerHTML = '';
  state.selectedParticipants.forEach(u => {
    const chip = createEl('div', { className: 'selected-chip' });
    chip.innerHTML = `
      <img src="${avatarSrc(u)}" alt="" />
      <span>${escapeHtml(u.full_name || u.email)}</span>
      <button class="chip-remove" aria-label="Remover">x</button>`;
    chip.querySelector('.chip-remove').addEventListener('click', () => removeParticipant(u.id));
    container.append(chip);
  });
}

// AUDIO RECORDING
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {};
    state.recorder = new MediaRecorder(stream, options);
    state.recorderChunks = [];
    state.recorderSeconds = 0;
    state.recorder.ondataavailable = e => { if (e.data?.size) state.recorderChunks.push(e.data); };
    state.recorder.onstop = finalizeAudioRecording;
    state.recorder.start(100);
    hide('#btn-audio');
    hide('#btn-send');
    show('#audio-recording-bar');
    updateRecTimer();
    state.recorderTimer = setInterval(() => {
      state.recorderSeconds++;
      updateRecTimer();
      if (state.recorderSeconds >= 120) stopRecording();
    }, 1000);
  } catch (err) {
    showToast('Permissao de microfone negada', 'error');
  }
}

function updateRecTimer() {
  const m = Math.floor(state.recorderSeconds / 60);
  const s = (state.recorderSeconds % 60).toString().padStart(2, '0');
  const el = $('#rec-timer');
  if (el) el.textContent = `${m}:${s}`;
}

function stopRecording() {
  clearInterval(state.recorderTimer);
  if (state.recorder?.state !== 'inactive') state.recorder.stop();
  state.recorder?.stream?.getTracks().forEach(t => t.stop());
  hide('#audio-recording-bar');
  show('#btn-audio');
}

function cancelRecording() {
  stopRecording();
  state.recorderChunks = [];
}

function finalizeAudioRecording() {
  if (!state.recorderChunks.length) return;
  const mimeType = state.recorder?.mimeType || 'audio/webm';
  const blob = new Blob(state.recorderChunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  state.pendingMedia = { blob, type: 'audio', dataUrl: url };
  const prevAudio = $('#media-preview-audio');
  prevAudio.src = url;
  show('#media-preview');
  show(prevAudio);
  toggleSendButton();
}

// CAMERA
async function openCamera() {
  openModal('modal-camera');
  state.capturedPhotoBlob = null;
  hide('#camera-captured-preview');
  hide('#btn-use-photo');
  hide('#btn-retake');
  show('#camera-preview');
  show('#btn-capture');
  show('#btn-flip-camera');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.cameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    state.cameraStream = stream;
    $('#camera-preview').srcObject = stream;
  } catch (err) {
    showToast('Camera nao disponivel', 'error');
    closeModal('modal-camera');
  }
}

function stopCamera() {
  state.cameraStream?.getTracks().forEach(t => t.stop());
  state.cameraStream = null;
}

function capturePhoto() {
  const video = $('#camera-preview');
  const canvas = $('#camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    state.capturedPhotoBlob = blob;
    const url = URL.createObjectURL(blob);
    $('#captured-photo').src = url;
    hide('#camera-preview');
    hide('#btn-capture');
    hide('#btn-flip-camera');
    show('#camera-captured-preview');
    show('#btn-use-photo');
    show('#btn-retake');
    stopCamera();
  }, 'image/jpeg', 0.92);
}

function usePhoto() {
  if (!state.capturedPhotoBlob) return;
  const url = $('#captured-photo').src;
  state.pendingMedia = { blob: state.capturedPhotoBlob, type: 'image', dataUrl: url };
  const prevImg = $('#media-preview-img');
  prevImg.src = url;
  show('#media-preview');
  show(prevImg);
  toggleSendButton();
  closeModal('modal-camera');
}

function handleFileUpload(file) {
  if (!file || !file.type.startsWith('image/')) { showToast('Apenas imagens sao suportadas', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    state.pendingMedia = { blob: file, type: 'image', dataUrl: e.target.result };
    const prevImg = $('#media-preview-img');
    prevImg.src = e.target.result;
    show('#media-preview');
    show(prevImg);
    toggleSendButton();
  };
  reader.readAsDataURL(file);
}

// PRESENCE
function setupPresence() {
  if (state.presenceChannel) supabase.removeChannel(state.presenceChannel);
  state.presenceChannel = supabase.channel('presence-global');
  state.presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const ps = state.presenceChannel.presenceState();
      const onlineIds = new Set();
      Object.values(ps).forEach(arr => arr.forEach(p => onlineIds.add(p.user_id)));
      state.conversations.forEach(conv => {
        conv.participants?.forEach(p => { p.is_online = onlineIds.has(p.id); });
        if (!conv.is_group && conv.otherUser) conv.otherUser.is_online = onlineIds.has(conv.otherUser.id);
      });
      renderConversationList();
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      newPresences.forEach(p => updateUserOnlineStatus(p.user_id, true));
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach(p => updateUserOnlineStatus(p.user_id, false));
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await state.presenceChannel.track({ user_id: state.user.id, online_at: new Date().toISOString() });
        await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', state.user.id);
      }
    });

  window.addEventListener('beforeunload', () => {
    supabase.from('profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', state.user.id);
  });
}

function updateUserOnlineStatus(userId, online) {
  state.conversations.forEach(conv => {
    if (!conv.is_group && conv.otherUser?.id === userId) {
      conv.otherUser.is_online = online;
      if (state.activeConversation?.id === conv.id) {
        const statusEl = $('#chat-status');
        const presEl = $('#chat-presence');
        if (statusEl) statusEl.textContent = online ? 'online' : 'offline';
        if (presEl) presEl.className = `presence-dot ${online ? 'presence-online' : 'presence-offline'}`;
      }
    }
    conv.participants?.forEach(p => { if (p.id === userId) p.is_online = online; });
  });
  renderConversationList();
}

// REALTIME
function subscribeToMessages(convId) {
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  state.realtimeChannel = supabase.channel(`messages:${convId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'messages',
      filter: `conversation_id=eq.${convId}`,
    }, async (payload) => {
      const { eventType, new: newRec, old: oldRec } = payload;
      
      if (eventType === 'INSERT') {
        const msg = newRec;
        if (msg.sender_id === state.user?.id) return; // evitar duplicatas otimistas
        const { data } = await supabase.from('messages')
          .select('*, sender:profiles(id, full_name, avatar_url, email)')
          .eq('id', msg.id).single();
        if (!data) return;
        state.messages.push(data);
        setLocalCache(`messages_${convId}`, state.messages);
        const list = $('#messages-list');
        const i = state.messages.length - 1;
        if (needsDateSep(state.messages, i)) {
          list.append(createEl('div', { className: 'date-sep', innerHTML: `<span>${formatDateSep(data.created_at)}</span>` }));
        }
        list.append(buildMsgEl(data));
        scrollToBottom();
        markMessagesAsRead(convId);
        updateConvLastMessage(convId, data);
      } 
      else if (eventType === 'UPDATE') {
        const msg = newRec;
        // Nao ignorar updates proprios - editar mensagem deve atualizar o DOM tb
        const idx = state.messages.findIndex(m => m.id === msg.id);
        if (idx !== -1) {
          state.messages[idx].content = msg.content;
          state.messages[idx].is_edited = msg.is_edited;
          state.messages[idx].is_read = msg.is_read;
          setLocalCache(`messages_${convId}`, state.messages);
          const oldEl = $(`.msg[data-id="${msg.id}"]`);
          if (oldEl) oldEl.replaceWith(buildMsgEl(state.messages[idx]));
          if (idx === state.messages.length - 1) updateConvLastMessage(convId, msg);
        }
      } 
      else if (eventType === 'DELETE') {
        const msgId = oldRec.id;
        state.messages = state.messages.filter(m => m.id !== msgId);
        setLocalCache(`messages_${convId}`, state.messages);
        const msgEl = $(`.msg[data-id="${msgId}"]`);
        if (msgEl) {
          const prev = msgEl.previousElementSibling;
          const next = msgEl.nextElementSibling;
          msgEl.remove();
          if (prev?.classList.contains('date-sep') && (!next || next.classList.contains('date-sep'))) {
            prev.remove();
          }
        }
        if (state.messages.length) {
          updateConvLastMessage(convId, state.messages[state.messages.length - 1]);
        }
      }
    }).subscribe();
}

function updateConvLastMessage(convId, msg) {
  const convInList = state.conversations.find(c => c.id === convId);
  if (convInList) {
    convInList.lastMessage = { content: msg.content, media_type: msg.media_type, created_at: msg.created_at };
    setLocalCache(`conversations_${state.user?.id}`, state.conversations);
    renderConversationList();
  }
}

function subscribeToConversationUpdates() {
  if (state.convChannel) supabase.removeChannel(state.convChannel);
  state.convChannel = supabase.channel('new-conversations')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'participants',
      filter: `user_id=eq.${state.user.id}`,
    }, async () => { await loadConversations(); })
    .subscribe();
}

async function markMessagesAsRead(convId) {
  await supabase.from('messages').update({ is_read: true })
    .eq('conversation_id', convId).neq('sender_id', state.user.id).eq('is_read', false);
}

function teardownRealtime() {
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  if (state.presenceChannel) supabase.removeChannel(state.presenceChannel);
  if (state.convChannel) supabase.removeChannel(state.convChannel);
}

// THEME MANAGEMENT
function applyTheme(mode = 'dark', color = 'green') {
  if (mode) state.themeMode = mode;
  if (color) state.themeColor = color;

  document.documentElement.setAttribute('data-theme-mode', state.themeMode);
  document.documentElement.setAttribute('data-theme-color', state.themeColor);

  setLocalCache('theme_mode', state.themeMode);
  setLocalCache('theme_color', state.themeColor);

  $$('.theme-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.themeMode);
  });
  $$('.swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === state.themeColor);
  });
}

function initTheme() {
  const savedMode = getLocalCache('theme_mode') || 'dark';
  const savedColor = getLocalCache('theme_color') || 'green';
  applyTheme(savedMode, savedColor);

  $$('.theme-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.mode, state.themeColor);
    });
  });

  $$('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(state.themeMode, btn.dataset.color);
    });
  });
}

// WALLPAPER MANAGEMENT
function applyWallpaper(bgPreset = 'default', customImgUrl = null) {
  state.chatBg = bgPreset;
  state.customWallpaper = customImgUrl;

  document.documentElement.setAttribute('data-chat-bg', bgPreset);
  setLocalCache('chat_bg', bgPreset);

  const container = $('.messages-container');
  const previewBox = $('#wallpaper-image-preview');
  const previewImg = $('#wallpaper-img-src');
  const removeBtn = $('#btn-remove-wallpaper');

  if (customImgUrl) {
    setLocalCache('custom_wallpaper', customImgUrl);
    if (container) {
      container.style.backgroundImage = `url("${customImgUrl}")`;
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
      container.style.backgroundRepeat = 'no-repeat';
    }
    if (previewImg) previewImg.src = customImgUrl;
    if (previewBox) show(previewBox);
    if (removeBtn) show(removeBtn);
  } else {
    removeLocalCache('custom_wallpaper');
    if (container) {
      container.style.backgroundImage = '';
      container.style.backgroundSize = '';
      container.style.backgroundPosition = '';
      container.style.backgroundRepeat = '';
    }
    if (previewBox) hide(previewBox);
    if (removeBtn) hide(removeBtn);
  }

  $$('.bg-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === bgPreset);
  });
}

function initWallpaper() {
  const savedBg = getLocalCache('chat_bg') || 'default';
  const savedCustom = getLocalCache('custom_wallpaper') || null;
  applyWallpaper(savedBg, savedCustom);

  $$('.bg-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      applyWallpaper(btn.dataset.bg, state.customWallpaper);
    });
  });

  const uploadInput = $('#wallpaper-upload-input');
  if (uploadInput) {
    uploadInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        // Comprime a imagem de papel de parede para caber levemente no cache
        const compressedBlob = await compressImageFile(file, 1280, 0.82);
        const reader = new FileReader();
        reader.onload = ev => {
          applyWallpaper(state.chatBg, ev.target.result);
          showToast('Papel de parede aplicado com sucesso!', 'success');
        };
        reader.readAsDataURL(compressedBlob);
      } catch (err) {
        console.error('Erro ao processar imagem de fundo:', err);
        showToast('Erro ao carregar imagem de fundo', 'error');
      }
      e.target.value = '';
    });
  }

  const removeBtn = $('#btn-remove-wallpaper');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      applyWallpaper('default', null);
      showToast('Imagem de fundo removida', 'success');
    });
  }
}

// PROFILE MODAL
async function openProfileModal() {
  $('#profile-name').value = state.profile?.full_name || '';
  $('#profile-status').value = state.profile?.status_msg || '';
  $('#profile-email-display').textContent = state.profile?.email || '';
  $('#profile-avatar-preview').src = avatarSrc(state.profile);

  // Sync theme & wallpaper active controls
  applyTheme(state.themeMode, state.themeColor);
  applyWallpaper(state.chatBg, state.customWallpaper);

  openModal('modal-profile');
}

async function saveProfile() {
  const name = $('#profile-name').value.trim();
  const status = $('#profile-status').value.trim();
  if (!name) { showToast('Informe seu nome', 'error'); return; }
  const btn = $('#btn-save-profile');
  setButtonLoading(btn, true);
  let avatarUrl = state.profile?.avatar_url;
  if (state.pendingProfileAvatar) {
    try {
      const file = state.pendingProfileAvatar;
      // Comprimir a imagem via canvas antes do upload
      const compressed = await compressImageFile(file, 400, 0.85);
      const path = `avatars/${state.user.id}/${Date.now()}.jpg`;
      const stored = await uploadFile('chat-media', path, compressed, 'image/jpeg');
      avatarUrl = await getSignedUrl(stored);
    } catch (e) {
      console.error('Erro upload avatar:', e);
      showToast('Erro ao enviar foto: ' + (e.message || ''), 'error');
      setButtonLoading(btn, false);
      return;
    }
    state.pendingProfileAvatar = null;
  }
  // Usar UPDATE (nao upsert) - perfil sempre existe apos o trigger de cadastro
  const { error } = await supabase.from('profiles')
    .update({ full_name: name, status_msg: status, avatar_url: avatarUrl })
    .eq('id', state.user.id);
  if (error) {
    showToast('Erro ao salvar perfil: ' + (error.message || ''), 'error');
    setButtonLoading(btn, false);
    return;
  }
  state.profile = { ...state.profile, full_name: name, status_msg: status, avatar_url: avatarUrl };
  setLocalCache(`profile_${state.user.id}`, state.profile);
  updateSidebarAvatar();
  closeModal('modal-profile');
  showToast('Perfil atualizado!', 'success');
  setButtonLoading(btn, false);
}

// EMOJI
function buildEmojiPicker() {
  const grid = $('#emoji-grid');
  EMOJIS.forEach(emoji => {
    const btn = createEl('button', { textContent: emoji, title: emoji, type: 'button' });
    btn.addEventListener('click', () => insertEmoji(emoji));
    grid.append(btn);
  });
}

function insertEmoji(emoji) {
  const input = $('#message-input');
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const val = input.value;
  input.value = val.slice(0, start) + emoji + val.slice(end);
  input.setSelectionRange(start + emoji.length, start + emoji.length);
  input.focus();
  toggleSendButton();
  if (state.activeConversation) {
    setLocalCache(`draft_${state.activeConversation.id}`, input.value);
  }
  hide('#emoji-picker');
}

// MODALS
function openModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.setAttribute('hidden', '');
  document.body.style.overflow = '';
  if (id === 'modal-camera') stopCamera();
}

// EVENT LISTENERS
function attachAuthListeners() {
  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach(t => t.classList.remove('active'));
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      $(`#${tab.dataset.tab}-form`).classList.add('active');
      hide('#login-error');
      hide('#register-error');
      hide('#register-success');
    });
  });

  document.addEventListener('click', e => {
    const toggleBtn = e.target.closest('.toggle-pass');
    if (toggleBtn) {
      const wrap = toggleBtn.closest('.input-password-wrap');
      const input = wrap ? wrap.querySelector('input') : toggleBtn.previousElementSibling;
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    }
  });

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    hide('#login-error');
    await handleLogin($('#login-email').value.trim(), $('#login-password').value, e.target.querySelector('button[type=submit]'));
  });

  $('#register-form').addEventListener('submit', async e => {
    e.preventDefault();
    hide('#register-error');
    hide('#register-success');
    await handleRegister($('#reg-name').value.trim(), $('#reg-email').value.trim(), $('#reg-password').value, e.target.querySelector('button[type=submit]'));
  });
}

function attachModalListeners() {
  $$('.modal-close, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.modal || btn.closest('.modal-overlay')?.id;
      if (id) closeModal(id);
    });
  });

  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  $('#btn-logout').addEventListener('click', async () => {
    if (state.user) {
      removeLocalCache(`active_conv_${state.user.id}`);
      await supabase.from('profiles').update({ is_online: false }).eq('id', state.user.id);
    }
    clearAppState();
    await supabase.auth.signOut();
    showAuthScreen();
  });

  $('#btn-profile').addEventListener('click', openProfileModal);
  $('#btn-save-profile').addEventListener('click', saveProfile);

  $('#btn-admin').addEventListener('click', openAdminModal);

  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t => t.classList.remove('active'));
      $$('.admin-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = $(`#admin-${tab.dataset.adminTab}-tab`);
      if (target) target.classList.add('active');
      if (tab.dataset.adminTab === 'users') loadAdminUsers();
    });
  });

  $$('.admin-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      $$('.admin-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.adminUserFilter = pill.dataset.filter || 'all';
      renderAdminUsers($('#admin-users-search')?.value.trim() || '');
    });
  });

  const addAdminUserBtn = $('#btn-admin-add-user');
  if (addAdminUserBtn) addAdminUserBtn.addEventListener('click', openAdminAddUserModal);

  const saveAdminAddBtn = $('#btn-save-admin-add-user');
  if (saveAdminAddBtn) saveAdminAddBtn.addEventListener('click', saveAdminAddUser);

  const saveAdminEditBtn = $('#btn-save-admin-edit-user');
  if (saveAdminEditBtn) saveAdminEditBtn.addEventListener('click', saveAdminEditUser);

  const settingsForm = $('#admin-settings-form');
  if (settingsForm) settingsForm.addEventListener('submit', saveAdminSettings);

  const permsForm = $('#admin-permissions-form');
  if (permsForm) permsForm.addEventListener('submit', saveAdminPermissions);

  $('#btn-edit-group').addEventListener('click', openEditGroupModal);
  $('#btn-save-group-edit').addEventListener('click', saveGroupEdit);

  $('#edit-group-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state.pendingGroupEditAvatar = file;
    $('#edit-group-avatar-preview').src = URL.createObjectURL(file);
  });

  $('#btn-hdr-edit-msg')?.addEventListener('click', () => {
    if (state.selectedMessageId) {
      const msgId = state.selectedMessageId;
      window._deselectMessage();
      window._editMsg(msgId);
    }
  });

  $('#btn-hdr-delete-msg')?.addEventListener('click', async () => {
    if (state.selectedMessageId) {
      const msgId = state.selectedMessageId;
      window._deselectMessage();
      await window._deleteMsg(msgId);
    }
  });

  $('#btn-hdr-cancel-sel')?.addEventListener('click', () => {
    window._deselectMessage();
  });

  $('#messages-container')?.addEventListener('click', (e) => {
    if (!e.target.closest('.msg')) {
      window._deselectMessage();
    }
  });

  $('#profile-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state.pendingProfileAvatar = file;
    $('#profile-avatar-preview').src = URL.createObjectURL(file);
  });

  $('#btn-new-group').addEventListener('click', () => {
    resetGroupModal();
    openModal('modal-new-group');
    searchParticipants('');
  });
  $('#btn-create-group').addEventListener('click', createGroup);

  $('#participants-search').addEventListener('input', e => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => searchParticipants(e.target.value.trim()), 250);
  });

  $('#group-avatar-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state.pendingGroupAvatar = file;
    $('#group-avatar-preview').src = URL.createObjectURL(file);
  });

  $('#btn-back').addEventListener('click', () => {
    closeMobileChat(false);
  });

  window.addEventListener('popstate', (e) => {
    if (isMobileView() && !e.state?.chatOpen) {
      closeMobileChat(true);
    }
  });

  window.addEventListener('resize', () => {
    if (!isMobileView()) {
      const sidebar = $('#sidebar');
      const chatArea = $('#chat-area');
      if (sidebar) sidebar.classList.remove('slide-out');
      if (chatArea) chatArea.classList.remove('slide-in');
    }
  });
}

function attachInputListeners() {
  const input = $('#message-input');

  input.addEventListener('input', () => {
    autoResizeTextarea(input);
    toggleSendButton();
    if (state.activeConversation) {
      setLocalCache(`draft_${state.activeConversation.id}`, input.value);
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  $('#btn-send').addEventListener('click', sendMessage);

  $('#btn-emoji').addEventListener('click', e => {
    e.stopPropagation();
    const picker = $('#emoji-picker');
    picker.hasAttribute('hidden') ? show(picker) : hide(picker);
  });

  document.addEventListener('click', e => {
    const picker = $('#emoji-picker');
    const emojiBtn = $('#btn-emoji');
    if (picker && !picker.contains(e.target) && e.target !== emojiBtn) hide(picker);
    const results = $('#search-results');
    const searchInput = $('#search-input');
    if (results && !results.contains(e.target) && e.target !== searchInput) hide(results);
  });

  $('#search-input').addEventListener('input', e => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => searchUsers(e.target.value.trim()), 250);
  });
  $('#search-input').addEventListener('focus', e => {
    searchUsers(e.target.value.trim());
  });

  $('#btn-attach').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', e => { handleFileUpload(e.target.files[0]); e.target.value = ''; });
  $('#btn-cancel-media').addEventListener('click', clearPendingMedia);

  $('#btn-audio').addEventListener('click', startRecording);
  $('#btn-cancel-audio').addEventListener('click', cancelRecording);
  $('#btn-send-audio').addEventListener('click', () => stopRecording());

  $('#btn-camera').addEventListener('click', openCamera);
}

function attachCameraListeners() {
  $('#btn-capture').addEventListener('click', capturePhoto);
  $('#btn-use-photo').addEventListener('click', usePhoto);
  $('#btn-retake').addEventListener('click', async () => {
    hide('#camera-captured-preview');
    hide('#btn-use-photo');
    hide('#btn-retake');
    show('#camera-preview');
    show('#btn-capture');
    show('#btn-flip-camera');
    state.capturedPhotoBlob = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: state.cameraFacing } });
      state.cameraStream = stream;
      $('#camera-preview').srcObject = stream;
    } catch (e) { showToast('Erro ao acessar camera', 'error'); }
  });

  $('#btn-flip-camera').addEventListener('click', async () => {
    state.cameraFacing = state.cameraFacing === 'user' ? 'environment' : 'user';
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: state.cameraFacing } });
      state.cameraStream = stream;
      $('#camera-preview').srcObject = stream;
    } catch (e) { showToast('Erro ao trocar camera', 'error'); }
  });
}

function attachVirtualKeyboardFix() {
  if ('visualViewport' in window) {
    window.visualViewport.addEventListener('resize', () => {
      const app = $('#app');
      if (!app || !isMobileView()) return;
      const currentHeight = window.visualViewport.height;
      app.style.height = `${currentHeight}px`;
      if (state.activeConversation) {
        scrollToBottom(true);
      }
    });
  }
}

// START
document.addEventListener('DOMContentLoaded', init);
