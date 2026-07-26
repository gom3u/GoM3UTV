let channels = [];
let filteredChannels = [];
let currentChannelIndex = -1;
let hls = null;

const video = document.getElementById('video-player');
const channelListEl = document.getElementById('channel-list');
const loaderEl = document.getElementById('player-loader');
const loaderStatus = document.getElementById('loader-status');

// Init application
document.addEventListener('DOMContentLoaded', async () => {
    await loadNotices();
    await loadChannels();
    setupKeyNavigation();
    setupControls();
});

// Load Notice configurations
async function loadNotices() {
    try {
        const res = await fetch('notice.json');
        const notice = await res.json();
        
        if (notice.maintenance) {
            document.body.innerHTML = `<div class="modal"><div class="modal-content"><h2>System Maintenance</h2><p>GoM3U TV is undergoing scheduled maintenance. Please check back later.</p></div></div>`;
            return;
        }

        if (notice.ticker && notice.ticker.enabled) {
            const tickerBar = document.getElementById('ticker-bar');
            document.getElementById('ticker-text').innerText = notice.ticker.text;
            tickerBar.classList.remove('hidden');
        }

        if (notice.popup && notice.popup.enabled) {
            document.getElementById('modal-title').innerText = notice.popup.title;
            document.getElementById('modal-body').innerText = notice.popup.message;
            document.getElementById('popup-modal').classList.remove('hidden');
            document.getElementById('close-modal-btn').addEventListener('click', () => {
                document.getElementById('popup-modal').classList.add('hidden');
            });
        }
    } catch (e) {
        console.warn('No notice configuration found or failed to load.');
    }
}

// Fetch channels from channels.json
async function loadChannels() {
    try {
        const res = await fetch('channels.json');
        channels = await res.json();
        filteredChannels = channels.filter(c => c.enabled !== false);
        renderCategories();
        renderChannels(filteredChannels);
        
        if (filteredChannels.length > 0) {
            playChannel(0);
        }
    } catch (err) {
        console.error("Failed to load channel list:", err);
    }
}

// Render Channels list
function renderChannels(list) {
    channelListEl.innerHTML = '';
    list.forEach((channel, idx) => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.tabIndex = 0; // Focusable for Smart TV/Remote controls
        card.innerHTML = `
            <span class="ch-num">${channel.id || idx + 1}</span>
            <img src="${channel.logo}" onerror="this.src='https://via.placeholder.com/45/000/FFF?text=TV'" alt="">
            <div class="ch-info">
                <h4>${channel.name}</h4>
                <small>${channel.group || 'General'}</small>
            </div>
        `;
        card.addEventListener('click', () => playChannel(idx));
        channelListEl.appendChild(card);
    });
}

// Dynamic Category Rendering
function renderCategories() {
    const categories = ['all', 'favorites', ...new Set(channels.map(c => c.group).filter(Boolean))];
    const catList = document.getElementById('category-list');
    catList.innerHTML = '';
    
    categories.forEach(cat => {
        const li = document.createElement('li');
        li.innerText = cat.charAt(0).toUpperCase() + cat.slice(1);
        li.dataset.cat = cat;
        li.addEventListener('click', () => {
            document.querySelectorAll('#category-list li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            filterByCategory(cat);
        });
        catList.appendChild(li);
    });
}

function filterByCategory(category) {
    if (category === 'all') {
        filteredChannels = channels.filter(c => c.enabled !== false);
    } else if (category === 'favorites') {
        const favs = JSON.parse(localStorage.getItem('gom3u_favs') || '[]');
        filteredChannels = channels.filter(c => favs.includes(c.id));
    } else {
        filteredChannels = channels.filter(c => c.group === category && c.enabled !== false);
    }
    renderChannels(filteredChannels);
}

// Play Channel with HLS.js or native fallback
function playChannel(index) {
    if (index < 0 || index >= filteredChannels.length) return;
    
    currentChannelIndex = index;
    const channel = filteredChannels[index];

    // UI Updates
    document.getElementById('current-channel-name').innerText = channel.name;
    document.getElementById('current-channel-group').innerText = channel.group || 'Live Stream';
    const logoEl = document.getElementById('current-channel-logo');
    if (channel.logo) {
        logoEl.src = channel.logo;
        logoEl.classList.remove('hidden');
    } else {
        logoEl.classList.add('hidden');
    }

    loaderEl.classList.remove('hidden');
    loaderStatus.innerText = `Connecting to ${channel.name}...`;

    if (Hls.isSupported() && channel.url.includes('.m3u8')) {
        if (hls) hls.destroy();
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(channel.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play();
            loaderEl.classList.add('hidden');
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                console.warn('Fatal stream error encountered, attempting failover...');
                autoNextChannel();
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || channel.url.endsWith('.mp4')) {
        video.src = channel.url;
        video.play();
        video.onloadeddata = () => loaderEl.classList.add('hidden');
        video.onerror = () => autoNextChannel();
    } else {
        loaderStatus.innerText = "Unsupported stream format.";
    }

    saveRecent(channel.id);
}

// Auto-failover to next channel on playback failure
function autoNextChannel() {
    loaderStatus.innerText = "Stream unreachable. Auto-switching channel...";
    setTimeout(() => {
        if (currentChannelIndex + 1 < filteredChannels.length) {
            playChannel(currentChannelIndex + 1);
        }
    }, 2500);
}

// Save to Recently Watched LocalStorage
function saveRecent(id) {
    let recents = JSON.parse(localStorage.getItem('gom3u_recent') || '[]');
    recents = recents.filter(rId => rId !== id);
    recents.unshift(id);
    if (recents.length > 20) recents.pop();
    localStorage.setItem('gom3u_recent', JSON.stringify(recents));
}

// Keyboard & D-Pad Remote Control Mapping
function setupKeyNavigation() {
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                navigateChannel(-1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                navigateChannel(1);
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
            case ' ':
                togglePlayPause();
                break;
        }
    });
}

function navigateChannel(direction) {
    let newIndex = currentChannelIndex + direction;
    if (newIndex >= 0 && newIndex < filteredChannels.length) {
        playChannel(newIndex);
    }
}

function setupControls() {
    document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
    
    document.getElementById('btn-pip').addEventListener('click', async () => {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
            await video.requestPictureInPicture();
        }
    });

    document.getElementById('volume-slider').addEventListener('input', (e) => {
        video.volume = e.target.value;
    });

    document.getElementById('brightness-slider').addEventListener('input', (e) => {
        document.getElementById('video-wrapper').style.filter = `brightness(${e.target.value})`;
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filteredChannels = channels.filter(c => c.name.toLowerCase().includes(query));
        renderChannels(filteredChannels);
    });
}

function togglePlayPause() {
    if (video.paused) video.play();
    else video.pause();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.getElementById('video-wrapper').requestFullscreen();
    } else {
        document.exitFullscreen();
    }
                                   }
