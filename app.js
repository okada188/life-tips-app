// ============================================================
//  Life Tips – app.js
//  Firebase Auth + Firestore (serverless)
//  新機能: 投稿者アイコンクリック → ユーザープロフィールページ
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
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
let currentSort      = "tried";
let unsubscribePosts = null;
let unsubscribeUserDoc = null;
let currentAvatarEmoji = "🙂";
let userBookmarks    = [];   // 現在のユーザーがブックマークした投稿ID
let userRole         = "user"; // "user" | "admin"
let userIsBlocked    = false;  // 管理者にブロックされたアカウント
let justLoggedIn     = false;  // ログイン直後だけ管理者ページへ誘導するためのフラグ
let unsubscribeCategories = null;
let searchKeyword    = "";   // キーワード検索
const openComments   = new Set(); // コメント欄を開いている投稿ID（再描画後も維持）
const commentsCache  = {};   // postId -> コメント配列（再描画時のちらつき防止）

// ── 不適切ワードのフィルタ（クライアント側の簡易チェック） ──
const NG_WORDS = [
  "死ね","しね","殺す","ころす","きもい","キモい","うざい","ウザい","ばか","バカ",
  "あほ","アホ","ぶす","ブス","でぶ","デブ","クズ","くず","ゴミ","カス","かす",
  "馬鹿","阿呆","知障","池沼","土人","エロ","セックス","ちんこ","まんこ","おっぱい",
  "fuck","shit","bitch","asshole","sex","penis","porn"
];
function containsNgWord(text) {
  const lower = String(text || "").toLowerCase();
  return NG_WORDS.find(w => lower.includes(w.toLowerCase())) || null;
}

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
  { bg: "rgba(63,81,181,0.15)",   text: "#303f9f",  border: "rgba(63,81,181,0.4)"   }, // インディゴ
  { bg: "rgba(0,150,136,0.15)",   text: "#00695c",  border: "rgba(0,150,136,0.4)"   }, // ティール
  { bg: "rgba(121,85,72,0.15)",   text: "#5d4037",  border: "rgba(121,85,72,0.4)"   }, // ブラウン
  { bg: "rgba(124,77,255,0.15)",  text: "#5e35b1",  border: "rgba(124,77,255,0.4)"  }, // バイオレット
  { bg: "rgba(0,184,148,0.15)",   text: "#00866e",  border: "rgba(0,184,148,0.4)"   }, // エメラルド
  { bg: "rgba(255,87,34,0.15)",   text: "#d84315",  border: "rgba(255,87,34,0.4)"   }, // ディープオレンジ
];

function getCatColorIndex(categoryId) {
  // 追加時に割り当てた色番号があればそれを使う（色かぶり防止）
  const cat = categories.find(c => c.id === categoryId);
  if (cat && Number.isInteger(cat.color)) return cat.color % CAT_COLORS.length;
  // デフォルトカテゴリは固定色
  if (categoryId === "housework") return 1; // 緑
  if (categoryId === "saving")    return 2; // オレンジ
  if (categoryId === "points")    return 0; // 青
  // 色未割り当ての旧データ用フォールバック（ID文字列をハッシュ）
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = categoryId.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % CAT_COLORS.length;
}

function getCatColor(categoryId) {
  return CAT_COLORS[getCatColorIndex(categoryId)];
}

// 既に使われている色番号の集合（新カテゴリに未使用色を割り当てるため）
function usedColorIndices() {
  const used = new Set();
  categories.forEach(c => used.add(getCatColorIndex(c.id)));
  return used;
}

// 未使用の色番号を1つ返す（全色使用済みなら循環）
function pickUnusedColorIndex() {
  const used = usedColorIndices();
  for (let i = 0; i < CAT_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return categories.length % CAT_COLORS.length;
}

// ── DOM 取得 ────────────────────────────────────────────────
const welcomeOverlay     = document.getElementById("welcome-overlay");
const welcomeStartBtn    = document.getElementById("welcome-start-btn");
const appContainer       = document.getElementById("app-container");

const authBtn            = document.getElementById("auth-btn");
const logoutBtn          = document.getElementById("logout-btn");
const userProfileEl      = document.getElementById("user-profile");
const userGreeting       = document.getElementById("user-greeting");

const navHomeBtn         = document.getElementById("nav-home-btn");
const navMypageBtn       = document.getElementById("nav-mypage-btn");
const navAdminBtn        = document.getElementById("nav-admin-btn");
const headerLogo         = document.getElementById("header-logo");

const homeView           = document.getElementById("home-view");
const mypageView         = document.getElementById("mypage-view");
const userProfileView    = document.getElementById("user-profile-view");
const adminView          = document.getElementById("admin-view");
const adminReportedContainer = document.getElementById("admin-reported-container");
const adminReportedCount = document.getElementById("admin-reported-count");
const adminCategoriesEl  = document.getElementById("admin-categories");

const postTriggerBtn     = document.getElementById("post-trigger-btn");
const postForm           = document.getElementById("post-form");
const postTitle          = document.getElementById("post-title");
const postContent        = document.getElementById("post-content");
const postImage          = document.getElementById("post-image");
const postImagePreview   = document.getElementById("post-image-preview");
const postImagePreviewImg= document.getElementById("post-image-preview-img");
const postImageClear     = document.getElementById("post-image-clear");
const postCategory       = document.getElementById("post-category");
const addCategoryBtn     = document.getElementById("add-category-btn");
const saveDraftBtn       = document.getElementById("save-draft-btn");
const openDraftsBtn      = document.getElementById("open-drafts-btn");
const cancelPostBtn      = document.getElementById("cancel-post-btn");
const draftSavedMsg      = document.getElementById("draft-saved-msg");

const filtersContainer   = document.getElementById("filters-container");
const sortSelect         = document.getElementById("sort-select");
const searchInput        = document.getElementById("search-input");
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

welcomeStartBtn.addEventListener("click", () => {
  hideWelcome();
  // 未ログインなら登録/ログインを促す（キャンセルすれば閲覧のみ可能）
  if (!isRegistered()) openAuthModal("register");
});

// ── Auth (メール + パスワード) ───────────────────────────────
const authModal      = document.getElementById("auth-modal");
const authForm       = document.getElementById("auth-form");
const authEmail      = document.getElementById("auth-email");
const authPassword   = document.getElementById("auth-password");
const authError      = document.getElementById("auth-error");
const authSubmitBtn  = document.getElementById("auth-submit-btn");
const authTabLogin   = document.getElementById("auth-tab-login");
const authTabRegister= document.getElementById("auth-tab-register");
const authModalDesc  = document.getElementById("auth-modal-desc");
const cancelAuthBtn  = document.getElementById("cancel-auth-btn");
const togglePasswordBtn = document.getElementById("toggle-password-btn");

// パスワードの表示/非表示切替（デフォルトは伏せ字）
togglePasswordBtn.addEventListener("click", () => {
  const show = authPassword.type === "password";
  authPassword.type = show ? "text" : "password";
  togglePasswordBtn.textContent = show ? "🙈" : "👁";
  togglePasswordBtn.setAttribute("aria-pressed", String(show));
  togglePasswordBtn.setAttribute("aria-label", show ? "パスワードを隠す" : "パスワードを表示");
  togglePasswordBtn.title = show ? "パスワードを隠す" : "パスワードを表示";
});

let authMode = "login"; // "login" | "register"

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === "login";
  authTabLogin.classList.toggle("active", isLogin);
  authTabRegister.classList.toggle("active", !isLogin);
  authSubmitBtn.textContent = isLogin ? "ログイン" : "登録する";
  authPassword.autocomplete = isLogin ? "current-password" : "new-password";
  authModalDesc.textContent = isLogin
    ? "登録済みのメールアドレスとパスワードでログインします。"
    : "メールアドレスとパスワードで無料のアカウントを作成します。";
  authError.classList.add("hidden");
}

function openAuthModal(mode = "login") {
  setAuthMode(mode);
  authForm.reset();
  // パスワードは毎回伏せ字の状態に戻す
  authPassword.type = "password";
  togglePasswordBtn.textContent = "👁";
  togglePasswordBtn.setAttribute("aria-pressed", "false");
  authError.classList.add("hidden");
  authModal.classList.remove("hidden");
  authEmail.focus();
}
function closeAuthModal() { authModal.classList.add("hidden"); }

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

// Firebase のエラーコードを日本語メッセージに変換
function authErrorMessage(code) {
  switch (code) {
    case "auth/invalid-email":          return "メールアドレスの形式が正しくありません。";
    case "auth/missing-password":
    case "auth/weak-password":          return "パスワードは6文字以上で入力してください。";
    case "auth/password-does-not-meet-requirements":
                                        return "パスワードが要件を満たしていません。数字だけでなく英字も組み合わせてください。";
    case "auth/email-already-in-use":   return "このメールアドレスは既に登録済みです。「ログイン」からお試しください。";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":         return "メールアドレスまたはパスワードが正しくありません。";
    case "auth/too-many-requests":      return "試行回数が多すぎます。しばらく待ってからお試しください。";
    default:                            return "認証に失敗しました (" + code + ")";
  }
}

authBtn.addEventListener("click", () => openAuthModal("login"));
authTabLogin.addEventListener("click", () => setAuthMode("login"));
authTabRegister.addEventListener("click", () => setAuthMode("register"));
cancelAuthBtn.addEventListener("click", closeAuthModal);
// 背景クリックでは閉じない（入力中のデータが消えるのを防ぐ）

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email    = authEmail.value.trim();
  const password = authPassword.value;
  authError.classList.add("hidden");
  authSubmitBtn.disabled = true;

  try {
    if (authMode === "register") {
      await createUserWithEmailAndPassword(auth, email, password);
      showToast("アカウントを作成しました ✅");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("ログインしました ✅");
    }
    justLoggedIn = true;   // 管理者なら直後に管理ページへ誘導
    closeAuthModal();
  } catch (err) {
    // 新規登録で「既に使用中」の場合はログインに切り替えて案内
    if (err.code === "auth/email-already-in-use" || err.code === "auth/credential-already-in-use") {
      setAuthMode("login");
      showAuthError("このメールアドレスは登録済みです。パスワードを入力してログインしてください。");
    } else {
      showAuthError(authErrorMessage(err.code));
    }
  } finally {
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  // ── 未ログイン（ゲスト）──────────────────────────────
  // 閲覧は誰でも可能。投稿・いいね・コメント・通報・保存はログイン必須。
  if (!user) {
    currentUser = null;
    userBookmarks = [];
    userRole = "user";
    userIsBlocked = false;
    if (unsubscribeUserDoc) { unsubscribeUserDoc(); unsubscribeUserDoc = null; }

    userProfileEl.classList.remove("hidden");
    authBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userGreeting.classList.add("hidden");
    userGreeting.textContent = "";
    navMypageBtn.classList.add("hidden");
    navAdminBtn.classList.add("hidden");
    if (!adminView.classList.contains("hidden")) showView("home");

    // ログアウト時は投稿フォームを閉じる（下書き中にログアウトしても投稿できないように）
    postForm.classList.add("hidden");
    postForm.reset();
    clearImagePreview();
    if (!mypageView.classList.contains("hidden")) showView("home");

    renderPosts();
    return;
  }

  // ── ログイン済み ─────────────────────────────────────
  currentUser = user;
  userProfileEl.classList.remove("hidden");

  const uSnap = await getDoc(doc(db, "users", user.uid));
  const justCreated = !uSnap.exists();
  const defaultName = "ユーザー" + user.uid.slice(0, 4);
  let nickname;
  if (justCreated) {
    nickname = user.displayName || defaultName;
    await setDoc(doc(db, "users", user.uid), {
      displayName: nickname,
      email: user.email || null,
      avatarEmoji: "🙂",
      setupDone: false,
      updatedAt: serverTimestamp()
    });
  } else {
    nickname = uSnap.data().displayName || user.displayName || defaultName;
    await setDoc(doc(db, "users", user.uid), {
      displayName: nickname,
      email: user.email || null,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  if (currentUser.displayName !== nickname) {
    try { await updateProfile(currentUser, { displayName: nickname }); } catch (_) {}
  }

  // ヘッダー: ログアウトボタンを表示（名前チップは表示しない）
  authBtn.classList.add("hidden");
  logoutBtn.classList.remove("hidden");
  userGreeting.classList.add("hidden");
  navMypageBtn.classList.remove("hidden");

  // アバター絵文字
  const savedEmoji = uSnap.exists() ? (uSnap.data().avatarEmoji || "🙂") : "🙂";
  currentAvatarEmoji = savedEmoji;
  const mypageAvatarEl = document.getElementById("mypage-avatar-display");
  if (mypageAvatarEl) mypageAvatarEl.textContent = savedEmoji;

  // ユーザードキュメント購読（ブックマーク・アバター・表示名をリアルタイム反映）
  if (unsubscribeUserDoc) unsubscribeUserDoc();
  unsubscribeUserDoc = onSnapshot(doc(db, "users", user.uid), (snap) => {
    const data = snap.data() || {};
    userBookmarks = data.bookmarks || [];
    userRole      = data.role || "user";
    userIsBlocked = data.blocked === true;
    if (data.avatarEmoji) {
      currentAvatarEmoji = data.avatarEmoji;
      if (mypageAvatarEl) mypageAvatarEl.textContent = data.avatarEmoji;
    }
    if (data.displayName) userGreeting.textContent = "👤 " + data.displayName;
    // 管理ナビは管理者のみ
    navAdminBtn.classList.toggle("hidden", userRole !== "admin");
    if (userRole !== "admin" && !adminView.classList.contains("hidden")) showView("home");
    // ログイン直後、管理者なら管理ページへ誘導
    if (justLoggedIn) {
      justLoggedIn = false;
      if (userRole === "admin") { showView("admin"); showToast("管理者としてログインしました 🛡"); }
    }
    renderPosts();
    updateMypageView();
    if (!adminView.classList.contains("hidden")) renderAdminView();
  });

  flushOfflineQueue();
  updateMypageView();

  // 新規アカウントは初回プロフィール設定を表示（2回目以降は出さない）
  if (justCreated || uSnap.data()?.setupDone === false) openSetupModal(nickname);
});

// ── ナビゲーション ──────────────────────────────────────────
// 本登録ユーザーかどうか（未ログインは不可）
function isRegistered() {
  return !!currentUser;
}
function isAdmin()   { return isRegistered() && userRole === "admin"; }
function isBlocked() { return isRegistered() && userIsBlocked; }

// ブロックされている場合に操作を弾く共通チェック
function blockedGuard() {
  if (isBlocked()) {
    showToast("このアカウントは管理者により利用を制限されています", "error");
    return true;
  }
  return false;
}

function showView(view) {
  // マイページは本登録ユーザー専用
  if (view === "mypage" && !isRegistered()) {
    showToast("マイページの利用にはログインが必要です");
    view = "home";
  }
  // 管理ページは管理者専用
  if (view === "admin" && !isAdmin()) {
    showToast("管理者専用ページです");
    view = "home";
  }

  homeView.classList.add("hidden");
  mypageView.classList.add("hidden");
  userProfileView.classList.add("hidden");
  adminView.classList.add("hidden");
  navHomeBtn.classList.remove("active");
  navMypageBtn.classList.remove("active");
  navAdminBtn.classList.remove("active");

  if (view === "home") {
    homeView.classList.remove("hidden");
    navHomeBtn.classList.add("active");
  } else if (view === "mypage") {
    mypageView.classList.remove("hidden");
    navMypageBtn.classList.add("active");
    updateMypageView();
  } else if (view === "user-profile") {
    userProfileView.classList.remove("hidden");
  } else if (view === "admin") {
    adminView.classList.remove("hidden");
    navAdminBtn.classList.add("active");
    renderAdminView();
  }
}

navHomeBtn.addEventListener("click", () => showView("home"));
navMypageBtn.addEventListener("click", () => showView("mypage"));
navAdminBtn.addEventListener("click", () => showView("admin"));
headerLogo.addEventListener("click", () => showView("home"));
backToHomeBtn.addEventListener("click", () => showView("home"));

// ── カテゴリ読み込み ─────────────────────────────────────────
function subscribeCategories() {
  const defaults = [
    { id: "housework", label: "家事" },
    { id: "saving",    label: "節約術" },
    { id: "points",    label: "ポイント運用" }
  ];
  if (unsubscribeCategories) unsubscribeCategories();
  // settings/categories をリアルタイム購読（追加したジャンルがリロード無しで反映される）
  unsubscribeCategories = onSnapshot(doc(db, "settings", "categories"), (snap) => {
    categories = (snap.exists() && Array.isArray(snap.data().list)) ? snap.data().list : defaults;
    renderCategorySelects();
    renderFilters();
    if (!adminView.classList.contains("hidden")) renderAdminView();
  }, () => {
    categories = defaults;
    renderCategorySelects();
    renderFilters();
  });
}

function renderCategorySelects() {
  [postCategory, editPostCategory].forEach(sel => {
    sel.innerHTML = categories.map(c =>
      `<option value="${c.id}">${c.label}</option>`
    ).join("");
  });
}

function renderFilters() {
  // 投稿が1件以上あるジャンルだけ表示（通報非表示・未投稿のジャンルは出さない）
  const usedCats = new Set(allPosts.filter(p => !p.hidden).map(p => p.category));
  const visible  = categories.filter(c => usedCats.has(c.id));
  // 選択中ジャンルの投稿が無くなったら「すべて」に戻す
  if (activeCategory !== "all" && !usedCats.has(activeCategory)) {
    activeCategory = "all";
  }

  // 各ジャンルボタンを、投稿カードのカテゴリタグと同じ色で表示する
  filtersContainer.innerHTML =
    `<button class="filter-btn ${activeCategory === "all" ? "active" : ""}" data-cat="all">すべて</button>` +
    visible.map(c => {
      const col      = getCatColor(c.id);
      const isActive = activeCategory === c.id;
      // 選択中は塗りつぶし、未選択は投稿タグと同じ淡色
      const style = isActive
        ? `background:${col.text};color:#fff;border-color:${col.text};`
        : `background:${col.bg};color:${col.text};border-color:${col.border};`;
      return `<button class="filter-btn ${isActive ? "active" : ""}" data-cat="${c.id}" style="${style}">${escHtml(c.label)}</button>`;
    }).join("");

  filtersContainer.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderFilters();
      renderPosts();
    });
  });
}

addCategoryBtn.addEventListener("click", async () => {
  if (!isRegistered()) { showToast("ログインが必要です"); openAuthModal("login"); return; }
  const input = prompt("新しいジャンル名（10文字以内）:");
  if (input === null) return;                 // キャンセル
  const label = input.trim();
  if (!label) { showToast("ジャンル名を入力してください", "error"); return; }
  if (label.length > 10) { showToast("ジャンル名は10文字以内にしてください", "error"); return; }
  const ng = containsNgWord(label);
  if (ng) { showToast("不適切な語句が含まれています", "error"); return; }
  // 同名がある場合は追加せず、その既存ジャンルを選択状態にする
  const existing = categories.find(c => c.label === label);
  if (existing) { postCategory.value = existing.id; showToast("同じ名前のジャンルが既にあります"); return; }

  const id = "cat_" + Date.now();
  // 既存ジャンルと色がかぶらないよう、未使用の色番号を割り当てる
  const next = [...categories, { id, label, color: pickUnusedColorIndex() }];
  try {
    await setDoc(doc(db, "settings", "categories"), { list: next });
    // 購読でも更新されるが、すぐ選択できるよう手動でも反映
    categories = next;
    renderCategorySelects();
    postCategory.value = id;
    showToast("ジャンル「" + label + "」を追加しました ✅");
  } catch {
    showToast("ジャンルの追加に失敗しました", "error");
  }
});

// ── 投稿フォーム ─────────────────────────────────────────────
function openPostForm() {
  // 投稿は本登録ユーザーのみ。ゲストはログインを促す
  if (!isRegistered()) {
    showToast("投稿するにはログインが必要です");
    openAuthModal("login");
    return;
  }
  if (blockedGuard()) return;
  postForm.classList.remove("hidden");
  postTitle.focus();
}
postTriggerBtn.addEventListener("click", openPostForm);
cancelPostBtn.addEventListener("click", () => {
  postForm.classList.add("hidden");
  postForm.reset();
  clearImagePreview();
});

// ── 画像プレビュー ──
function clearImagePreview() {
  if (postImage) postImage.value = "";
  if (postImagePreview) postImagePreview.classList.add("hidden");
  if (postImagePreviewImg) postImagePreviewImg.src = "";
}
postImage.addEventListener("change", () => {
  const file = postImage.files[0];
  if (!file) { clearImagePreview(); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    postImagePreviewImg.src = e.target.result;
    postImagePreview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});
postImageClear.addEventListener("click", clearImagePreview);

// ── 下書き（複数保存） ──────────────────────────────────────
const DRAFTS_KEY = "lifetips_drafts";
const draftsModal   = document.getElementById("drafts-modal");
const draftsListEl  = document.getElementById("drafts-list");
const closeDraftsBtn= document.getElementById("close-drafts-btn");

function getDrafts() {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]"); }
  catch { return []; }
}
function saveDrafts(list) { localStorage.setItem(DRAFTS_KEY, JSON.stringify(list)); }

saveDraftBtn.addEventListener("click", () => {
  const title = postTitle.value.trim();
  const content = postContent.value.trim();
  if (!title && !content) { showToast("下書きする内容がありません", "error"); return; }
  const drafts = getDrafts();
  drafts.unshift({ id: "d" + Date.now(), title, content, category: postCategory.value, savedAt: Date.now() });
  saveDrafts(drafts);
  draftSavedMsg.classList.remove("hidden");
  setTimeout(() => draftSavedMsg.classList.add("hidden"), 2000);
});

function loadDraftIntoForm(d) {
  postTitle.value = d.title || "";
  postContent.value = d.content || "";
  if (d.category && categories.some(c => c.id === d.category)) postCategory.value = d.category;
  postForm.classList.remove("hidden");
}

function renderDraftsList() {
  const drafts = getDrafts();
  draftsListEl.innerHTML = drafts.length
    ? drafts.map(d => {
        const date = new Date(d.savedAt).toLocaleString("ja-JP", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
        const title = d.title || "(無題)";
        const body  = d.content || "";
        return `<div class="draft-item">
          <div class="draft-item-main" data-id="${d.id}">
            <div class="draft-item-title">${escHtml(title)}</div>
            <div class="draft-item-meta">${escHtml(body.slice(0,30))}${body.length>30?"…":""} ・ ${date}</div>
          </div>
          <button class="draft-delete-btn" data-id="${d.id}" title="削除">🗑</button>
        </div>`;
      }).join("")
    : `<p class="drafts-empty">保存した下書きはありません</p>`;

  draftsListEl.querySelectorAll(".draft-item-main").forEach(el => {
    el.addEventListener("click", () => {
      const d = getDrafts().find(x => x.id === el.dataset.id);
      if (d) { loadDraftIntoForm(d); closeDraftsModal(); showToast("下書きを読み込みました"); }
    });
  });
  draftsListEl.querySelectorAll(".draft-delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveDrafts(getDrafts().filter(x => x.id !== btn.dataset.id));
      renderDraftsList();
    });
  });
}
function openDraftsModal() { renderDraftsList(); draftsModal.classList.remove("hidden"); }
function closeDraftsModal() { draftsModal.classList.add("hidden"); }
openDraftsBtn.addEventListener("click", () => {
  if (!isRegistered()) { showToast("ログインが必要です"); return; }
  openDraftsModal();
});
closeDraftsBtn.addEventListener("click", closeDraftsModal);
draftsModal.addEventListener("click", (e) => { if (e.target === draftsModal) closeDraftsModal(); });

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
  if (!isRegistered()) { showToast("投稿するにはログインが必要です"); openAuthModal("login"); return; }
  if (blockedGuard()) return;

  // 不適切ワードのチェック
  const ng = containsNgWord(postTitle.value) || containsNgWord(postContent.value);
  if (ng) { showToast("不適切な語句が含まれているため投稿できません", "error"); return; }

  const file = postImage.files[0];
  if (file && file.size > 3 * 1024 * 1024) {
    showToast("画像は3MB以下にしてください", "error"); return;
  }

  const imageData = file ? await compressImage(file) : null;

  const postData = {
    title:             postTitle.value.trim(),
    content:           postContent.value.trim(),
    category:          postCategory.value,
    author:            currentUser.displayName || currentUser.email || "名無しさん",
    authorId:          currentUser.uid,
    authorAvatarEmoji: currentAvatarEmoji,
    image:             imageData,
    triedBy:           [],
    effectiveBy:       []
  };

  if (!navigator.onLine) {
    // オフライン時はローカルに保存
    const queue = getOfflineQueue();
    queue.push({ ...postData, _savedAt: Date.now() });
    saveOfflineQueue(queue);
    postForm.reset();
    postForm.classList.add("hidden");
    clearImagePreview();
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
    clearImagePreview();
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
    renderFilters();   // 投稿の有無に応じてジャンルの表示を更新
    renderPosts();
    updateMypageView();
    if (!adminView.classList.contains("hidden")) renderAdminView();
  });
}

sortSelect.addEventListener("change", (e) => {
  currentSort = e.target.value;
  renderPosts();
});

searchInput.addEventListener("input", (e) => {
  searchKeyword = e.target.value.trim();
  renderPosts();
});

function renderPosts() {
  // 通報により非表示になった投稿は公開掲示板に出さない（管理者ページへ）
  const visible = allPosts.filter(p => !p.hidden);
  let posts = activeCategory === "all"
    ? [...visible]
    : visible.filter(p => p.category === activeCategory);

  // キーワード検索（タイトル・本文）
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase();
    posts = posts.filter(p =>
      (p.title || "").toLowerCase().includes(kw) ||
      (p.content || "").toLowerCase().includes(kw)
    );
  }

  if (currentSort === "tried") {
    // 試した順 = 試した人数（同数なら効果あり数）
    posts.sort((a, b) =>
      (b.triedBy?.length || 0) - (a.triedBy?.length || 0) ||
      (b.effectiveBy?.length || 0) - (a.effectiveBy?.length || 0)
    );
  }

  postsContainer.innerHTML = posts.length
    ? posts.map(p => buildPostCard(p, false)).join("")
    : `<p style="text-align:center;color:var(--text-muted);padding:2rem;">${searchKeyword ? "該当する投稿が見つかりませんでした" : "まだ投稿がありません"}</p>`;

  attachPostEvents(postsContainer, false);
}

// 効果あり率を小さなドーナツ円グラフで表示（緑=効果あり / グレー=イマイチ）
function effectDonutHtml(rate, effectiveCount, triedCount) {
  const iffy = triedCount - effectiveCount;
  return `
  <span class="effect-donut" title="効果あり ${rate}%（効果あり ${effectiveCount}人 / イマイチ ${iffy}人 / 計 ${triedCount}人）">
    <svg viewBox="0 0 36 36" width="40" height="40" role="img" aria-label="効果あり ${rate}%">
      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#e3e8f0" stroke-width="4"></circle>
      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#34a853" stroke-width="4"
        stroke-dasharray="${rate} ${100 - rate}" stroke-dashoffset="25" stroke-linecap="round"></circle>
      <text x="18" y="20.5" text-anchor="middle" font-size="9" font-weight="700" fill="#1e7e40">${rate}%</text>
    </svg>
    <span class="effect-donut-label">効果</span>
  </span>`;
}

function buildPostCard(post, isOwner) {
  const catLabel  = categories.find(c => c.id === post.category)?.label || post.category;
  const isBookmarked = currentUser && userBookmarks.includes(post.id);
  const isAuthor  = currentUser && post.authorId === currentUser.uid;
  // 「試した！」実証データ（配列ベース・解除可能）
  const triedBy        = post.triedBy || [];
  const effectiveBy    = post.effectiveBy || [];
  const hasTried       = currentUser && triedBy.includes(currentUser.uid);
  const triedCount     = triedBy.length;
  const effectiveCount = effectiveBy.length;
  const effectRate     = triedCount ? Math.round(effectiveCount / triedCount * 100) : 0;
  const isPopular = triedCount >= 3;
  const isReported = getReportedPosts().includes(post.id);
  const date      = post.updatedAt?.toDate
    ? post.updatedAt.toDate().toLocaleDateString("ja-JP")
    : "";
  // アバター絵文字（Googleアカウント画像は使わない）
  const emoji  = post.authorAvatarEmoji || "🙂";
  const avatar = `<span class="author-avatar author-avatar-text" data-author-id="${post.authorId}" data-author-name="${escHtml(post.author)}" title="${escHtml(post.author)}のページを見る">${emoji}</span>`;
  // カテゴリ色
  const catColor = getCatColor(post.category);

  return `
  <article class="post-card glass-panel ${isReported ? "reported" : ""}" data-id="${post.id}">
    <div class="post-card-header">
      <div class="post-author-info">
        ${avatar}
        <div>
          <span class="post-author-name">${escHtml(post.author)}</span>
          <span class="post-date">${date}</span>
        </div>
      </div>
      <div class="post-meta-right">
        ${(!post.hidden && triedCount) ? effectDonutHtml(effectRate, effectiveCount, triedCount) : ""}
        ${post.hidden ? `<span class="hidden-badge">🚩 非表示中（通報）</span>` : ""}
        ${isPopular ? `<span class="popular-badge">★ 人気</span>` : ""}
        <span class="post-category-tag" style="background:${catColor.bg};color:${catColor.text};border-color:${catColor.border};">${escHtml(catLabel)}</span>
      </div>
    </div>
    <h3 class="post-title">${escHtml(post.title)}</h3>
    <p class="post-content">${escHtml(post.content)}</p>
    ${post.image ? `<img src="${post.image}" class="post-image" loading="lazy" />` : ""}
    <div class="post-footer">
      ${post.hidden ? "" : `
      <button class="tried-btn ${hasTried ? "tried" : ""}" data-id="${post.id}" ${!currentUser ? "disabled" : ""} title="${!currentUser ? "ログインすると報告できます" : (hasTried ? "クリックで取り消し" : "試した！")}" aria-pressed="${hasTried}">
        🙌 ${hasTried ? "試した✓" : "試した"} ${triedCount}
      </button>
      <button class="comment-toggle-btn" data-id="${post.id}" title="コメントを見る">
        💬 ${post.commentCount || 0}
      </button>
      <button class="bookmark-btn ${isBookmarked ? "bookmarked" : ""}" data-id="${post.id}" title="${isBookmarked ? "ブックマーク済み" : "ブックマークに保存"}" aria-pressed="${isBookmarked}">
        ${isBookmarked ? "🔖 保存済み" : "🔖 保存"}
      </button>`}
      ${isAuthor ? `
        <button class="edit-btn secondary-btn small-btn" data-id="${post.id}">編集</button>
        <button class="delete-btn secondary-btn small-btn danger icon-only" data-id="${post.id}" title="削除">🗑</button>
      ` : (post.hidden ? "" : (isReported ? `
        <button class="report-btn reported" disabled title="通報済み">🚩 通報済み</button>
      ` : `
        <button class="report-btn" data-id="${post.id}" data-title="${escHtml(post.title)}" data-author="${escHtml(post.authorId || "")}" title="この投稿を通報する">🚩 通報</button>
      `))}
    </div>
    ${(!post.hidden && triedCount) ? `<div class="tried-stats"><span>✅ ${effectRate}%が効果あり（${triedCount}人中${effectiveCount}人）</span></div>` : ""}
    ${post.hidden ? `<p class="hidden-note">この投稿は通報により非表示中です。反応・コメントはできません。</p>` : `
    <div class="comments-wrap ${openComments.has(post.id) ? "" : "hidden"}" data-comments-for="${post.id}">
      <div class="comments-list">${commentsListInnerHtml(post.id)}</div>
      ${currentUser ? `
        <form class="comment-form" data-id="${post.id}">
          <span class="comment-form-avatar">${currentAvatarEmoji}</span>
          <input type="text" class="comment-input" placeholder="コメントを追加…" maxlength="500" required />
          <button type="submit" class="primary-btn small-btn">送信</button>
        </form>` : `
        <p class="comment-login-hint">コメントするにはログインが必要です</p>`}
    </div>`}
  </article>`;
}

function attachPostEvents(container, isMyPage) {
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
      // 既存画像をプレビュー表示
      editPostImage.value = "";
      if (post.image) {
        editImagePreviewImg.src = post.image;
        editImagePreview.classList.remove("hidden");
      } else {
        editImagePreview.classList.add("hidden");
        editImagePreviewImg.src = "";
      }
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

  // ── ブックマーク ──
  container.querySelectorAll(".bookmark-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!isRegistered()) { showToast("保存するにはログインが必要です"); openAuthModal("login"); return; }
      const id     = btn.dataset.id;
      const saved  = userBookmarks.includes(id);
      try {
        await setDoc(doc(db, "users", currentUser.uid), {
          bookmarks: saved ? arrayRemove(id) : arrayUnion(id)
        }, { merge: true });
        showToast(saved ? "ブックマークを解除しました" : "ブックマークに保存しました 🔖");
      } catch {
        showToast("保存に失敗しました", "error");
      }
    });
  });

  // ── 試した！（トグル: 未報告→モーダル / 報告済み→解除。ログアウト中は無効） ──
  container.querySelectorAll(".tried-btn").forEach(btn => {
    if (btn.disabled) return; // 未ログインは変更不可
    btn.addEventListener("click", async () => {
      if (!isRegistered()) { showToast("「試した！」にはログインが必要です"); openAuthModal("login"); return; }
      if (blockedGuard()) return;
      const id = btn.dataset.id;
      const post = allPosts.find(p => p.id === id);
      if (!post) return;
      if (post.triedBy?.includes(currentUser.uid)) {
        // 解除
        try {
          await updateDoc(doc(db, "posts", id), {
            triedBy:     arrayRemove(currentUser.uid),
            effectiveBy: arrayRemove(currentUser.uid)
          });
          showToast("「試した」を取り消しました");
        } catch { showToast("操作に失敗しました", "error"); }
      } else {
        openTriedModal(id, post.title || "");
      }
    });
  });

  // ── 通報 ──
  container.querySelectorAll(".report-btn").forEach(btn => {
    if (btn.disabled) return; // 通報済み
    btn.addEventListener("click", () => {
      if (!isRegistered()) { showToast("通報するにはログインが必要です"); openAuthModal("login"); return; }
      openReportModal(btn.dataset.id, btn.dataset.title, btn.dataset.author);
    });
  });

  // ── コメント欄の開閉 ──
  container.querySelectorAll(".comment-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id   = btn.dataset.id;
      const wrap = container.querySelector(`.comments-wrap[data-comments-for="${id}"]`);
      if (!wrap) return;
      const willOpen = wrap.classList.contains("hidden");
      wrap.classList.toggle("hidden");
      if (willOpen) { openComments.add(id); loadComments(id, wrap); }
      else          { openComments.delete(id); }
    });
  });

  // すでに開いているコメント欄: キャッシュがあれば即描画（ちらつき防止）、無ければ取得
  container.querySelectorAll(".comments-wrap:not(.hidden)").forEach(wrap => {
    const id = wrap.dataset.commentsFor;
    if (commentsCache[id]) renderComments(wrap, id);
    else loadComments(id, wrap);
  });

  // ── コメント投稿 ──
  container.querySelectorAll(".comment-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isRegistered()) { showToast("コメントするにはログインが必要です"); openAuthModal("login"); return; }
      if (blockedGuard()) return;
      const id    = form.dataset.id;
      const input = form.querySelector(".comment-input");
      const text  = input.value.trim();
      if (!text) return;
      const ng = containsNgWord(text);
      if (ng) { showToast("不適切な語句が含まれています", "error"); return; }
      input.value = "";
      try {
        await addDoc(collection(db, "posts", id, "comments"), {
          text,
          author:            currentUser.displayName || currentUser.email || "名無しさん",
          authorId:          currentUser.uid,
          authorAvatarEmoji: currentAvatarEmoji,
          createdAt:         serverTimestamp()
        });
        await updateDoc(doc(db, "posts", id), { commentCount: increment(1) });
        const wrap = container.querySelector(`.comments-wrap[data-comments-for="${id}"]`);
        if (wrap) loadComments(id, wrap);
      } catch {
        showToast("コメントの送信に失敗しました", "error");
        input.value = text;
      }
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

  // 投稿者のアバター絵文字を表示（投稿カードのアイコンと一致させる）
  try {
    const uSnap = await getDoc(doc(db, "users", authorId));
    if (uSnap.exists() && uSnap.data().avatarEmoji) {
      profileViewAvatar.textContent = uSnap.data().avatarEmoji;
    }
  } catch(_) {}

  // その人の投稿を取得
  const q = query(
    collection(db, "posts"),
    where("authorId", "==", authorId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  const posts = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.hidden);

  const totalTried = posts.reduce((sum, p) => sum + (p.triedBy?.length || 0), 0);
  profileViewCount.textContent = `${posts.length} 📝`;
  profileViewLikes.textContent = `${totalTried} 🙌`;

  userPostsContainer.innerHTML = posts.length
    ? posts.map(p => buildPostCard(p, false)).join("")
    : `<p style="text-align:center;color:var(--text-muted);padding:2rem;">まだ投稿がありません</p>`;

  attachPostEvents(userPostsContainer, false);
}

// ── コメント描画（キャッシュ利用でちらつき防止） ──────────────
function commentItemHtml(c, postId) {
  const emoji  = c.authorAvatarEmoji || "🙂";
  const date   = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString("ja-JP") : "";
  const canDel = currentUser && c.authorId === currentUser.uid;
  return `
  <div class="comment-item">
    <span class="comment-avatar">${emoji}</span>
    <div class="comment-body">
      <div class="comment-meta">
        <span class="comment-author">${escHtml(c.author)}</span>
        <span class="comment-date">${date}</span>
      </div>
      <p class="comment-text">${escHtml(c.text)}</p>
    </div>
    ${canDel ? `<button class="comment-delete-btn" data-post="${postId}" data-comment="${c.id}" title="削除">✕</button>` : ""}
  </div>`;
}

function commentsListInnerHtml(postId) {
  const comments = commentsCache[postId];
  if (!comments) return `<p class="comments-loading">読み込み中…</p>`;
  return comments.length
    ? comments.map(c => commentItemHtml(c, postId)).join("")
    : `<p class="comments-empty">まだコメントはありません。最初のコメントを書いてみましょう！</p>`;
}

function attachCommentDeleteHandlers(listEl) {
  listEl.querySelectorAll(".comment-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("このコメントを削除しますか？")) return;
      const pid = btn.dataset.post, cid = btn.dataset.comment;
      try {
        await deleteDoc(doc(db, "posts", pid, "comments", cid));
        await updateDoc(doc(db, "posts", pid), { commentCount: increment(-1) });
        if (commentsCache[pid]) commentsCache[pid] = commentsCache[pid].filter(c => c.id !== cid);
        const wrap = document.querySelector(`.comments-wrap[data-comments-for="${pid}"]`);
        if (wrap) renderComments(wrap, pid);
      } catch {
        showToast("削除に失敗しました", "error");
      }
    });
  });
}

// キャッシュの内容で即座に描画（ネットワーク待ちが無いのでちらつかない）
function renderComments(wrap, postId) {
  const listEl = wrap.querySelector(".comments-list");
  if (!listEl) return;
  listEl.innerHTML = commentsListInnerHtml(postId);
  attachCommentDeleteHandlers(listEl);
}

// サーバーから取得してキャッシュを更新 → 再描画
async function loadComments(postId, wrap) {
  try {
    const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    commentsCache[postId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderComments(wrap, postId);
  } catch {
    const listEl = wrap.querySelector(".comments-list");
    if (listEl && !commentsCache[postId]) listEl.innerHTML = `<p class="comments-empty">コメントを読み込めませんでした</p>`;
  }
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
    // Firestoreに保存し、自分の投稿のアイコンも揃える
    if (currentUser) {
      await setDoc(doc(db, "users", currentUser.uid), { avatarEmoji: emoji }, { merge: true });
      await syncAuthorInfoToPosts();
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

// 表示名・アバターを自分の投稿にも反映（リロード不要で同期）
async function syncAuthorInfoToPosts() {
  if (!currentUser) return;
  const name  = currentUser.displayName || "名無しさん";
  const emoji = currentAvatarEmoji;
  try {
    const q = query(collection(db, "posts"), where("authorId", "==", currentUser.uid));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { author: name, authorAvatarEmoji: emoji })));
  } catch (_) {}
}

// ── マイページ ───────────────────────────────────────────────
function updateMypageView() {
  if (!currentUser) return;
  mypageNameText.textContent = currentUser.displayName || currentUser.email || "名無しさん";
  const myPosts    = allPosts.filter(p => p.authorId === currentUser.uid);
  const myTried    = myPosts.reduce((sum, p) => sum + (p.triedBy?.length || 0), 0);
  totalLikesEl.textContent = `${myTried} 🙌`;
  myPostsContainer.innerHTML = myPosts.length
    ? myPosts.map(p => buildPostCard(p, true)).join("")
    : `<p style="text-align:center;color:var(--text-muted);padding:2rem;">まだ投稿がありません</p>`;
  attachPostEvents(myPostsContainer, true);

  // ブックマーク一覧
  const bookmarksContainer = document.getElementById("bookmarks-container");
  if (bookmarksContainer) {
    // userBookmarks の順序（保存順）を保ちつつ、現存する投稿のみ表示
    const bookmarked = userBookmarks
      .map(id => allPosts.find(p => p.id === id))
      .filter(Boolean);
    bookmarksContainer.innerHTML = bookmarked.length
      ? bookmarked.map(p => buildPostCard(p, p.authorId === currentUser.uid)).join("")
      : `<p style="text-align:center;color:var(--text-muted);padding:2rem;">まだブックマークがありません。気になる投稿の「🔖 保存」をタップしてみましょう。</p>`;
    attachPostEvents(bookmarksContainer, false);
  }
}

editNameBtn.addEventListener("click", async () => {
  if (!isRegistered()) { showToast("ログインが必要です"); return; }
  const input = prompt("新しい表示名（20文字以内）:", currentUser.displayName || "");
  if (input === null) return;
  const newName = input.trim();
  if (!newName) { showToast("表示名を入力してください", "error"); return; }
  if (newName.length > 20) { showToast("表示名は20文字以内にしてください", "error"); return; }
  if (containsNgWord(newName)) { showToast("不適切な語句が含まれています", "error"); return; }
  await updateDoc(doc(db, "users", currentUser.uid), { displayName: newName });
  await updateProfile(currentUser, { displayName: newName });
  userGreeting.textContent = "👤 " + newName;
  await syncAuthorInfoToPosts();   // 投稿の表示名も揃える
  updateMypageView();
  showToast("表示名を更新しました ✅");
});

// ── 管理者ページ ─────────────────────────────────────────────
function renderAdminView() {
  if (!isAdmin()) return;

  // 通報により非表示になった投稿
  const reported = allPosts.filter(p => p.hidden);
  adminReportedCount.textContent = reported.length;
  adminReportedContainer.innerHTML = reported.length
    ? reported.map(p => {
        const emoji  = p.authorAvatarEmoji || "🙂";
        const reason = p.reportReason
          ? `<div class="admin-report-reason">通報理由: ${escHtml(p.reportReason)}${p.reportDetail ? "（" + escHtml(p.reportDetail) + "）" : ""}</div>`
          : "";
        return `
        <article class="post-card glass-panel" data-id="${p.id}">
          <div class="post-card-header">
            <div class="post-author-info">
              <span class="author-avatar author-avatar-text">${emoji}</span>
              <div><span class="post-author-name">${escHtml(p.author)}</span></div>
            </div>
          </div>
          ${reason}
          <h3 class="post-title">${escHtml(p.title)}</h3>
          <p class="post-content">${escHtml(p.content)}</p>
          ${p.image ? `<img src="${p.image}" class="post-image" loading="lazy" />` : ""}
          <div class="admin-actions">
            <button class="secondary-btn small-btn admin-restore" data-id="${p.id}">↩ 公開に戻す</button>
            <button class="secondary-btn small-btn danger admin-delete" data-id="${p.id}">🗑 投稿を削除</button>
            <button class="secondary-btn small-btn danger admin-block" data-author="${escHtml(p.authorId || "")}">🚫 投稿者をブロック</button>
          </div>
        </article>`;
      }).join("")
    : `<p class="admin-empty">通報された投稿はありません 🎉</p>`;

  adminReportedContainer.querySelectorAll(".admin-restore").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "posts", btn.dataset.id), { hidden: false });
        showToast("投稿を公開に戻しました");
      } catch { showToast("操作に失敗しました", "error"); }
    });
  });
  adminReportedContainer.querySelectorAll(".admin-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("この投稿を完全に削除しますか？")) return;
      try {
        await deleteDoc(doc(db, "posts", btn.dataset.id));
        showToast("投稿を削除しました");
      } catch { showToast("削除に失敗しました", "error"); }
    });
  });
  adminReportedContainer.querySelectorAll(".admin-block").forEach(btn => {
    btn.addEventListener("click", async () => {
      const authorId = btn.dataset.author;
      if (!authorId) { showToast("投稿者を特定できません", "error"); return; }
      if (!confirm("この投稿者をブロックしますか？（投稿・コメント・いいねができなくなります）")) return;
      try {
        await setDoc(doc(db, "users", authorId), { blocked: true }, { merge: true });
        showToast("アカウントをブロックしました");
      } catch { showToast("ブロックに失敗しました", "error"); }
    });
  });

  // カテゴリ管理（名前変更・削除）
  adminCategoriesEl.innerHTML = categories.length
    ? categories.map(c => `
      <div class="admin-cat-row">
        <span class="admin-cat-name" style="color:${getCatColor(c.id).text}">${escHtml(c.label)}</span>
        <button class="secondary-btn small-btn admin-cat-rename" data-id="${c.id}">名前変更</button>
        <button class="secondary-btn small-btn danger admin-cat-delete" data-id="${c.id}">削除</button>
      </div>`).join("")
    : `<p class="admin-empty">カテゴリがありません</p>`;

  adminCategoriesEl.querySelectorAll(".admin-cat-rename").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cat = categories.find(c => c.id === btn.dataset.id);
      if (!cat) return;
      const input = prompt("新しいジャンル名（10文字以内）:", cat.label);
      if (input === null) return;
      const label = input.trim();
      if (!label) { showToast("名前を入力してください", "error"); return; }
      if (label.length > 10) { showToast("10文字以内にしてください", "error"); return; }
      if (containsNgWord(label)) { showToast("不適切な語句が含まれています", "error"); return; }
      const next = categories.map(c => c.id === cat.id ? { ...c, label } : c);
      try { await setDoc(doc(db, "settings", "categories"), { list: next }); showToast("ジャンル名を変更しました ✅"); }
      catch { showToast("変更に失敗しました", "error"); }
    });
  });
  adminCategoriesEl.querySelectorAll(".admin-cat-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cat = categories.find(c => c.id === btn.dataset.id);
      if (!cat) return;
      if (!confirm(`ジャンル「${cat.label}」を削除しますか？`)) return;
      const next = categories.filter(c => c.id !== cat.id);
      try { await setDoc(doc(db, "settings", "categories"), { list: next }); showToast("ジャンルを削除しました"); }
      catch { showToast("削除に失敗しました", "error"); }
    });
  });
}

// ── 編集モーダル ─────────────────────────────────────────────
const editImagePreview    = document.getElementById("edit-image-preview");
const editImagePreviewImg = document.getElementById("edit-image-preview-img");

editPostImage.addEventListener("change", () => {
  const file = editPostImage.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    editImagePreviewImg.src = e.target.result;
    editImagePreview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

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

  const ng = containsNgWord(editPostTitle.value) || containsNgWord(editPostContent.value);
  if (ng) { showToast("不適切な語句が含まれているため更新できません", "error"); return; }

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

// ── 通報モーダル ─────────────────────────────────────────────
const reportModal     = document.getElementById("report-modal");
const reportForm      = document.getElementById("report-form");
const reportPostId    = document.getElementById("report-post-id");
const reportTargetEl  = document.getElementById("report-target");
const reportReason    = document.getElementById("report-reason");
const reportDetail    = document.getElementById("report-detail");
const cancelReportBtn = document.getElementById("cancel-report-btn");

let reportAuthorId = "";
const REPORTED_KEY = "lifetips_reported_posts"; // 多重通報の簡易抑止（端末内）

function getReportedPosts() {
  try { return JSON.parse(localStorage.getItem(REPORTED_KEY) || "[]"); }
  catch { return []; }
}

function openReportModal(postId, postTitle, authorId) {
  if (getReportedPosts().includes(postId)) {
    showToast("この投稿は既に通報済みです");
    return;
  }
  reportPostId.value = postId;
  reportAuthorId = authorId || "";
  reportTargetEl.textContent = `対象: 「${postTitle || ""}」`;
  reportForm.reset();
  reportModal.classList.remove("hidden");
}
function closeReportModal() { reportModal.classList.add("hidden"); }

cancelReportBtn.addEventListener("click", closeReportModal);
reportModal.addEventListener("click", (e) => { if (e.target === reportModal) closeReportModal(); });

reportForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) { showToast("ログインが必要です"); return; }
  if (blockedGuard()) return;
  const postId = reportPostId.value;
  try {
    await addDoc(collection(db, "reports"), {
      postId,
      postAuthorId: reportAuthorId || null,
      reason:       reportReason.value,
      detail:       reportDetail.value.trim(),
      reportedBy:   currentUser.uid,
      reportedByName: currentUser.displayName || currentUser.email || "名無しさん",
      status:       "open",
      createdAt:    serverTimestamp()
    });
    // 通報された投稿は公開掲示板から外し、管理者ページへ移動する
    await updateDoc(doc(db, "posts", postId), {
      hidden:       true,
      reportReason: reportReason.value,
      reportDetail: reportDetail.value.trim() || null,
      reportedAt:   serverTimestamp()
    });
    const reported = getReportedPosts();
    reported.push(postId);
    localStorage.setItem(REPORTED_KEY, JSON.stringify(reported));
    closeReportModal();
    showToast("通報を受け付けました。管理者が確認します 🙏");
  } catch {
    showToast("通報の送信に失敗しました", "error");
  }
});

// ── 「試した！」モーダル ──────────────────────────────────────
const triedModal     = document.getElementById("tried-modal");
const triedForm      = document.getElementById("tried-form");
const triedPostId    = document.getElementById("tried-post-id");
const triedTarget    = document.getElementById("tried-target");
const cancelTriedBtn = document.getElementById("cancel-tried-btn");
let triedEffect = 1; // 1=効果あり, 0=イマイチ

triedModal.querySelectorAll(".tried-effect-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    triedEffect = Number(btn.dataset.effect);
    triedModal.querySelectorAll(".tried-effect-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

function openTriedModal(postId, title) {
  triedPostId.value = postId;
  triedTarget.textContent = `対象: 「${title || ""}」`;
  triedEffect = 1;
  triedModal.querySelectorAll(".tried-effect-btn").forEach(b => b.classList.toggle("active", Number(b.dataset.effect) === 1));
  triedModal.classList.remove("hidden");
}
function closeTriedModal() { triedModal.classList.add("hidden"); }
cancelTriedBtn.addEventListener("click", closeTriedModal);
triedModal.addEventListener("click", (e) => { if (e.target === triedModal) closeTriedModal(); });

triedForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isRegistered()) { showToast("ログインが必要です"); return; }
  if (blockedGuard()) return;
  const id = triedPostId.value;
  const post = allPosts.find(p => p.id === id);
  if (!post) { closeTriedModal(); return; }
  if (post.triedBy?.includes(currentUser.uid)) { closeTriedModal(); showToast("すでに報告済みです"); return; }
  try {
    await updateDoc(doc(db, "posts", id), {
      triedBy:     arrayUnion(currentUser.uid),
      effectiveBy: triedEffect ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid)
    });
    closeTriedModal();
    showToast("実践報告ありがとうございます！🙌");
  } catch {
    showToast("報告の送信に失敗しました", "error");
  }
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

// ── 初回プロフィール設定 ─────────────────────────────────────
const setupModal      = document.getElementById("setup-modal");
const setupForm       = document.getElementById("setup-form");
const setupName       = document.getElementById("setup-name");
const setupAvatarGrid = document.getElementById("setup-avatar-grid");
let setupSelectedEmoji = "🙂";

// 初回設定用のアイコングリッドを生成
AVATAR_EMOJIS.forEach(emoji => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "avatar-option";
  btn.textContent = emoji;
  btn.addEventListener("click", () => {
    setupSelectedEmoji = emoji;
    setupAvatarGrid.querySelectorAll(".avatar-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
  setupAvatarGrid.appendChild(btn);
});

function openSetupModal(currentName) {
  setupName.value = currentName && !/^ユーザー/.test(currentName) ? currentName : "";
  setupSelectedEmoji = currentAvatarEmoji || "🙂";
  setupAvatarGrid.querySelectorAll(".avatar-option").forEach(b => {
    b.classList.toggle("selected", b.textContent === setupSelectedEmoji);
  });
  setupModal.classList.remove("hidden");
  setupName.focus();
}

setupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  const name = setupName.value.trim();
  if (!name) { showToast("表示名を入力してください", "error"); return; }
  if (name.length > 20) { showToast("表示名は20文字以内にしてください", "error"); return; }
  if (containsNgWord(name)) { showToast("不適切な語句が含まれています", "error"); return; }
  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      displayName: name,
      avatarEmoji: setupSelectedEmoji,
      setupDone: true,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await updateProfile(currentUser, { displayName: name });
    currentAvatarEmoji = setupSelectedEmoji;
    userGreeting.textContent = "👤 " + name;
    const mypageAvatarEl = document.getElementById("mypage-avatar-display");
    if (mypageAvatarEl) mypageAvatarEl.textContent = setupSelectedEmoji;
    await syncAuthorInfoToPosts();
    setupModal.classList.add("hidden");
    updateMypageView();
    showToast("プロフィールを設定しました ✅");
  } catch {
    showToast("設定の保存に失敗しました", "error");
  }
});

// ── 折りたたみセクション（マイページ） ──────────────────────
function initCollapsibles() {
  document.querySelectorAll(".collapsible-header").forEach(header => {
    header.addEventListener("click", () => {
      const target = document.getElementById(header.dataset.target);
      if (!target) return;
      const willOpen = target.classList.contains("hidden");
      target.classList.toggle("hidden");
      header.setAttribute("aria-expanded", String(willOpen));
      const chevron = header.querySelector(".collapsible-chevron");
      if (chevron) chevron.textContent = willOpen ? "▼" : "▶";
    });
  });
}

// ── 起動 ─────────────────────────────────────────────────────
initCollapsibles();
initWelcome();
subscribeCategories();
subscribePosts();
