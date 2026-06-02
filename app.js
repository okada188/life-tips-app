// ============================================================
// app.js - Firebase Auth + Firestore 本番版
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  arrayUnion,
  increment
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Firebase 初期化 ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCzdeaj6icUn1kmpNK-xsaopaR15eDhIw4",
  authDomain: "life-tips-app-4f749.firebaseapp.com",
  projectId: "life-tips-app-4f749",
  storageBucket: "life-tips-app-4f749.firebasestorage.app",
  messagingSenderId: "279534771909",
  appId: "1:279534771909:web:015e0e75a8e052e96b1aac",
  measurementId: "G-0JP8ETPWDB"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const provider    = new GoogleAuthProvider();

// ── 定数 ────────────────────────────────────────────────────
const STAR_THRESHOLD = 3;
const DRAFT_KEY      = 'life_tips_draft';

const DEFAULT_CATEGORIES = [
  { id: 'housework', label: '家事' },
  { id: 'saving',    label: '節約術' },
  { id: 'points',    label: 'ポイント運用' }
];

// ── アプリ状態 ───────────────────────────────────────────────
let posts          = [];
let categories     = [...DEFAULT_CATEGORIES];
let activeCategory = 'all';
let currentUser    = null;
let unsubPosts     = null;

// ── DOM ─────────────────────────────────────────────────────
const googleLoginBtn       = document.getElementById('google-login-btn');
const logoutBtn            = document.getElementById('logout-btn');
const userProfile          = document.getElementById('user-profile');
const userNameText         = document.getElementById('user-name-display');

const postForm             = document.getElementById('post-form');
const postTriggerContainer = document.getElementById('post-trigger-container');
const postTriggerInput     = document.getElementById('post-trigger-input');
const openPostFormBtn      = document.getElementById('open-post-form-btn');
const cancelPostBtn        = document.getElementById('cancel-post-btn');
const saveDraftBtn         = document.getElementById('save-draft-btn');
const draftSavedMsg        = document.getElementById('draft-saved-msg');
const addCategoryBtn       = document.getElementById('add-category-btn');
const postCategorySelect   = document.getElementById('post-category');
const filtersContainer     = document.getElementById('filters-container');
const sortSelect           = document.getElementById('sort-select');

const postsContainer       = document.getElementById('posts-container');
const myPostsContainer     = document.getElementById('my-posts-container');
const totalLikesDisplay    = document.getElementById('total-likes');

const navHomeBtn           = document.getElementById('nav-home-btn');
const navMypageBtn         = document.getElementById('nav-mypage-btn');
const homeView             = document.getElementById('home-view');
const mypageView           = document.getElementById('mypage-view');

const editModal            = document.getElementById('edit-modal');
const editForm             = document.getElementById('edit-form');
const cancelEditBtn        = document.getElementById('cancel-edit-btn');
const editPostCategorySelect = document.getElementById('edit-post-category');

const mypageNameText       = document.getElementById('mypage-name-text');
const editNameBtn          = document.getElementById('edit-name-btn');

// ── ユーティリティ ───────────────────────────────────────────

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g,
    tag => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":"&#39;",'"':'&quot;' }[tag])
  );
}

function stringToHslColor(str, s = 65, l = 55) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash % 360)}, ${s}%, ${l}%)`;
}

function getCategoryColor(id, l = 55) {
  if (id === 'housework') return `hsl(200, 70%, ${l}%)`;  // 青系
  if (id === 'saving')    return `hsl(140, 60%, ${l}%)`;  // 緑系
  if (id === 'points')    return `hsl(30,  90%, ${l}%)`;  // オレンジ系
  return stringToHslColor(id, 65, l);
}

function getCategoryLabel(id) {
  const cat = categories.find(c => c.id === id);
  return cat ? cat.label : '未分類';
}

/** 画像をCanvas経由で圧縮してbase64を返す */
function compressImage(file, maxWidth = 800, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(''); return; }
    if (file.size > 3 * 1024 * 1024) {
      reject(new Error('画像ファイルは3MB以下を選択してください。'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Firestore: カテゴリ ──────────────────────────────────────

async function loadCategories() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'categories'));
    if (snap.exists()) {
      categories = snap.data().list || DEFAULT_CATEGORIES;
    } else {
      await setDoc(doc(db, 'settings', 'categories'), { list: DEFAULT_CATEGORIES });
      categories = DEFAULT_CATEGORIES;
    }
  } catch (err) {
    console.warn('カテゴリ読み込みエラー:', err);
    categories = DEFAULT_CATEGORIES;
  }
  renderCategories();
}

async function saveCategories() {
  await setDoc(doc(db, 'settings', 'categories'), { list: categories });
}

// ── Firestore: 投稿 ─────────────────────────────────────────

function subscribeToPosts() {
  if (unsubPosts) unsubPosts();
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  unsubPosts = onSnapshot(q, (snapshot) => {
    posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPosts();
    if (!mypageView.classList.contains('hidden')) renderMyPage();
  }, (err) => {
    console.error('投稿の取得エラー:', err);
    postsContainer.innerHTML = '<p style="color:red;text-align:center;">データ取得中にエラーが発生しました。ページを再読み込みしてください。</p>';
  });
}

async function addPostToDB(postData) {
  await addDoc(collection(db, 'posts'), {
    ...postData,
    likes:     0,
    likedBy:   [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function updatePostInDB(postId, data) {
  await updateDoc(doc(db, 'posts', postId), { ...data, updatedAt: serverTimestamp() });
}

async function deletePostFromDB(postId) {
  await deleteDoc(doc(db, 'posts', postId));
}

async function likePostInDB(postId) {
  await updateDoc(doc(db, 'posts', postId), {
    likes:   increment(1),
    likedBy: arrayUnion(currentUser.uid)
  });
}

// ── Firestore: ユーザープロフィール ─────────────────────────

async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

async function saveUserProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}

// ── 認証 ────────────────────────────────────────────────────

async function handleAuthStateChange(firebaseUser) {
  if (firebaseUser) {
    let profile = await getUserProfile(firebaseUser.uid);
    const displayName = profile?.displayName || firebaseUser.displayName || 'ユーザー';

    if (!profile) {
      await saveUserProfile(firebaseUser.uid, {
        displayName,
        email:     firebaseUser.email,
        photoURL:  firebaseUser.photoURL || '',
        createdAt: serverTimestamp()
      });
    }

    currentUser = {
      uid:      firebaseUser.uid,
      name:     displayName,
      email:    firebaseUser.email,
      photoURL: firebaseUser.photoURL
    };
  } else {
    currentUser = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  if (currentUser) {
    googleLoginBtn.classList.add('hidden');
    userProfile.classList.remove('hidden');
    userNameText.textContent     = currentUser.name;
    postTriggerInput.placeholder = '知恵をシェアする...';
    mypageNameText.textContent   = currentUser.name;
  } else {
    googleLoginBtn.classList.remove('hidden');
    userProfile.classList.add('hidden');
    postTriggerInput.placeholder = '知恵をシェアする... (ログインが必要です)';
    mypageNameText.textContent   = '';
  }
}

// ── 描画 ────────────────────────────────────────────────────

function renderCategories() {
  // フォーム内セレクト
  postCategorySelect.innerHTML     = '';
  editPostCategorySelect.innerHTML = '';
  categories.forEach(cat => {
    const opt = `<option value="${cat.id}">${escapeHTML(cat.label)}</option>`;
    postCategorySelect.innerHTML     += opt;
    editPostCategorySelect.innerHTML += opt;
  });

  // フィルターボタン
  filtersContainer.innerHTML = `
    <button class="filter-btn ${activeCategory === 'all' ? 'active' : ''}"
      data-category="all"
      style="${activeCategory === 'all' ? 'background:var(--primary-color);color:white;border-color:var(--primary-color);' : ''}">
      すべて
    </button>`;

  categories.forEach(cat => {
    const color    = getCategoryColor(cat.id, 55);
    const isActive = activeCategory === cat.id;
    const style    = isActive
      ? `background:${color};color:white;border-color:${color};`
      : `color:${getCategoryColor(cat.id, 45)};border-color:${getCategoryColor(cat.id, 45)};`;
    filtersContainer.innerHTML += `
      <button class="filter-btn ${isActive ? 'active' : ''}"
        data-category="${cat.id}" style="${style}">
        ${escapeHTML(cat.label)}
      </button>`;
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeCategory = e.target.dataset.category;
      renderCategories();
      renderPosts();
    });
  });
}

function renderPosts() {
  postsContainer.innerHTML = '';

  let filtered = activeCategory === 'all'
    ? [...posts]
    : posts.filter(p => p.category === activeCategory);

  if (sortSelect.value === 'likes') {
    filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else {
    filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }

  if (filtered.length === 0) {
    postsContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);">投稿がありません。</p>';
    return;
  }
  filtered.forEach(post => postsContainer.appendChild(createPostCard(post, false)));
}

function renderMyPage() {
  if (!currentUser) return;
  myPostsContainer.innerHTML = '';
  mypageNameText.textContent = currentUser.name;

  const myPosts = posts
    .filter(p => p.authorId === currentUser.uid)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  totalLikesDisplay.textContent = `${myPosts.reduce((s, p) => s + (p.likes || 0), 0)} ❤️`;

  if (myPosts.length === 0) {
    myPostsContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);">まだ投稿がありません。</p>';
    return;
  }
  myPosts.forEach(post => myPostsContainer.appendChild(createPostCard(post, true)));
}

function createPostCard(post, isMyPage) {
  const hasStar       = (post.likes || 0) >= STAR_THRESHOLD;
  const hasLiked      = currentUser && Array.isArray(post.likedBy) && post.likedBy.includes(currentUser.uid);
  const categoryLabel = getCategoryLabel(post.category);
  const badgeColor    = getCategoryColor(post.category);

  const article = document.createElement('article');
  article.className = 'post-card glass-panel';

  const actionButtons = isMyPage ? `
    <div class="post-actions">
      <button class="secondary-btn small-btn" onclick="event.stopPropagation(); openEditModal('${post.id}')">編集</button>
      <button class="secondary-btn small-btn" style="color:red;" onclick="event.stopPropagation(); deletePost('${post.id}')">削除</button>
    </div>` : '';

  const imageTag = post.image
    ? `<img src="${post.image}" class="post-image-display" alt="投稿画像" />`
    : '';

  const likeBtn = !isMyPage ? `
    <button class="like-btn ${hasLiked ? 'liked' : ''}"
      onclick="event.stopPropagation(); handleLike('${post.id}')"
      ${hasLiked ? 'disabled' : ''}>
      ${hasLiked ? '❤️' : '🤍'} ${post.likes || 0}
    </button>` : actionButtons;

  article.innerHTML = `
    <div class="post-header" onclick="this.parentElement.classList.toggle('expanded')" title="クリックして詳細を見る">
      <div class="post-header-inner">
        <span class="post-category-badge" style="background-color:${badgeColor};">${escapeHTML(categoryLabel)}</span>
        <div class="post-title-container">
          <span class="expand-icon">▼</span>
          <h3 class="post-title">${escapeHTML(post.title)}</h3>
        </div>
      </div>
    </div>
    <div class="post-content">
      ${escapeHTML(post.content)}
      ${imageTag}
    </div>
    <div class="post-footer">
      <div class="author-info">
        投稿者: <span class="author-name">${escapeHTML(post.author)}</span>
        ${hasStar ? '<span class="star-badge" title="人気投稿！">★</span>' : ''}
      </div>
      ${likeBtn}
    </div>`;
  return article;
}

// ── グローバルアクション（HTML内 onclick から呼び出し） ──────

window.handleLike = async (postId) => {
  if (!currentUser) { alert('いいねをするにはログインが必要です。'); return; }
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  if (Array.isArray(post.likedBy) && post.likedBy.includes(currentUser.uid)) {
    showToast('すでにいいね！しています。');
    return;
  }
  try {
    await likePostInDB(postId);
  } catch (err) {
    console.error(err);
    showToast('エラーが発生しました。');
  }
};

window.deletePost = async (postId) => {
  if (!confirm('本当にこの投稿を削除しますか？')) return;
  try {
    await deletePostFromDB(postId);
    showToast('投稿を削除しました。');
  } catch (err) {
    console.error(err);
    showToast('削除に失敗しました。');
  }
};

window.openEditModal = (postId) => {
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  document.getElementById('edit-post-id').value       = post.id;
  document.getElementById('edit-post-title').value    = post.title;
  document.getElementById('edit-post-content').value  = post.content;
  document.getElementById('edit-post-category').value = post.category;
  document.getElementById('edit-post-image').value    = '';
  editModal.classList.remove('hidden');
};

// ── イベントリスナー ─────────────────────────────────────────

function setupEventListeners() {
  // Googleログイン
  googleLoginBtn.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('ログインエラー:', err);
        showToast('ログインに失敗しました。ポップアップを許可してください。');
      }
    }
  });

  // ログアウト
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    navHomeBtn.click();
    showToast('ログアウトしました。');
  });

  // ナビゲーション
  navHomeBtn.addEventListener('click', () => {
    navHomeBtn.classList.add('active');
    navMypageBtn.classList.remove('active');
    homeView.classList.remove('hidden');
    mypageView.classList.add('hidden');
    renderPosts();
  });

  navMypageBtn.addEventListener('click', () => {
    if (!currentUser) { alert('マイページを見るにはログインしてください。'); return; }
    navMypageBtn.classList.add('active');
    navHomeBtn.classList.remove('active');
    mypageView.classList.remove('hidden');
    homeView.classList.add('hidden');
    renderMyPage();
  });

  // ソート
  sortSelect.addEventListener('change', renderPosts);

  // 名前編集
  editNameBtn.addEventListener('click', async () => {
    const newName = prompt('新しい名前を入力してください:', currentUser.name);
    if (!newName || !newName.trim()) return;
    const trimmed = newName.trim();
    try {
      await saveUserProfile(currentUser.uid, { displayName: trimmed });
      currentUser.name = trimmed;
      updateAuthUI();
      if (!mypageView.classList.contains('hidden')) renderMyPage();
      showToast('名前を更新しました！');
    } catch (err) {
      console.error(err);
      showToast('名前の更新に失敗しました。');
    }
  });

  // カテゴリ追加
  addCategoryBtn.addEventListener('click', async () => {
    const name = prompt('新しいジャンル名を入力してください:');
    if (!name || !name.trim()) return;
    const label = name.trim();
    const newId = 'cat_' + Date.now();
    categories.push({ id: newId, label });
    try {
      await saveCategories();
      renderCategories();
      showToast(`「${label}」を追加しました！`);
    } catch (err) {
      console.error(err);
      categories.pop();
      showToast('カテゴリの追加に失敗しました。');
    }
  });

  // 投稿フォーム 開閉
  const showForm = () => {
    if (!currentUser) { alert('投稿するにはログインが必要です。'); return; }
    postTriggerContainer.classList.add('hidden');
    postForm.classList.remove('hidden');

    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (draft) {
      document.getElementById('post-title').value   = draft.title   || '';
      document.getElementById('post-content').value = draft.content || '';
      if (draft.category) document.getElementById('post-category').value = draft.category;
    }
    document.getElementById('post-title').focus();
  };
  const hideForm = () => {
    postForm.classList.add('hidden');
    postTriggerContainer.classList.remove('hidden');
    postForm.reset();
  };

  openPostFormBtn.addEventListener('click', showForm);
  postTriggerInput.addEventListener('click', showForm);
  cancelPostBtn.addEventListener('click', hideForm);

  // 下書き保存
  saveDraftBtn.addEventListener('click', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      title:    document.getElementById('post-title').value,
      content:  document.getElementById('post-content').value,
      category: document.getElementById('post-category').value
    }));
    draftSavedMsg.classList.remove('hidden');
    setTimeout(() => draftSavedMsg.classList.add('hidden'), 2000);
  });

  // 投稿フォーム 送信
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const title    = document.getElementById('post-title').value.trim();
    const content  = document.getElementById('post-content').value.trim();
    const category = document.getElementById('post-category').value;
    const imgFile  = document.getElementById('post-image').files[0];

    if (!title || !content) { showToast('タイトルと内容は必須です。'); return; }

    try {
      const image = imgFile ? await compressImage(imgFile) : '';
      await addPostToDB({ title, content, category, author: currentUser.name, authorId: currentUser.uid, image });
      localStorage.removeItem(DRAFT_KEY);
      hideForm();
      showToast('投稿しました！ 🎉');
    } catch (err) {
      console.error('投稿エラー:', err);
      showToast('投稿に失敗しました: ' + err.message);
    }
  });

  // 編集モーダル
  cancelEditBtn.addEventListener('click', () => editModal.classList.add('hidden'));

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = document.getElementById('edit-post-id').value;
    const title    = document.getElementById('edit-post-title').value.trim();
    const content  = document.getElementById('edit-post-content').value.trim();
    const category = document.getElementById('edit-post-category').value;
    const imgFile  = document.getElementById('edit-post-image').files[0];

    if (!title || !content) { showToast('タイトルと内容は必須です。'); return; }

    try {
      const existing = posts.find(p => p.id === id);
      const image    = imgFile ? await compressImage(imgFile) : (existing?.image || '');
      await updatePostInDB(id, { title, content, category, image });
      editModal.classList.add('hidden');
      showToast('投稿を更新しました！');
    } catch (err) {
      console.error('編集エラー:', err);
      showToast('更新に失敗しました: ' + err.message);
    }
  });
}

// ── 初期化 ──────────────────────────────────────────────────

async function init() {
  setupEventListeners();

  // ローディング表示
  postsContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);">読み込み中...</p>';

  await loadCategories();
  subscribeToPosts();

  // 認証状態を監視
  onAuthStateChanged(auth, handleAuthStateChange);
}

init();
