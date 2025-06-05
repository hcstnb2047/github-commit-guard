document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    const statusIconEl = document.getElementById('statusIcon');
    const statusTextEl = document.getElementById('statusText');
    const statusDetailsEl = document.getElementById('statusDetails');
    const commitInfoEl = document.getElementById('commitInfo');
    const lastCommitTimeEl = document.getElementById('lastCommitTime');
    const timerDisplayEl = document.getElementById('timerDisplay');
    const timeLimitEl = document.getElementById('timeLimit');
    const refreshBtn = document.getElementById('refreshBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    
    // リアルタイム更新機能
    let statusUpdateInterval = null;
    
    // 設定を読み込み
    async function loadStatus() {
        try {
            const config = await chrome.storage.local.get([
                'enabled', 'username', 'token', 'allowedSites', 'timeLimit',
                'lastCheck', 'commitStatus', 'nextCheckIn', 'apiCallsThisHour', 'realtimeMode'
            ]);
            
            loadingEl.style.display = 'none';
            contentEl.style.display = 'block';
            
            if (!config.enabled) {
                showStatus('warning', '無効', '設定から有効にしてください');
                return;
            }
            
            if (!config.username || !config.token) {
                showStatus('error', '未設定', 'GitHubの認証情報を設定してください');
                return;
            }
            
            if (!config.commitStatus) {
                showStatus('warning', '確認中', 'GitHubをチェック中...');
                return;
            }
            
            const status = config.commitStatus;
            
            if (status.error) {
                showStatus('error', 'APIエラー', status.error);
                return;
            }
            
            // より詳細なステータス表示
            if (status.recentCommit) {
                showStatus('success', '🔥 最新コミット検出', 
                    '30分以内にコミットがありました！');
                commitInfoEl.style.display = 'block';
                lastCommitTimeEl.textContent = `${status.minutesSinceLastCommit || 0}分前`;
            } else if (status.hasRecentCommit) {
                showStatus('success', '✅ フル アクセス', 
                    '24時間以内にコミットがあります');
                commitInfoEl.style.display = 'block';
                lastCommitTimeEl.textContent = formatDate(status.lastCommitDate);
            } else {
                const hours = status.hoursSinceLastCommit || 0;
                const minutes = status.minutesSinceLastCommit || 0;
                showStatus('warning', '⏱️ タイマー制限中', 
                    `最後のコミットから ${hours}時間${minutes % 60}分経過`);
                
                // タイマー表示
                timerDisplayEl.style.display = 'block';
                const timeLimit = config.timeLimit || 2;
                timeLimitEl.textContent = `${timeLimit}:00`;
                
                commitInfoEl.style.display = 'block';
                lastCommitTimeEl.textContent = status.lastCommitDate ? 
                    formatDate(status.lastCommitDate) : '未検出';
            }
            
            // 詳細情報を表示
            let details = '';
            
            // 最終チェック時刻
            if (config.lastCheck) {
                const checkTime = new Date(config.lastCheck);
                details += `<strong>最終チェック:</strong> ${formatTime(checkTime)}<br>`;
            }
            
            // 次回チェック予定
            if (config.nextCheckIn) {
                details += `<strong>次回チェック:</strong> ${config.nextCheckIn}秒後<br>`;
            }
            
            // API使用状況
            if (config.apiCallsThisHour !== undefined) {
                const remaining = 5000 - config.apiCallsThisHour;
                const percentage = Math.round((remaining / 5000) * 100);
                details += `<strong>API残量:</strong> ${remaining}/5000 (${percentage}%)<br>`;
            }
            
            // 許可サイト数
            const allowedCount = (config.allowedSites || []).length;
            details += `<strong>許可サイト:</strong> ${allowedCount} 個<br>`;
            
            // リアルタイムモード
            if (config.realtimeMode) {
                details += `<strong>リアルタイム:</strong> 有効 🔥`;
            }
            
            statusDetailsEl.innerHTML = details;
            
            // 最新コミットメッセージがある場合
            if (status.latestCommitMessage) {
                statusDetailsEl.innerHTML += `<br><strong>最新コミット:</strong><br>"${status.latestCommitMessage}"`;
            }
            
        } catch (error) {
            showStatus('error', 'エラー', error.message);
        }
    }
    
    function showStatus(type, text, details) {
        statusIconEl.className = 'status-icon';
        
        switch (type) {
            case 'success':
                statusIconEl.classList.add('status-success');
                statusIconEl.textContent = '✓';
                break;
            case 'warning':
                statusIconEl.classList.add('status-warning');
                statusIconEl.textContent = '⏱';
                break;
            case 'error':
                statusIconEl.classList.add('status-error');
                statusIconEl.textContent = '!';
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
        const now = new Date();
        const diffMinutes = (now - date) / (1000 * 60);
        
        if (diffMinutes < 60) {
            return `${Math.floor(diffMinutes)}分前`;
        } else if (diffMinutes < 1440) { // 24時間
            const hours = Math.floor(diffMinutes / 60);
            return `${hours}時間前`;
        } else {
            return date.toLocaleDateString('ja-JP', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }
    
    function formatTime(date) {
        return date.toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
    // リアルタイム更新を開始
    function startRealtimeUpdates() {
        // 既存のインターバルをクリア
        if (statusUpdateInterval) {
            clearInterval(statusUpdateInterval);
        }
        
        // 5秒ごとに更新
        statusUpdateInterval = setInterval(async () => {
            // バックグラウンドから最新ステータスを取得
            chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
                if (response) {
                    // 簡単な更新のみ実行
                    updateQuickStatus(response);
                }
            });
        }, 5000);
    }
    
    // 軽量なステータス更新
    function updateQuickStatus(data) {
        if (data.commitStatus && data.commitStatus.minutesSinceLastCommit !== undefined) {
            const minutes = data.commitStatus.minutesSinceLastCommit;
            if (minutes < 60 && lastCommitTimeEl) {
                lastCommitTimeEl.textContent = `${minutes}分前`;
            }
        }
        
        // 次回チェックのカウントダウン
        if (data.nextCheckIn) {
            const nextCheckElement = statusDetailsEl.querySelector('strong:contains("次回チェック")');
            if (nextCheckElement) {
                const currentText = statusDetailsEl.innerHTML;
                const updatedText = currentText.replace(
                    /次回チェック:<\/strong> \d+秒後/,
                    `次回チェック:</strong> ${data.nextCheckIn}秒後`
                );
                statusDetailsEl.innerHTML = updatedText;
            }
        }
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
        }, 1000);
    });
    
    // 設定画面を開く
    settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    // 初期読み込み
    await loadStatus();
    
    // リアルタイム更新を開始
    startRealtimeUpdates();
});