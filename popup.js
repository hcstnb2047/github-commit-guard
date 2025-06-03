document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    const statusCardEl = document.getElementById('statusCard');
    const statusIconEl = document.getElementById('statusIcon');
    const statusTextEl = document.getElementById('statusText');
    const statusDetailsEl = document.getElementById('statusDetails');
    const refreshBtn = document.getElementById('refreshBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    
    // 設定を読み込み
    async function loadStatus() {
        try {
            const config = await chrome.storage.local.get([
                'enabled', 'username', 'token', 'blockedSites', 
                'lastCheck', 'commitStatus'
            ]);
            
            loadingEl.style.display = 'none';
            contentEl.style.display = 'block';
            
            if (!config.enabled) {
                showStatus('disabled', '無効', '設定から有効にしてください');
                return;
            }
            
            if (!config.username || !config.token) {
                showStatus('error', '未設定', 'GitHubの認証情報を設定してください');
                return;
            }
            
            if (!config.commitStatus) {
                showStatus('unknown', '確認中', 'GitHubをチェック中...');
                return;
            }
            
            const status = config.commitStatus;
            
            if (status.error) {
                showStatus('error', 'エラー', `API エラー: ${status.error}`);
                return;
            }
            
            if (status.hasRecentCommit) {
                showStatus('good', 'アクセス許可', 
                    `最後のコミット: ${formatDate(status.lastCommitDate)}`);
            } else {
                const hours = status.hoursSinceLastCommit || 0;
                showStatus('bad', 'アクセス制限中', 
                    `最後のコミットから ${hours} 時間経過`);
            }
            
            // 最終チェック時刻を表示
            if (config.lastCheck) {
                const checkTime = new Date(config.lastCheck);
                statusDetailsEl.innerHTML += `<br>最終チェック: ${formatTime(checkTime)}`;
            }
            
        } catch (error) {
            showStatus('error', 'エラー', error.message);
        }
    }
    
    function showStatus(type, text, details) {
        statusCardEl.className = 'status-card';
        statusIconEl.className = 'status-icon';
        
        switch (type) {
            case 'good':
                statusIconEl.classList.add('status-good');
                statusIconEl.textContent = '✓';
                break;
            case 'bad':
                statusIconEl.classList.add('status-bad');
                statusIconEl.textContent = '×';
                break;
            case 'error':
                statusIconEl.classList.add('status-bad');
                statusIconEl.textContent = '!';
                statusCardEl.classList.add('error');
                break;
            case 'disabled':
                statusIconEl.textContent = '⏸';
                break;
            default:
                statusIconEl.textContent = '?';
        }
        
        statusTextEl.textContent = text;
        statusDetailsEl.innerHTML = details;
    }
    
    function formatDate(dateString) {
        if (!dateString) return '不明';
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP') + ' ' + 
               date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }
    
    function formatTime(date) {
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }
    
    // 手動更新
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.textContent = '🔄 更新中...';
        refreshBtn.disabled = true;
        
        // バックグラウンドスクリプトにチェックを依頼
        chrome.runtime.sendMessage({ action: 'checkNow' });
        
        setTimeout(async () => {
            await loadStatus();
            refreshBtn.textContent = '🔄 更新';
            refreshBtn.disabled = false;
        }, 2000);
    });
    
    // 設定画面を開く
    settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    // 初期読み込み
    await loadStatus();
});