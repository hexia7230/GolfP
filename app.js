/**
 * Golf Point Tracker - Logic
 */

const STORAGE_KEY = 'golf_point_tracker_v1';

class AppState {
    constructor() {
        this.data = this.load();
        this.currentScreen = 'entry';
    }

    load() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
        // Initial defaults
        return {
            players: [
                { id: 'p1', name: 'プレイヤー1（設定から変更可能)', totalPoints: 0, active: true },
                { id: 'p2', name: 'プレイヤー2（設定から変更可能)', totalPoints: 0, active: true },
                { id: 'p3', name: 'プレイヤー3（設定から変更可能)', totalPoints: 0, active: true },
                { id: 'p4', name: 'プレイヤー4（設定から変更可能)', totalPoints: 0, active: true }
            ],
            rounds: [],
            defaultRate: 500
        };
    }

    save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    }

    addRound(roundData) {
        this.data.rounds.unshift(roundData); // Newest first
        // Update player totals
        roundData.playerResults.forEach(res => {
            const player = this.data.players.find(p => p.id === res.playerId);
            if (player) {
                player.totalPoints += res.change;
            }
        });
        this.save();
    }

    resetData() {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    }
}

const state = new AppState();

// --- DOM Elements ---
const screens = {
    entry: document.getElementById('screen-entry'),
    result: document.getElementById('screen-result'),
    history: document.getElementById('screen-history'),
    settings: document.getElementById('screen-settings')
};

const tabItems = document.querySelectorAll('.tab-item');
const pageTitle = document.getElementById('page-title');
const playerInputsContainer = document.getElementById('player-inputs-container');

// --- Navigation ---
function navigateTo(screenId) {
    Object.keys(screens).forEach(id => {
        screens[id].classList.add('hidden');
    });
    screens[screenId].classList.remove('hidden');

    // Update Tab Bar
    tabItems.forEach(item => {
        item.classList.toggle('active', item.dataset.screen === screenId);
    });

    // Update Title
    const titles = {
        entry: 'ラウンド入力',
        result: '計算結果',
        history: '履歴',
        settings: '設定'
    };
    pageTitle.textContent = titles[screenId] || 'ゴルフポイント';

    // Initializations for specific screens
    if (screenId === 'entry') renderEntryScreen();
    if (screenId === 'history') renderHistory();
    if (screenId === 'settings') renderSettings();

    window.scrollTo(0, 0);
}

tabItems.forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.screen));
});

// --- Entry Screen Logic ---
function saveCurrentInputs() {
    const scoreInputs = document.querySelectorAll('.input-score');
    scoreInputs.forEach(input => {
        const pid = input.dataset.pid;
        const player = state.data.players.find(p => p.id === pid);
        if (player) {
            player.lastScore = input.value;
            const hcpInput = document.querySelector(`.input-hcp[data-pid="${pid}"]`);
            player.lastHcp = hcpInput ? hcpInput.value : "0";
            const nCheck = document.querySelector(`.input-n[data-pid="${pid}"]`);
            player.lastN = nCheck ? nCheck.checked : false;
        }
    });
}

function renderEntryScreen() {
    playerInputsContainer.innerHTML = '';
    state.data.players.forEach(player => {
        const block = document.createElement('div');
        block.className = `player-block ${player.active ? '' : 'inactive'}`;
        block.innerHTML = `
            <div class="pb-header">
                <span class="pb-name">${player.name}</span>
                <label class="ios-switch">
                    <input type="checkbox" ${player.active ? 'checked' : ''} onchange="togglePlayerActive('${player.id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="pb-inputs">
                <div class="input-group">
                    <label>スコア</label>
                    <input type="number" class="input-score" data-pid="${player.id}" inputmode="numeric" placeholder="0" value="${player.lastScore || ''}" ${player.active ? '' : 'disabled'}>
                </div>
                <div class="input-group">
                    <label>ハンデ</label>
                    <input type="number" class="input-hcp" data-pid="${player.id}" inputmode="numeric" value="${player.lastHcp || '0'}" ${player.active ? '' : 'disabled'}>
                </div>
                <div class="input-group-n">
                    <label>N (全的中)</label>
                    <input type="checkbox" class="input-n" data-pid="${player.id}" ${player.lastN ? 'checked' : ''} ${player.active ? '' : 'disabled'}>
                </div>
            </div>
        `;
        playerInputsContainer.appendChild(block);
    });
}

window.togglePlayerActive = (id, isActive) => {
    saveCurrentInputs();
    const player = state.data.players.find(p => p.id === id);
    if (player) {
        player.active = isActive;
        state.save();
        renderEntryScreen();
    }
};

// --- Calculation ---
document.getElementById('btn-calculate').addEventListener('click', () => {
    saveCurrentInputs();
    const course = document.getElementById('course-name').value;
    const rate = parseInt(document.getElementById('round-rate').value) || 500;
    const umaAmount = 500;

    const activeResults = [];
    state.data.players.forEach(player => {
        if (!player.active) return;
        const score = parseInt(player.lastScore);
        const hcp = parseInt(player.lastHcp) || 0;
        const nearPin = player.lastN || false;

        if (!isNaN(score)) {
            activeResults.push({
                playerId: player.id,
                name: player.name,
                score,
                handicap: hcp,
                net: score - hcp,
                nearPin,
                change: 0
            });
        }
    });

    if (activeResults.length < 2) {
        alert('少なくとも2人のスコアを入力してください。');
        return;
    }

    // Updated Logic: Everyone plays everyone
    for (let i = 0; i < activeResults.length; i++) {
        for (let j = i + 1; j < activeResults.length; j++) {
            const pA = activeResults[i];
            const pB = activeResults[j];

            const better = pA.net <= pB.net ? pA : pB;
            const worse = pA.net <= pB.net ? pB : pA;
            const diff = worse.net - better.net;

            const isP1Involved = (better.playerId === 'p1' || worse.playerId === 'p1');

            let matchPoints = diff * rate;

            // Uma (Bonus) Logic
            let applyUma = false;
            // 2-player game: P1 vs P2 gets Uma.
            if (activeResults.length === 2) {
                applyUma = true;
            } else {
                // 3+ players: P1 is host (no Uma). Others play with Uma.
                if (!isP1Involved) {
                    applyUma = true;
                }
            }

            if (applyUma && diff > 0) {
                matchPoints += umaAmount;
            }

            better.change += matchPoints;
            worse.change -= matchPoints;
        }
    }

    // Add 'N' (Near-pin) bonus points: +1000 from everyone else if selected
    const nBonusPerPerson = 1000;
    activeResults.forEach(r => {
        if (r.nearPin) {
            const others = activeResults.filter(o => o.playerId !== r.playerId);
            if (others.length > 0) {
                r.change += nBonusPerPerson * others.length;
                others.forEach(o => o.change -= nBonusPerPerson);
            }
        }
    });

    const round = {
        id: 'r' + Date.now(),
        date: new Date().toISOString(),
        course: course || '未設定コース',
        rate: rate,
        playerResults: activeResults
    };

    state.addRound(round);

    // Clear inputs after saving
    state.data.players.forEach(p => {
        p.lastScore = "";
        p.lastHcp = "0";
        p.lastN = false;
    });
    document.getElementById('course-name').value = "";
    state.save();

    showResult(round);
});

function showResult(round) {
    const resultList = document.getElementById('round-result-list');
    resultList.innerHTML = round.playerResults.map(r => `
        <div class="result-row">
            <span>${r.name}</span>
            <span class="${r.change >= 0 ? 'point-pos' : 'point-neg'}">
                ${r.change >= 0 ? '+' : ''}${Math.round(r.change)}P
            </span>
        </div>
    `).join('');

    const totalsList = document.getElementById('total-points-list');
    totalsList.innerHTML = state.data.players.map(p => `
        <div class="result-row">
            <span>${p.name}</span>
            <span class="${p.totalPoints >= 0 ? 'point-pos' : 'point-neg'}">
                ${p.totalPoints >= 0 ? '+' : ''}${Math.round(p.totalPoints)}P
            </span>
        </div>
    `).join('');

    navigateTo('result');
}

document.getElementById('btn-back-to-entry').addEventListener('click', () => {
    navigateTo('entry');
});

// --- History ---
function renderHistory() {
    const container = document.getElementById('history-list-container');
    if (state.data.rounds.length === 0) {
        container.innerHTML = '<div class="card" style="text-align:center; color: #888;">履歴がありません</div>';
        return;
    }

    container.innerHTML = state.data.rounds.map(round => {
        const dateStr = new Date(round.date).toLocaleDateString('ja-JP');
        return `
            <div class="history-item">
                <div class="history-header">
                    <span class="history-course">${round.course}</span>
                    <span class="history-date">${dateStr}</span>
                </div>
                <div class="history-players">
                    ${round.playerResults.map(r => `
                        <div style="font-size: 14px; display: flex; justify-content: space-between; padding-right: 8px;">
                            <span>${r.name}</span>
                            <span class="${r.change >= 0 ? 'point-pos' : 'point-neg'}">
                                ${r.change >= 0 ? '+' : ''}${Math.round(r.change)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// --- Settings ---
function renderSettings() {
    const list = document.getElementById('settings-players-list');
    list.innerHTML = state.data.players.map(p => `
        <div class="list-item">
            <input type="text" value="${p.name}" onchange="renamePlayer('${p.id}', this.value)" style="background: none; padding: 4px;">
            <button class="btn-danger" onclick="removePlayer('${p.id}')" style="background:none; border:none; font-size: 14px;">削除</button>
        </div>
    `).join('');
}

window.renamePlayer = (id, newName) => {
    const player = state.data.players.find(p => p.id === id);
    if (player && newName) {
        player.name = newName;
        state.save();
    }
};

window.removePlayer = (id) => {
    if (state.data.players.length <= 1) return alert('最低1人のプレイヤーが必要です');
    if (confirm('このプレイヤーを削除しますか？')) {
        state.data.players = state.data.players.filter(p => p.id !== id);
        state.save();
        renderSettings();
    }
};

document.getElementById('btn-add-player').addEventListener('click', () => {
    const newId = 'p' + Date.now();
    state.data.players.push({
        id: newId,
        name: `新プレイヤー`,
        totalPoints: 0,
        active: true
    });
    state.save();
    renderSettings();
});

document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('全てのデータを消去しますか？この操作は取り消せません。')) {
        state.resetData();
    }
});

// Start
navigateTo('entry');
