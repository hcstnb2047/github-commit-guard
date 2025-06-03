document.addEventListener('DOMContentLoaded', async () => {
    const enabledToggle = document.getElementById('enabledToggle');
    const usernameInput = document.getElementById('username');
    const tokenInput = document.getElementById('token');
    const checkIntervalInput = document.getElementById('checkInterval');
    const newSiteInput = document.getElementById('newSite');
    const addSiteBtn = document.getElementById('addSiteBtn');
    const sitesListEl = document.getElementById('sitesList');
    const testBtn = document.getElementById('testBtn');
    const saveBtn = document.getElementById('saveBtn');
    const statusEl = document.getElementById('status');
    
    let currentConfig = {};
    
    // 設定を読み込み
    async function loadSettings() {
        try {
            currentConfig = await chrome.storage.local.get([
                'enabled', 'username', 'token', 'blockedSites', 'checkInterval'
            ]);
            
            // デフォルト値
            currentConfig.enabled = currentConfig.enabled || false;
            currentConfig.username = currentConfig.username || '';
            currentConfig.token = currentConfig.token || '';
            currentConfig.blockedSites = currentConfig.blockedSites || ['twitter.com', 'youtube.com', 'facebook.com'];
            currentConfig.checkInterval = currentConfig.checkInterval || 24;
            
            // UIに反映
            enabledToggle.classList.toggle('active', currentConfig.enabled);
            usernameInput.value = currentConfig.username;
            tokenInput.value = currentConfig.token;
            checkIntervalInput.value = currentConfig.checkInterval;
            
            renderSitesList();
            
        } catch (error) {
            showStatus('設定の読み込みエラー: ' + error.message, 'error');
        }
    }
    
    // サイトリストを表示
    function renderSitesList() {
        sitesListEl.innerHTML = '';
        currentConfig.blockedSites.forEach((site, index) => {
            const siteTag = document.createElement('div');
            siteTag.className = 'site-tag';
            siteTag.innerHTML = `
                ${site}
                <button class="remove" onclick="removeSite(${index})">×</button>
            `;
            sitesListEl.appendChild(siteTag);
        });
    }
    
    // サイトを削除
    window.removeSite = (index) => {
        currentConfig.blockedSites.splice(index, 1);
        renderSitesList();
    };
    
    // ステータス表示
    function showStatus(message, type = 'success') {
        statusEl.className = `status ${type}`;
        statusEl.textContent = message;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
    
    // GitHub接続テスト
    async function testGitHubConnection() {
        const username = usernameInput.value.trim();
        const token = tokenInput.value.trim();
        
        if (!username || !token) {
            showStatus('ユーザー名とトークンを入力してください', 'error');
            return;
        }
        
        testBtn.textContent = '🔍 テスト中...';
        testBtn.disabled = true;
        
        try {
            const response = await fetch(`https://api.github.com/users/${username}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                showStatus(`✅ 接続成功！ ${userData.name || userData.login} として認証されました`, 'success');
            } else {
                throw new Error(`API エラー: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            showStatus('接続テスト失敗: ' + error.message, 'error');
        } finally {
            testBtn.textContent = '🔍 接続テスト';
            testBtn.disabled = false;
        }
    }
});