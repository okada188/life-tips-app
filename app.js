// ============================================================
//  Life Tips – app.js
//  Firebase Auth + Firestore (serverless)
//  新機能: 投稿者アイコンクリック → ユーザープロフィールページ
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase 設定 ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCzdeaj6icUn1kmpNK-xsaopaR15eDhIw4",
  authDomain: "life-tips-app-4f749.firebaseapp.com",
  projectId: "life-tips-app-4f749",
  storageBucket: "life-tips-app-4f749.firebasestorage.app",
  messagingSenderId: "279534771909",
  appId: "1:279534771909:web:015e0e75a8e052e96b1aac",
  measurementId: "G-0JP8ETPWDB"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);


// ── オフライン投稿キュー ────────────────────────────────────
const OFFLINE_QUEUE_KEY = "lifetips_offline_queue";

function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function saveOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}
async function flushOfflineQueue() {
  const queue = getOfflineQueue();
  if (!queue.length || !currentUser) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await addDoc(collection(db, "posts"), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      showToast("オフライン中の投稿を送信しました ✅");
    } catch {
      remaining.push(item);
    }
  }
  saveOfflineQueue(remaining);
}

// オンラインに戻ったらキューを送信
window.addEventListener("online", () => {
  showToast("オンラインに戻りました。投稿を送信中...");
  flushOfflineQueue();
});

// ── グローバル状態 ──────────────────────────────────────────
let currentUser      = null;
let allPosts         = [];
let categories       = [];
let activeCategory   = "all";
let currentSort      = "latest";
let unsubscribePosts = null;
let currentAvatarEmoji = "🙂";

// カテゴリ色パレット（IDに対して安定した色を返す）
const CAT_COLORS = [
  { bg: "rgba(77,128,228,0.15)",  text: "#2a5fcc",  border: "rgba(77,128,228,0.4)"  }, // 青
  { bg: "rgba(52,168,83,0.15)",   text: "#1e7e40",  border: "rgba(52,168,83,0.4)"   }, // 緑
  { bg: "rgba(251,140,0,0.15)",   text: "#b35e00",  border: "rgba(251,140,0,0.4)"   }, // オレンジ
  { bg: "rgba(156,39,176,0.15)",  text: "#7b1fa2",  border: "rgba(156,39,176,0.4)"  }, // 紫
  { bg: "rgba(229,57,53,0.15)",   text: "#c62828",  border: "rgba(229,57,53,0.4)"   }, // 赤
  { bg: "rgba(0,172,193,0.15)",   text: "#006064",  border: "rgba(0,172,193,0.4)"   }, // シアン
  { bg: "rgba(255,193,7,0.18)",   text: "#7d5a00",  border: "rgba(255,193,7,0.5)"   }, // 黄
  { bg: "rgba(233,30,99,0.15)",   text: "#ad1457",  border: "rgba(233,30,99,0.4)"   }, // ピンク
];

function getCatColor(categoryId) {
  // デフォルトカテゴリは固定色
  if (categoryId === "housework") return CAT_COLORS[1]; // 緑
  if (categoryId === "saving")    return CAT_COLORS[2]; // オレンジ
  if (categoryId === "points")    return CAT_COLORS[0]; // 青
  // カスタムカテゴリはID文字列をハッシュして色を決定
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = categoryId.charCodeAt(i) + ((hash << 5) - hash);
  return CAT_COLORS[Math.abs(hash) % CAT_COLORS.length];
}

// ── DOM 取得 ────────────────────────────────────────────────
const welcomeOverlay     = document.getElementById("welcome-overlay");
const welcomeStartBtn    = document.getElementById("welcome-start-btn");
const appContainer       = document.getElementById("app-container");

const googleLoginBtn     = document.getElementById("google-login-btn");
const logoutBtn          = document.getElementById("logout-btn");
const userProfileEl      = document.getElementById("user-profile");
const userNameDisplay    = document.getElementById("user-name-display");

const navHomeBtn         = document.getElementById("nav-home-btn");
const navMypageBtn       = document.getElementById("nav-mypage-btn");
const headerLogo         = document.getElementById("header-logo");

const homeView           = document.getElementById("home-view");
const mypageView         = document.getElementById("mypage-view");
const userProfileView    = document.getElementById("user-profile-view");

const postTriggerInput   = document.getElementById("post-trigger-input");
const postForm           = document.getElementById("post-form");
const postTitle          = document.getElementById("post-title");
const postContent        = document.getElementById("post-content");
const postImage          = document.getElementById("post-image");
const postCategory       = document.getElementById("post-category");
const addCategoryBtn     = document.getElementById("add-category-btn");
const saveDraftBtn       = document.getElementById("save-draft-btn");
const cancelPostBtn      = document.getElementById("cancel-post-btn");
const draftSavedMsg      = document.getElementById("draft-saved-msg");

const filtersContainer   = document.getElementById("filters-container");
const sortSelect         = document.getElementById("sort-select");
const postsContainer     = document.getElementById("posts-container");

const mypageNameText     = document.getElementById("mypage-name-text");
const editNameBtn        = document.getElementById("edit-name-btn");
const totalLikesEl       = document.getElementById("total-likes");
const myPostsContainer   = document.getElementById("my-posts-container");

// user-profile-view
const backToHomeBtn      = document.getElementById("back-to-home-btn");
const profileViewAvatar  = document.getElementById("profile-view-avatar");
const profileViewName    = document.getElementById("profile-view-name");
const profileViewCount   = document.getElementById("profile-view-post-count");
const profileViewLikes   = document.getElementById("profile-view-likes");
const userPostsContainer = document.getElementById("user-posts-container");

const toastEl            = document.getElementById("toast-notification");
const editModal          = document.getElementById("edit-modal");
const editForm           = document.getElementById("edit-form");
const editPostId         = document.getElementById("edit-post-id");
const editPostTitle      = document.getElementById("edit-post-title");
const editPostContent    = document.getElementById("edit-post-content");
const editPostImage      = document.getElementById("edit-post-image");
const editPostCategory   = document.getElementById("edit-post-category");
const cancelEditBtn      = document.getElementById("cancel-edit-btn");

// ── ウェルカム画面 ───────────────────────────────────────────
const WELCOME_SHOWN_KEY = "lifetips_welcome_shown";

function initWelcome() {
  const alreadyShown = localStorage.getItem(WELCOME_SHOWN_KEY);
  if (alreadyShown) {
    hideWelcome();
    return;
  }
  welcomeOverlay.classList.remove("hidden");
  appContainer.classList.add("hidden");
}

function hideWelcome() {
  welcomeOverlay.classList.add("hidden");
  appContainer.classList.remove("hidden");
  localStorage.setItem(WELCOME_SHOWN_KEY, "1");
}

welcomeStartBtn.addEventListener("click", hideWelcome);

// ── Auth ─────────────────────────────────────────────────────
googleLoginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    showToast("ログインに失敗しました: " + e.message, "error");
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    googleLoginBtn.classList.add("hidden");
    userProfileEl.classList.remove("hidden");
    userNameDisplay.textContent = "";
    postTriggerInput.placeholder = "知恵をシェアする...";

    // users コレクションに保存/更新（photoURLはGoogleのものを使わず、カスタムアイコンのみ管理）
    const uSnap = await getDoc(doc(db, "users", user.uid));
    if (!uSnap.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        displayName: user.displayName || "",
        email: user.email,
        avatarEmoji: "🙂",
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(doc(db, "users", user.uid), {
        displayName: uSnap.data().displayName || user.displayName || "",
        email: user.email,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // アバター絵文字をローカルに記憶
    const savedEmoji = uSnap.exists() ? (uSnap.data().avatarEmoji || "🙂") : "🙂";
    currentAvatarEmoji = savedEmoji;
    const mypageAvatarEl = document.getElementById("mypage-avatar-display");
    if (mypageAvatarEl) mypageAvatarEl.textContent = savedEmoji;

    loadDraft();
    flushOfflineQueue();
  } else {
    googleLoginBtn.classList.remove("hidden");
    userProfileEl.classList.add("hidden");
    userNameDisplay.textContent = "";
    postTriggerInput.placeholder = "知恵をシェアする... (ログインが必要です)";
    postForm.classList.add("hidden");
    currentAvatarEmoji = "🙂";
  }
  updateMypageView();
});

// ── ナビゲーション ──────────────────────────────────────────
function showView(view) {
  homeView.classList.add("hidden");
  mypageView.classList.add("hidden");
  userProfileView.classList.add("hidden");
  navHomeBtn.classList.remove("active");
  navMypageBtn.classList.remove("active");

  if (view === "home") {
    homeView.classList.remove("hidden");
    navHomeBtn.classList.add("active");
  } else if (view === "mypage") {
    mypageView.classList.remove("hidden");
    navMypageBtn.classList.add("active");
    updateMypageView();
  } else if (view === "user-profile") {
    userProfileView.classList.remove("hidden");
  }
}

navHomeBtn.addEventListener("click", () => showView("home"));
navMypageBtn.addEventListener("click", () => {
  if (!currentUser) { showToast("ログインが必要です"); return; }
  showView("mypage");
});
headerLogo.addEventListener("click", () => showView("home"));
backToHomeBtn.addEventListener("click", () => showView("home"));

// ── カテゴリ読み込み ─────────────────────────────────────────
async function loadCategories() {
  const defaults = [
    { id: "housework", label: "家事" },
    { id: "saving",    label: "節約術" },
    { id: "points",    label: "ポイント運用" }
  ];
  try {
    const snap = await getDoc(doc(db, "settings", "categories"));
    categories = snap.exists() ? snap.data().list : defaults;
  } catch {
    categories = defaults;
  }
  renderCategorySelects();
  renderFilters();
}

function renderCategorySelects() {
  [postCategory, editPostCategory].forEach(sel => {
    sel.innerHTML = categories.map(c =>
      `<option value="${c.id}">${c.label}</option>`
    ).join("");
  });
}

function renderFilters() {
  filtersContainer.innerHTML =
    `<button class="filter-btn ${activeCategory === "all" ? "active" : ""}" data-cat="all">すべて</button>` +
    categories.map(c =>
      `<button class="filter-btn ${activeCategory === c.id ? "active" : ""}" data-cat="${c.id}">${c.label}</button>`
    ).join("");

  filtersContainer.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderFilters();
      renderPosts();
    });
  });
}

addCategoryBtn.addEventListener("click", async () => {
  if (!currentUser) { showToast("ログインが必要です"); return; }
  const label = prompt("新しいカテゴリ名を入力してください:");
  if (!label) return;
  const id = label.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
  categories.push({ id, label });
  await setDoc(doc(db, "settings", "categories"), { list: categories });
  renderCategorySelects();
  renderFilters();
  showToast("カテゴリを追加しました ✅");
});

// ── 投稿フォーム ─────────────────────────────────────────────
function openPostForm() {
  if (!currentUser) { showToast("Googleログインが必要です"); return; }
  postForm.classList.remove("hidden");
  postTitle.focus();
}
postTriggerInput.addEventListener("click", openPostForm);
cancelPostBtn.addEventListener("click", () => postForm.classList.add("hidden"));

saveDraftBtn.addEventListener("click", () => {
  localStorage.setItem("draft_title",   postTitle.value);
  localStorage.setItem("draft_content", postContent.value);
  draftSavedMsg.classList.remove("hidden");
  setTimeout(() => draftSavedMsg.classList.add("hidden"), 2000);
});

function loadDraft() {
  postTitle.value   = localStorage.getItem("draft_title")   || "";
  postContent.value = localStorage.getItem("draft_content") || "";
}

// 画像圧縮
async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

postForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) { showToast("ログインが必要です"); return; }

  const file = postImage.files[0];
  if (file && file.size > 3 * 1024 * 1024) {
    showToast("画像は3MB以下にしてください", "error"); return;
  }

  const imageData = file ? await compressImage(file) : null;

  const postData = {
    title:             postTitle.value.trim(),
    content:           postContent.value.trim(),
    category:          postCategory.value,
    author:            currentUser.displayName || currentUser.email,
    authorId:          currentUser.uid,
    authorAvatarEmoji: currentAvatarEmoji,
    image:             imageData,
    likes:             0,
    likedBy:           []
  };

  if (!navigator.onLine) {
    // オフライン時はローカルに保存
    const queue = getOfflineQueue();
    queue.push({ ...postData, _savedAt: Date.now() });
    saveOfflineQueue(queue);
    postForm.reset();
    postForm.classList.add("hidden");
    localStorage.removeItem("draft_title");
    localStorage.removeItem("draft_content");
    showToast("オフラインのため一時保存しました。オンライン時に自動送信されます 📥");
    return;
  }

  try {
    await addDoc(collection(db, "posts"), {
      ...postData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    postForm.reset();
    postForm.classList.add("hidden");
    localStorage.removeItem("draft_title");
    localStorage.removeItem("draft_content");
    showToast("投稿しました ✅");
  } catch (err) {
    // 送信失敗時もオフラインキューに保存
    const queue = getOfflineQueue();
    queue.push({ ...postData, _savedAt: Date.now() });
    saveOfflineQueue(queue);
    postForm.reset();
    postForm.classList.add("hidden");
    showToast("送信に失敗しました。オンライン復帰後に自動送信します 📥", "error");
  }
});

// ── 投稿一覧 ─────────────────────────────────────────────────
function subscribePosts() {
  if (unsubscribePosts) unsubscribePosts();
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  unsubscribePosts = onSnapshot(q, (snap) => {
    allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPosts();
    updateMypageView();
  });
}

sortSelect.addEventListener("change", (e) => {
  currentSort = e.target.value;
  renderPosts();
});

function renderPosts() {
  let posts = activeCategory === "all"
    ? [...allPosts]
    : allPosts.filter(p => p.category === activeCategory);

  if (currentSort === "likes") {
    posts.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  }

  postsContainer.innerHTML = posts.length
    ? posts.map(p => buildPostCard(p, false)).join("")
    : `<p style="text-align:center;color:var(--text-muted);padding:2rem;">まだ投稿がありません</p>`;

  attachPostEvents(postsContainer, false);
}

function buildPostCard(post, isOwner) {
  const catLabel  = categories.find(c => c.id === post.category)?.label || post.category;
  const isLiked   = currentUser && post.likedBy?.includes(currentUser.uid);
  const isAuthor  = currentUser && post.authorId === currentUser.uid;
  const isPopular = (post.likes || 0) >= 3;
  const date      = post.updatedAt?.toDate
    ? post.updatedAt.toDate().toLocaleDateString("ja-JP")
    : "";
  // アバター絵文字（Googleアカウント画像は使わない）
  const emoji  = post.authorAvatarEmoji || "🙂";
  const avatar = `<span class="author-avatar author-avatar-text" data-author-id="${post.authorId}" data-author-name="${escHtml(post.author)}" title="${escHtml(post.author)}のページを見る">${emoji}</span>`;
  // カテゴリ色
  const catColor = getCatColor(post.category);

  return `
  <article class="post-card glass-panel" data-id="${post.id}">
    <div class="post-card-header">
      <div class="post-author-info">
        ${avatar}
        <div>
          <span class="post-author-name">${escHtml(post.author)}</span>
          <span class="post-date">${date}</span>
        </div>
      </div>
      <div class="post-meta-right">
        ${isPopular ? `<span class="popular-badge">★ 人気</span>` : ""}
        <span class="post-category-tag" style="background:${catColor.bg};color:${catColor.text};border-color:${catColor.border};">${escHtml(catLabel)}</span>
      </div>
    </div>
    <h3 class="post-title">${escHtml(post.title)}</h3>
    <p class="post-content">${escHtml(post.content)}</p>
    ${post.image ? `<img src="${post.image}" class="post-image" loading="lazy" />` : ""}
    <div class="post-footer">
      <button class="like-btn ${isLiked ? "liked" : ""}" data-id="${post.id}">
        ❤️ ${post.likes || 0}
      </button>
      ${isAuthor ? `
        <button class="edit-btn secondary-btn small-btn" data-id="${post.id}">編集</button>
        <button class="delete-btn secondary-btn small-btn danger" data-id="${post.id}">削除</button>
      ` : ""}
    </div>
  </article>`;
}

function attachPostEvents(container, isMyPage) {
  // いいね
  container.querySelectorAll(".like-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!currentUser) { showToast("ログインが必要です"); return; }
      const id    = btn.dataset.id;
      const post  = allPosts.find(p => p.id === id);
      if (!post) return;
      const ref   = doc(db, "posts", id);
      const liked = post.likedBy?.includes(currentUser.uid);
      await updateDoc(ref, {
        likes:   increment(liked ? -1 : 1),
        likedBy: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    });
  });

  // 編集
  container.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const post = allPosts.find(p => p.id === btn.dataset.id);
      if (!post) return;
      editPostId.value = post.id;
      editPostTitle.value   = post.title;
      editPostContent.value = post.content;
      renderCategorySelects();
      editPostCategory.value = post.category;
      editModal.classList.remove("hidden");
    });
  });

  // 削除
  container.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("この投稿を削除しますか？")) return;
      await deleteDoc(doc(db, "posts", btn.dataset.id));
      showToast("投稿を削除しました");
    });
  });

  // ── 投稿者アイコンクリック → ユーザープロフィールページ ──
  container.querySelectorAll(".author-avatar").forEach(el => {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      const authorId   = el.dataset.authorId;
      const authorName = el.dataset.authorName;
      if (!authorId) return;
      // 自分自身の場合はマイページへ
      if (currentUser && authorId === currentUser.uid) {
        showView("mypage");
        return;
      }
      openUserProfileView(authorId, authorName);
    });
  });
}

// ── ユーザープロフィールページ ──────────────────────────────
async function openUserProfileView(authorId, authorName) {
  showView("user-profile");

  profileViewName.textContent = authorName;
  profileViewAvatar.textContent = "👤";
  profileViewCount.textContent = "読み込み中…";
  profileViewLikes.textContent = "読み込み中…";
  userPostsContainer.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:2rem;">読み込み中...</p>`;

  // users コレクションから photoURL を取得
  try {
    const uSnap = await getDoc(doc(db, "users", authorId));
    if (uSnap.exists() && uSnap.data().photoURL) {
      profileViewAvatar.innerHTML =
        `<img src="${uSnap.data().photoURL}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" />`;
    }
  } catch(_) {}

  // その人の投稿を取得
  const q = query(
    collection(db, "posts"),
    where("authorId", "==", authorId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const totalLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
  profileViewCount.textContent = `${posts.length} 📝`;
  profileViewLikes.textContent = `${totalLikes} ❤️`;

  userPostsContainer.innerHTML = posts.length
    ? posts.map(p => buildPostCard(p, false)).join("")
    : `<p style="text-align:center;color:var(--text-muted);padding:2rem;">まだ投稿がありません</p>`;

  attachPostEvents(userPostsContainer, false);
}

// ── アバター選択 ─────────────────────────────────────────────
const AVATAR_EMOJIS = [
  "🙂","😄","😎","🤩","🥳","😇","🤓","😺",
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼",
  "🌸","🌻","🌈","⭐","🔥","💎","🎯","🚀",
  "🍀","🦋","🦄","🐉","🌙","☀️","🎵","🎨",
];

const avatarModal    = document.getElementById("avatar-modal");
const avatarGrid     = document.getElementById("avatar-grid");
const cancelAvatarBtn = document.getElementById("cancel-avatar-btn");
const mypageAvatarDisplay = document.getElementById("mypage-avatar-display");

// グリッドを生成
AVATAR_EMOJIS.forEach(emoji => {
  const btn = document.createElement("button");
  btn.className = "avatar-option";
  btn.textContent = emoji;
  btn.addEventListener("click", async () => {
    currentAvatarEmoji = emoji;
    mypageAvatarDisplay.textContent = emoji;
    avatarModal.classList.add("hidden");
    // Firestoreに保存
    if (currentUser) {
      await setDoc(doc(db, "users", currentUser.uid), { avatarEmoji: emoji }, { merge: true });
    }
    showToast("アイコンを変更しました ✅");
  });
  avatarGrid.appendChild(btn);
});

mypageAvatarDisplay && mypageAvatarDisplay.addEventListener("click", () => {
  if (!currentUser) return;
  avatarModal.classList.remove("hidden");
});
if (cancelAvatarBtn) cancelAvatarBtn.addEventListener("click", () => avatarModal.classList.add("hidden"));
if (avatarModal) avatarModal.addEventListener("click", e => { if (e.target === avatarModal) avatarModal.classList.add("hidden"); });

// ── マイページ ───────────────────────────────────────────────
function updateMypageView() {
  if (!currentUser) return;
  mypageNameText.textContent = currentUser.displayName || currentUser.email;
  const myPosts    = allPosts.filter(p => p.authorId === currentUser.uid);
  const myLikes    = myPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
  totalLikesEl.textContent = `${myLikes} ❤️`;
  myPostsContainer.innerHTML = myPosts.length
    ? myPosts.map(p => buildPostCard(p, true)).join("")
    : `<p style="text-align:center;color:var(--text-muted);padding:2rem;">まだ投稿がありません</p>`;
  attachPostEvents(myPostsContainer, true);
}

editNameBtn.addEventListener("click", async () => {
  const newName = prompt("新しい表示名を入力してください:", currentUser.displayName || "");
  if (!newName) return;
  await updateDoc(doc(db, "users", currentUser.uid), { displayName: newName });
  // Auth の displayName も更新
  const { updateProfile } = await import(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"
  );
  await updateProfile(currentUser, { displayName: newName });
  updateMypageView();
  showToast("表示名を更新しました ✅");
});

// ── 編集モーダル ─────────────────────────────────────────────
cancelEditBtn.addEventListener("click", () => editModal.classList.add("hidden"));
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) editModal.classList.add("hidden");
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id   = editPostId.value;
  const file = editPostImage.files[0];
  const post = allPosts.find(p => p.id === id);
  if (!post) return;

  let imageData = post.image;
  if (file) {
    if (file.size > 3 * 1024 * 1024) { showToast("画像は3MB以下にしてください", "error"); return; }
    imageData = await compressImage(file);
  }

  await updateDoc(doc(db, "posts", id), {
    title:     editPostTitle.value.trim(),
    content:   editPostContent.value.trim(),
    category:  editPostCategory.value,
    image:     imageData,
    updatedAt: serverTimestamp()
  });
  editModal.classList.add("hidden");
  showToast("投稿を更新しました ✅");
});

// ── トースト ─────────────────────────────────────────────────
function showToast(msg, type = "success") {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type}`;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 3000);
}

// ── エスケープ ───────────────────────────────────────────────
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── 起動 ─────────────────────────────────────────────────────
initWelcome();
loadCategories();
subscribePosts();
