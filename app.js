// Constants
const STAR_THRESHOLD = 3;
const STORAGE_KEY = 'life_tips_posts';
const USER_KEY = 'life_tips_username';

const CATEGORY_LABELS = {
    'housework': '家事',
    'saving': '節約術',
    'points': 'ポイント運用'
};

// State
let posts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let currentUser = localStorage.getItem(USER_KEY) || '';
let activeCategory = 'all';

// DOM Elements
const usernameInput = document.getElementById('username-input');
const saveUsernameBtn = document.getElementById('save-username-btn');
const saveMessage = document.getElementById('save-message');

const postForm = document.getElementById('post-form');
const postTriggerContainer = document.getElementById('post-trigger-container');
const postTriggerInput = document.getElementById('post-trigger-input');
const openPostFormBtn = document.getElementById('open-post-form-btn');
const cancelPostBtn = document.getElementById('cancel-post-btn');

const postsContainer = document.getElementById('posts-container');
const filterBtns = document.querySelectorAll('.filter-btn');

const navHomeBtn = document.getElementById('nav-home-btn');
const navMypageBtn = document.getElementById('nav-mypage-btn');
const homeView = document.getElementById('home-view');
const mypageView = document.getElementById('mypage-view');

// Initialize
function init() {
    if (currentUser) {
        usernameInput.value = currentUser;
    }

    renderPosts();
    setupEventListeners();
}

// Event Listeners
function setupEventListeners() {
    // Navigation
    navHomeBtn.addEventListener('click', () => {
        navHomeBtn.classList.add('active');
        navMypageBtn.classList.remove('active');
        homeView.classList.remove('hidden');
        mypageView.classList.add('hidden');
        renderPosts();
    });

    navMypageBtn.addEventListener('click', () => {
        navMypageBtn.classList.add('active');
        navHomeBtn.classList.remove('active');
        mypageView.classList.remove('hidden');
        homeView.classList.add('hidden');
        saveMessage.classList.add('hidden');
    });

    // User name handling (My Page)
    saveUsernameBtn.addEventListener('click', () => {
        const name = usernameInput.value.trim();
        if (name) {
            currentUser = name;
            localStorage.setItem(USER_KEY, currentUser);
            saveMessage.classList.remove('hidden');
            setTimeout(() => saveMessage.classList.add('hidden'), 3000);
        } else {
            alert('名前を入力してください');
        }
    });

    // Post Form Toggling
    const showForm = () => {
        postTriggerContainer.classList.add('hidden');
        postForm.classList.remove('hidden');
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

    // Form submission
    postForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!currentUser) {
            alert('マイページでアカウント名を登録してから投稿してください。');
            navMypageBtn.click(); // Switch to my page
            return;
        }

        const title = document.getElementById('post-title').value.trim();
        const content = document.getElementById('post-content').value.trim();
        const category = document.getElementById('post-category').value;

        if (title && content) {
            const newPost = {
                id: Date.now().toString(),
                title,
                content,
                category,
                author: currentUser,
                likes: 0,
                likedBy: []
            };

            posts.unshift(newPost);
            savePosts();
            renderPosts();
            hideForm();
        }
    });

    // Category Filtering
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeCategory = e.target.dataset.category;
            renderPosts();
        });
    });
}

// Actions
function handleLike(postId) {
    if (!currentUser) {
        alert('いいねをする前に、マイページでアカウント名を登録してください。');
        navMypageBtn.click();
        return;
    }

    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) return;

    const post = posts[postIndex];

    if (post.likedBy.includes(currentUser)) {
        alert('すでにいいね！しています。');
        return;
    }

    post.likes += 1;
    post.likedBy.push(currentUser);
    
    savePosts();
    renderPosts();
}

function savePosts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

// Rendering
function renderPosts() {
    postsContainer.innerHTML = '';

    const filteredPosts = activeCategory === 'all' 
        ? posts 
        : posts.filter(p => p.category === activeCategory);

    if (filteredPosts.length === 0) {
        postsContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted);">投稿がありません。最初の知恵をシェアしましょう！</p>';
        return;
    }

    filteredPosts.forEach(post => {
        const hasStar = post.likes >= STAR_THRESHOLD;
        const hasLiked = currentUser && post.likedBy.includes(currentUser);

        const article = document.createElement('article');
        article.className = 'post-card glass-panel';
        
        article.innerHTML = `
            <div class="post-header" onclick="this.parentElement.classList.toggle('expanded')" title="クリックして詳細を見る">
                <div class="post-title-container">
                    <span class="expand-icon">▼</span>
                    <h3 class="post-title">${escapeHTML(post.title)}</h3>
                </div>
                <span class="post-category">${CATEGORY_LABELS[post.category]}</span>
            </div>
            <div class="post-content">${escapeHTML(post.content)}</div>
            <div class="post-footer">
                <div class="author-info">
                    投稿者: <span class="author-name">${escapeHTML(post.author)}</span>
                    ${hasStar ? '<span class="star-badge" title="人気投稿！">★</span>' : ''}
                </div>
                <button class="like-btn ${hasLiked ? 'liked' : ''}" onclick="handleLike('${post.id}')" ${hasLiked ? 'disabled' : ''}>
                    ${hasLiked ? '❤️' : '🤍'} ${post.likes}
                </button>
            </div>
        `;
        postsContainer.appendChild(article);
    });
}

// Utility to prevent XSS
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

window.handleLike = handleLike;

init();
