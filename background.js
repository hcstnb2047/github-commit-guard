// GitHub Commit Guard - Background Script

const GITHUB_API_URL = 'https://api.github.com';
const CHECK_INTERVAL = 30 * 60 * 1000; // 30分間隔
const BLOCKED_PAGE_URL = chrome.runtime.getURL('blocked.html');

// GitHubのコントリビューション状況をチェック
async function checkGitHubContributions(username, token) {
  try {
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    };
    
    // 最近のイベントを取得
    const response = await fetch(`${GITHUB_API_URL}/users/${username}/events`, {
      headers: headers
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API エラー: ${response.status}`);
    }
    
    const events = await response.json();
    
    // プッシュイベントをフィルタリング
    const pushEvents = events.filter(event => event.type === 'PushEvent');
    
    if (pushEvents.length === 0) {
      return { hasRecentCommit: false, lastCommitDate: null };
    }
    
    // 最新のコミット日時を取得
    const latestPush = pushEvents[0];
    const lastCommitDate = new Date(latestPush.created_at);
    const now = new Date();
    const hoursSinceLastCommit = (now - lastCommitDate) / (1000 * 60 * 60);
    
    return {
      hasRecentCommit: hoursSinceLastCommit <= 24, // 24時間以内
      lastCommitDate: lastCommitDate,
      hoursSinceLastCommit: Math.floor(hoursSinceLastCommit)
    };
    
  } catch (error) {
    console.error('GitHub API チェックエラー:', error);
    return { hasRecentCommit: true, error: error.message }; // エラー時はブロックしない
  }
}

// ブロックルールを更新
async function updateBlockingRules(shouldBlock, blockedSites) {
  if (!shouldBlock || blockedSites.length === 0) {
    // ルールをクリア
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1]
    });
    return;
  }
  
  const rule = {
    id: 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { url: BLOCKED_PAGE_URL }
    },
    condition: {
      urlFilter: '*',
      domains: blockedSites
    }
  };
  
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [rule],
    removeRuleIds: [1]
  });
}

// 定期チェック
async function performPeriodicCheck() {
  const config = await chrome.storage.local.get(['username', 'token', 'blockedSites', 'enabled']);
  
  if (!config.enabled || !config.username || !config.token || !config.blockedSites) {
    return;
  }
  
  const result = await checkGitHubContributions(config.username, config.token);
  
  // 結果を保存
  await chrome.storage.local.set({
    lastCheck: new Date().toISOString(),
    commitStatus: result
  });
  
  // ブロック状態を更新
  const shouldBlock = !result.hasRecentCommit && !result.error;
  await updateBlockingRules(shouldBlock, config.blockedSites);
  
  // バッジを更新
  const badgeText = shouldBlock ? '×' : '✓';
  const badgeColor = shouldBlock ? '#ff4444' : '#44ff44';
  
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

// 拡張機能インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  // デフォルト設定
  await chrome.storage.local.set({
    enabled: false,
    username: '',
    token: '',
    blockedSites: ['twitter.com', 'youtube.com', 'facebook.com'],
    checkInterval: 24 // 時間単位
  });
  
  chrome.action.setBadgeText({ text: '?' });
});

// 拡張機能起動時
chrome.runtime.onStartup.addListener(() => {
  performPeriodicCheck();
});

// 定期実行の設定
setInterval(performPeriodicCheck, CHECK_INTERVAL);

// 初回実行
performPeriodicCheck();

// ストレージ変更時の処理
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.enabled || changes.username || changes.token || changes.blockedSites)) {
    performPeriodicCheck();
  }
});