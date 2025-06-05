// GitHub Commit Timer - Background Script

const GITHUB_API_URL = 'https://api.github.com';
const CHECK_INTERVAL = 2 * 60 * 1000; // 2分間隔（基本）
const FREQUENT_CHECK_INTERVAL = 30 * 1000; // 30秒間隔（頻繁チェック）
const REALTIME_CHECK_INTERVAL = 10 * 1000; // 10秒間隔（リアルタイム）
const TIMER_PAGE_URL = chrome.runtime.getURL('timer.html');

// チェック頻度管理
let currentCheckInterval = CHECK_INTERVAL;
let checkIntervalId = null;
let lastCommitCheckTime = null;
let isRestricted = false;

// レート制限管理
let apiCallsThisHour = 0;
let hourlyResetTime = Date.now() + 60 * 60 * 1000;

// 適応的チェック間隔の決定
function getAdaptiveCheckInterval(commitStatus) {
  const now = Date.now();
  
  // レート制限チェック
  if (now > hourlyResetTime) {
    apiCallsThisHour = 0;
    hourlyResetTime = now + 60 * 60 * 1000;
  }
  
  // 残りAPI呼び出し回数を計算
  const remainingCalls = 5000 - apiCallsThisHour; // 認証済みユーザーの制限
  const remainingHours = (hourlyResetTime - now) / (1000 * 60 * 60);
  const callsPerHour = remainingCalls / remainingHours;
  
  // コミット状況に応じて間隔を調整
  if (!commitStatus || !commitStatus.hasRecentCommit) {
    // 制限中：より頻繁にチェック（コミット検出のため）
    if (callsPerHour > 120) { // 2分に1回以上可能
      return REALTIME_CHECK_INTERVAL; // 10秒
    } else if (callsPerHour > 60) { // 1分に1回以上可能
      return FREQUENT_CHECK_INTERVAL; // 30秒
    } else {
      return CHECK_INTERVAL; // 2分
    }
  } else {
    // 正常状態：標準間隔
    return CHECK_INTERVAL; // 2分
  }
}

// GitHubのコントリビューション状況をチェック（複数エンドポイント使用）
async function checkGitHubContributions(username, token) {
  try {
    apiCallsThisHour++;
    
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    };
    
    // 並列で複数のエンドポイントをチェック
    const [eventsResponse, userResponse] = await Promise.all([
      fetch(`${GITHUB_API_URL}/users/${username}/events?per_page=10`, { headers }),
      fetch(`${GITHUB_API_URL}/user`, { headers }) // 認証確認も兼ねる
    ]);
    
    if (!eventsResponse.ok) {
      throw new Error(`GitHub API エラー: ${eventsResponse.status}`);
    }
    
    const events = await eventsResponse.json();
    const userData = await userResponse.json();
    
    // プッシュイベントをフィルタリング
    const pushEvents = events.filter(event => event.type === 'PushEvent');
    
    if (pushEvents.length === 0) {
      return { 
        hasRecentCommit: false, 
        lastCommitDate: null,
        username: userData.login,
        apiCallsRemaining: 5000 - apiCallsThisHour
      };
    }
    
    // 最新のコミット日時を取得
    const latestPush = pushEvents[0];
    const lastCommitDate = new Date(latestPush.created_at);
    const now = new Date();
    const hoursSinceLastCommit = (now - lastCommitDate) / (1000 * 60 * 60);
    
    // さらに詳細なコミット情報を取得
    const recentCommit = hoursSinceLastCommit <= 0.5; // 30分以内
    
    return {
      hasRecentCommit: hoursSinceLastCommit <= 24,
      recentCommit: recentCommit,
      lastCommitDate: lastCommitDate,
      hoursSinceLastCommit: Math.floor(hoursSinceLastCommit * 100) / 100, // 小数点2桁
      minutesSinceLastCommit: Math.floor(hoursSinceLastCommit * 60),
      username: userData.login,
      apiCallsRemaining: 5000 - apiCallsThisHour,
      latestCommitMessage: latestPush.payload?.commits?.[0]?.message || 'No message'
    };
    
  } catch (error) {
    console.error('GitHub API チェックエラー:', error);
    return { 
      hasRecentCommit: true, 
      error: error.message,
      apiCallsRemaining: 5000 - apiCallsThisHour
    };
  }
}

// Webhook風のコミット検出（GitHub APIの補助）
async function checkRecentCommitActivity(username, token) {
  try {
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    };
    
    // 最近のリポジトリアクティビティをチェック
    const reposResponse = await fetch(
      `${GITHUB_API_URL}/user/repos?sort=pushed&direction=desc&per_page=5`, 
      { headers }
    );
    
    if (reposResponse.ok) {
      const repos = await reposResponse.json();
      const recentlyPushed = repos.filter(repo => {
        const pushedAt = new Date(repo.pushed_at);
        const now = new Date();
        return (now - pushedAt) < 5 * 60 * 1000; // 5分以内
      });
      
      return recentlyPushed.length > 0;
    }
    
    return false;
  } catch (error) {
    console.error('リポジトリアクティビティチェックエラー:', error);
    return false;
  }
}

// タイマー制限ルールを更新
async function updateTimerRules(shouldLimit, allowedSites, timeLimit) {
  if (!shouldLimit || allowedSites.length === 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1]
    });
    isRestricted = false;
    return;
  }
  
  const rule = {
    id: 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { url: `${TIMER_PAGE_URL}?timeLimit=${timeLimit}` }
    },
    condition: {
      urlFilter: '*',
      excludedDomains: ['github.com', 'localhost', '127.0.0.1', ...allowedSites]
    }
  };
  
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [rule],
    removeRuleIds: [1]
  });
  
  isRestricted = true;
}

// 適応的チェックスケジューラー
function scheduleNextCheck(commitStatus) {
  // 現在のインターバルをクリア
  if (checkIntervalId) {
    clearTimeout(checkIntervalId);
  }
  
  // 新しい間隔を決定
  const newInterval = getAdaptiveCheckInterval(commitStatus);
  
  // 間隔が変わった場合はログ出力
  if (newInterval !== currentCheckInterval) {
    console.log(`チェック間隔変更: ${currentCheckInterval/1000}s → ${newInterval/1000}s`);
    currentCheckInterval = newInterval;
  }
  
  // 次回チェックをスケジュール
  checkIntervalId = setTimeout(performPeriodicCheck, newInterval);
}

// 定期チェック（改良版）
async function performPeriodicCheck() {
  const config = await chrome.storage.local.get([
    'username', 'token', 'allowedSites', 'enabled', 'timeLimit', 'realtimeMode'
  ]);
  
  if (!config.enabled || !config.username || !config.token) {
    scheduleNextCheck(null);
    return;
  }
  
  // メインのコミットチェック
  const result = await checkGitHubContributions(config.username, config.token);
  
  // 制限中かつリアルタイムモードの場合、追加チェック
  if (!result.hasRecentCommit && config.realtimeMode && apiCallsThisHour < 4800) {
    const recentActivity = await checkRecentCommitActivity(config.username, config.token);
    if (recentActivity) {
      // 最新の詳細情報を再取得
      const updatedResult = await checkGitHubContributions(config.username, config.token);
      Object.assign(result, updatedResult);
    }
  }
  
  // 結果を保存
  const now = new Date().toISOString();
  await chrome.storage.local.set({
    lastCheck: now,
    commitStatus: result,
    nextCheckIn: currentCheckInterval / 1000,
    apiCallsThisHour: apiCallsThisHour
  });
  
  // タイマー制限状態を更新
  const shouldLimit = !result.hasRecentCommit && !result.error;
  await updateTimerRules(shouldLimit, config.allowedSites || [], config.timeLimit || 2);
  
  // バッジを更新
  if (result.recentCommit) {
    chrome.action.setBadgeText({ text: '🔥' });
    chrome.action.setBadgeBackgroundColor({ color: '#fd7e14' });
  } else if (shouldLimit) {
    chrome.action.setBadgeText({ text: '⏱️' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff6b35' });
  } else {
    chrome.action.setBadgeText({ text: '✅' });
    chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
  }
  
  // 次回チェックをスケジュール
  scheduleNextCheck(result);
  
  // 状態変化時は通知（オプション）
  if (result.recentCommit && isRestricted) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'コミット検出！',
      message: '新しいコミットが検出されました。制限が解除されます。'
    });
  }
}

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    enabled: false,
    username: '',
    token: '',
    allowedSites: ['github.com', 'stackoverflow.com', 'developer.mozilla.org'],
    timeLimit: 2,
    realtimeMode: true // リアルタイムモードをデフォルトで有効
  });
  
  chrome.action.setBadgeText({ text: '?' });
});

// 拡張機能起動時
chrome.runtime.onStartup.addListener(() => {
  performPeriodicCheck();
});

// 手動チェック要求への対応
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkNow') {
    performPeriodicCheck();
    sendResponse({ status: 'checking' });
  } else if (request.action === 'timerCompleted') {
    chrome.tabs.update(sender.tab.id, { url: request.originalUrl });
  } else if (request.action === 'getStatus') {
    chrome.storage.local.get(['commitStatus', 'apiCallsThisHour', 'nextCheckIn'])
      .then(data => sendResponse(data));
    return true; // 非同期レスポンス
  }
});

// ストレージ変更時の処理
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const relevantChanges = ['enabled', 'username', 'token', 'allowedSites', 'timeLimit', 'realtimeMode'];
    if (relevantChanges.some(key => changes[key])) {
      performPeriodicCheck();
    }
  }
});

// 初回実行
performPeriodicCheck();