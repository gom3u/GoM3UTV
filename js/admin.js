let adminChannels = [];
const ghSync = new GitHubSync();

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    if (!sessionStorage.getItem('gom3u_admin_auth')) {
        window.location.href = 'login.html';
        return;
    }

    setupTabs();
    loadAdminData();
    setupGitHubConfig();
    setupM3UImporter();
});

function setupTabs() {
    document.querySelectorAll('.admin-sidebar li').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-sidebar li').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-page').forEach(p => p.classList.add('hidden'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.remove('hidden');
        });
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('gom3u_admin_auth');
        window.location.href = 'login.html';
    });
}

async function loadAdminData() {
    try {
        const res = await fetch('channels.json');
        adminChannels = await res.json();
        updateDashboardStats();
        renderAdminTable();
    } catch (e) {
        console.error('Error fetching channels.json', e);
    }
}

function updateDashboardStats() {
    document.getElementById('stat-total-ch').innerText = adminChannels.length;
    document.getElementById('stat-active-ch').innerText = adminChannels.filter(c => c.enabled !== false).length;
    const groups = new Set(adminChannels.map(c => c.group).filter(Boolean));
    document.getElementById('stat-groups').innerText = groups.size;
}

function renderAdminTable() {
    const tbody = document.getElementById('channels-table-body');
    tbody.innerHTML = '';
    adminChannels.forEach((ch, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${ch.id || idx + 1}</td>
            <td><img src="${ch.logo}" onerror="this.src='https://via.placeholder.com/35'"></td>
            <td>${ch.name}</td>
            <td>${ch.group || 'N/A'}</td>
            <td>${ch.enabled !== false ? '🟢 Active' : '🔴 Disabled'}</td>
            <td>
                <button onclick="editChannel(${idx})" class="btn-primary">Edit</button>
                <button onclick="deleteChannel(${idx})" class="btn-danger">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteChannel(index) {
    if (confirm("Delete this channel?")) {
        adminChannels.splice(index, 1);
        renderAdminTable();
        updateDashboardStats();
    }
}

// GitHub API Commit Actions
document.getElementById('commit-github-btn').addEventListener('click', async () => {
    if (!ghSync.isConfigured()) {
        alert('Please configure your GitHub credentials under GitHub Sync tab first.');
        return;
    }

    try {
        const btn = document.getElementById('commit-github-btn');
        btn.innerText = "Syncing...";
        await ghSync.updateFile('channels.json', JSON.stringify(adminChannels, null, 2), "Updated channels via GoM3U Admin Panel");
        alert("Successfully updated channels.json directly on GitHub!");
        btn.innerText = "⚡ Save & Commit to GitHub";
    } catch (err) {
        alert("GitHub Sync Error: " + err.message);
    }
});

function setupGitHubConfig() {
    document.getElementById('gh-user').value = localStorage.getItem('gh_user') || '';
    document.getElementById('gh-repo').value = localStorage.getItem('gh_repo') || '';
    document.getElementById('gh-token').value = localStorage.getItem('gh_token') || '';

    document.getElementById('save-gh-config').addEventListener('click', () => {
        localStorage.setItem('gh_user', document.getElementById('gh-user').value);
        localStorage.setItem('gh_repo', document.getElementById('gh-repo').value);
        localStorage.setItem('gh_token', document.getElementById('gh-token').value);
        alert('GitHub credentials saved to local browser context!');
    });
}

// Client-side M3U Parser
function setupM3UImporter() {
    document.getElementById('m3u-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => parseM3UContent(evt.target.result);
        reader.readAsText(file);
    });
}

function parseM3UContent(content) {
    const lines = content.split('\n');
    const importedChannels = [];
    let currentCh = {};

    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('#EXTINF:')) {
            const nameMatch = line.match(/,(.+)$/);
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            const groupMatch = line.match(/group-title="([^"]+)"/);

            currentCh = {
                id: adminChannels.length + importedChannels.length + 1,
                name: nameMatch ? nameMatch[1] : 'Imported Channel',
                logo: logoMatch ? logoMatch[1] : '',
                group: groupMatch ? groupMatch[1] : 'General',
                enabled: true
            };
        } else if (line.startsWith('http')) {
            currentCh.url = line;
            if (currentCh.name) {
                importedChannels.push(currentCh);
                currentCh = {};
            }
        }
    });

    if (importedChannels.length > 0) {
        adminChannels = [...adminChannels, ...importedChannels];
        renderAdminTable();
        updateDashboardStats();
        alert(`Successfully imported ${importedChannels.length} channels! Remember to commit changes to GitHub.`);
    } else {
        alert("No valid channels found in M3U file.");
    }
      }
