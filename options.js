// GitHub Commit Timer - オプション設定スクリプト

// DOMの読み込みが完了したら実行
document.addEventListener('DOMContentLoaded', async () => {
    // 設定要素の取得
    const enabledToggle = document.getElementById('enabledToggle');
    const realtimeModeToggle = document.getElementById('realtimeModeToggle');
    const usernameInput = document.getElementById('username');
    const tokenInput = document.getElementById('token');
    const testBtn = document.getElementById('testBtn');
    const saveBtn = document.getElementById('saveBtn');
    const newSiteInput = document.getElementById('newSite');
    const addSiteBtn = document.getElementById('addSiteBtn');
    const sitesList = document.getElementById('sitesList');
    const timeLimitInput = document.getElementById('timeLimit');
    const timeLimitValue = document.getElementById('timeLimitValue');
    const statusEl = document.getElementById('status');

    // 設定を読み込み
    async function loadSettings() {
        const config = await chrome.storage.local.get([
            'enabled', 'username', 'token', 'allowedSites', 'timeLimit', 'realtimeMode'
        ]);

        // トグル状態の設定
        enabledToggle.classList.toggle('active', config.enabled);
        realtimeModeToggle.classList.toggle('active', config.realtimeMode);

        // 入力フィールドの設定
        usernameInput.value = config.username || '';
        tokenInput.value = config.token || '';
        timeLimitInput.value = config.timeLimit || 2;
        timeLimitValue.textContent = `${config.timeLimit || 2}分`;

        // 許可サイトリストの表示
        updateSitesList(config.allowedSites || []);
    }

    // 許可サイトリストの更新
    function updateSitesList(sites) {
        sitesList.innerHTML = '';
        sites.forEach(site => {
            const tag = document.createElement('div');
            tag.className = 'site-tag';
            tag.innerHTML = `
                ${site}
                <button class="remove" data-site="${site}">×</button>
            `;
            sitesList.appendChild(tag);
        });

        // 削除ボタンのイベントリスナー
        document.querySelectorAll('.site-tag .remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const site = e.target.dataset.site;
                const config = await chrome.storage.local.get('allowedSites');
                const sites = config.allowedSites || [];
                const newSites = sites.filter(s => s !== site);
                await chrome.storage.local.set({ allowedSites: newSites });
                updateSitesList(newSites);
            });
        });
    }

    // 設定の保存
    async function saveSettings() {
        const config = {
            enabled: enabledToggle.classList.contains('active'),
            realtimeMode: realtimeModeToggle.classList.contains('active'),
            username: usernameInput.value.trim(),
            token: tokenInput.value.trim(),
            timeLimit: parseInt(timeLimitInput.value) || 2
        };

        await chrome.storage.local.set(config);
        showStatus('success', '設定を保存しました');
    }

    // 接続テスト
    async function testConnection() {
        const username = usernameInput.value.trim();
        const token = tokenInput.value.trim();

        if (!username || !token) {
            showStatus('error', 'ユーザー名とトークンを入力してください');
            return;
        }

        testBtn.textContent = '🔍 テスト中...';
        testBtn.disabled = true;

        try {
            const response = await fetch(`https://api.github.com/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.login.toLowerCase() === username.toLowerCase()) {
                    showStatus('success', '接続テスト成功！');
                } else {
                    showStatus('error', 'ユーザー名が一致しません');
                }
            } else {
                showStatus('error', '認証に失敗しました');
            }
        } catch (error) {
            showStatus('error', '接続エラー: ' + error.message);
        }

        testBtn.textContent = '🔍 接続テスト';
        testBtn.disabled = false;
    }

    // ステータス表示
    function showStatus(type, message) {
        statusEl.className = `status ${type}`;
        statusEl.textContent = message;
        statusEl.style.display = 'block';

        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    }

    // イベントリスナーの設定
    enabledToggle.addEventListener('click', () => {
        enabledToggle.classList.toggle('active');
    });

    realtimeModeToggle.addEventListener('click', () => {
        realtimeModeToggle.classList.toggle('active');
    });

    timeLimitInput.addEventListener('input', () => {
        const value = timeLimitInput.value;
        timeLimitValue.textContent = `${value}分`;
    });

    addSiteBtn.addEventListener('click', async () => {
        const site = newSiteInput.value.trim().toLowerCase();
        if (!site) return;

        // ドメイン形式の検証
        if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/.test(site)) {
            showStatus('error', '有効なドメイン名を入力してください');
            return;
        }

        const config = await chrome.storage.local.get('allowedSites');
        const sites = config.allowedSites || [];
        
        if (sites.includes(site)) {
            showStatus('error', 'このサイトは既に追加されています');
            return;
        }

        sites.push(site);
        await chrome.storage.local.set({ allowedSites: sites });
        updateSitesList(sites);
        newSiteInput.value = '';
    });

    testBtn.addEventListener('click', testConnection);
    saveBtn.addEventListener('click', saveSettings);

    // 初期設定の読み込み
    await loadSettings();
}); 