document.addEventListener('DOMContentLoaded', () => {
    let chartInstance = null;
    let updateInterval = null;
    let allKBData = [];
    let isMuted = true; // Browser policy: mute by default until user interaction
    let lastProcessedTimestamp = null;
    let lastAIReady = true;

    // --- PWA SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }

    // --- DARK MODE LOGIC ---
    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    let isDark = localStorage.getItem('theme') === 'dark';

    window.toggleDarkMode = () => {
        isDark = !isDark;
        if (isDark) {
            htmlElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            document.getElementById('dark-icon')?.setAttribute('data-lucide', 'sun');
        } else {
            htmlElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            document.getElementById('dark-icon')?.setAttribute('data-lucide', 'moon');
        }
        if (window.lucide) lucide.createIcons();
    };

    // Initialize Theme
    if (isDark) {
        htmlElement.classList.add('dark');
        setTimeout(() => document.getElementById('dark-icon')?.setAttribute('data-lucide', 'sun'), 100);
    } else {
        htmlElement.classList.remove('dark');
    }

    // --- GLOBAL PROGRESS LOGIC ---
    window.showGlobalProgress = (show, title = 'Memproses...', desc = 'Sistem sedang bekerja.') => {
        const overlay = document.getElementById('global-progress');
        if (!overlay) return;
        if (show) {
            document.getElementById('progress-title').innerText = title;
            document.getElementById('progress-desc').innerText = desc;
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        } else {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    };

    // --- SOCKET.IO REAL-TIME NOTIFICATIONS ---
    if (typeof io !== 'undefined') {
        const socket = io();
        socket.on('notification', (data) => {
            showNotification(data.message, data.type || 'success');
            if(data.playSound) playNotification();
        });
        socket.on('backlog_update', () => fetchBacklog());
    }

    // --- NAVIGATION ---
    window.switchTab = (tabId, el) => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('bg-sky-50', 'text-sky-600', 'border-r-4', 'border-sky-500');
            n.classList.add('text-slate-500');
        });
        
        const targetTab = document.getElementById(`tab-${tabId}`);
        if (targetTab) targetTab.classList.remove('hidden');
        
        el.classList.add('bg-sky-50', 'text-sky-600', 'border-r-4', 'border-sky-500');
        el.classList.remove('text-slate-500');
        
        document.getElementById('tab-title').innerText = el.innerText.trim();

        // Specific Tab Logic
        clearInterval(updateInterval);
        if (tabId === 'logs') {
            fetchLogs();
            updateInterval = setInterval(fetchLogs, 4000);
        } else if (tabId === 'approval') {
            fetchInsights();
        } else if (tabId === 'dashboard') {
            initCharts();
            fetchAnalytics();
        } else if (tabId === 'database') {
            fetchKB();
        } else if (tabId === 'broadcast') {
            fetchRecipients();
        } else if (tabId === 'training') {
            fetchTrainingData();
        } else if (tabId === 'moderation') {
            fetchReviews();
        } else if (tabId === 'backlog') {
            fetchBacklog();
            updateInterval = setInterval(fetchBacklog, 5000);
        } else if (tabId === 'system') {
            fetchSystemHealth();
            updateInterval = setInterval(fetchSystemHealth, 5000);
        }
    };

    // --- STATUS & STATS ---
    async function fetchStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            
            // Update Stats with Animation
            animateValue('stat-kb', parseInt(document.getElementById('stat-kb').innerText) || 0, data.kb_entries, 1000);
            
            document.getElementById('stat-sync').innerText = data.last_sync;
            
            const h = Math.floor(data.uptime / 3600);
            const m = Math.floor((data.uptime % 3600) / 60);
            document.getElementById('stat-uptime').innerText = `${h}h ${m}m`;
            
            // AI Mode Sync
            const select = document.getElementById('ai-mode-select');
            const statusLabel = document.getElementById('ai-mode-status');
            if (select && data.aiMode) {
                select.value = data.aiMode;
                statusLabel.innerText = `${data.aiMode.toUpperCase()} ACTIVE`;
                statusLabel.className = `px-3 py-1 text-[10px] font-bold rounded-full inline-block ${
                    data.aiMode === 'maintenance' ? 'bg-rose-100 text-rose-600' : 
                    data.aiMode === 'vector' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-600'
                }`;
            }

            // AI Health Sync (Phase 6)
            const aiDot = document.getElementById('ai-health-dot');
            const aiText = document.getElementById('ai-health-text');
            if (aiDot && aiText) {
                if (data.aiReady) {
                    aiDot.classList.add('bg-emerald-500');
                    aiDot.classList.remove('bg-amber-500', 'animate-pulse');
                    aiText.innerText = "AI: READY";
                    aiText.classList.remove('text-amber-500');
                    aiText.classList.add('text-slate-500');

                    // Recovery Notification
                    if (lastAIReady === false) {
                        showNotification('✅ AI Telah Pulih & Siap Menerima Pesan!');
                        playNotification(); // Sound if unmuted
                    }
                } else {
                    aiDot.classList.add('bg-amber-500', 'animate-pulse');
                    aiDot.classList.remove('bg-emerald-500');
                    aiText.innerText = "AI: COOLING DOWN";
                    aiText.classList.add('text-amber-500');
                    aiText.classList.remove('text-slate-500');
                }
                lastAIReady = data.aiReady;
            }

            // Review Badge Sync
            const badge = document.getElementById('review-badge');
            if (badge) {
                const rRes = await fetch('/api/reviews');
                const rData = await rRes.json();
                if (rData.reviews && rData.reviews.length > 0) {
                    badge.classList.remove('hidden');
                    badge.innerText = rData.reviews.length;
                    badge.className = "absolute -top-1 -right-1 bg-sky-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce";
                } else {
                    badge.classList.add('hidden');
                }
            }

            // Sync Dot Pulse
            const statusDot = document.getElementById('status-dot');
            if (data.status === "Connected") {
                statusDot.classList.add('bg-emerald-500');
                statusDot.classList.remove('bg-rose-500');
            } else {
                statusDot.classList.remove('bg-emerald-500');
                statusDot.classList.add('bg-rose-500');
            }

            // AI Thinking Pulse (Phase 17)
            const pulse = document.getElementById('ai-pulse');
            if (pulse) {
                if (data.aiThinking) {
                    pulse.classList.remove('hidden');
                    pulse.classList.add('flex');
                } else {
                    pulse.classList.add('hidden');
                    pulse.classList.remove('flex');
                }
            }

            // Cloud Sync Status (Hybrid Update)
            const cloudBadge = document.getElementById('cloud-sync-badge');
            if (cloudBadge) {
                cloudBadge.innerText = (data.status === "Connected" ? "● CLOUD LIVE" : "● SYNCING...");
                cloudBadge.className = `px-2 py-0.5 rounded text-[8px] font-black uppercase ${data.status === "Connected" ? 'text-emerald-500 bg-emerald-50' : 'text-amber-500 bg-amber-50 animate-pulse'}`;
            }

        } catch (e) {
            console.error("Status fetch error", e);
            const cloudBadge = document.getElementById('cloud-sync-badge');
            if (cloudBadge) {
                cloudBadge.innerText = "● OFFLINE";
                cloudBadge.className = "px-2 py-0.5 rounded text-[8px] font-black uppercase text-rose-500 bg-rose-50";
            }
        }
    }

    function animateValue(id, start, end, duration) {
        const obj = document.getElementById(id);
        if (start === end) return;
        const range = end - start;
        let current = start;
        const increment = end > start ? 1 : -1;
        const stepTime = Math.abs(Math.floor(duration / range));
        const timer = setInterval(() => {
            current += increment;
            obj.innerHTML = current;
            if (current == end) clearInterval(timer);
        }, stepTime);
    }

    // --- CHARTS ---
    // --- CHARTS (Enhanced RAG Analytics) ---
    function initCharts() {
        const ctx = document.getElementById('requestChart');
        if (!ctx) return;
        
        if (chartInstance) chartInstance.destroy();
        
        // Resolution Chart (Mock data for Phase 7 implementation)
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['AI Resolved', 'Manual Needed', 'Unknown'],
                datasets: [{
                    data: [72, 18, 10], // Example distribution
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderRadius: 10,
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'bottom', 
                        labels: { usePointStyle: true, font: { family: 'Outfit', weight: 'bold' } } 
                    } 
                }
            }
        });
    }

    // --- TRAINING ROOM (Phase 7 - Auto Learning) ---
    async function fetchTrainingData() {
        try {
            const res = await fetch('/api/training/data');
            const data = await res.json();
            const container = document.getElementById('training-list');
            if (!container) return;

            if (!data.suggestions || data.suggestions.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-20 text-slate-400">
                        <i data-lucide="check-circle" class="w-12 h-12 mx-auto mb-4 opacity-20 text-emerald-500"></i>
                        <p class="font-bold text-slate-700">Semua Tertangani!</p>
                        <p class="text-sm">Bot tidak menemukan pertanyaan baru yang perlu dipelajari saat ini.</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
                return;
            }

            container.innerHTML = data.suggestions.map((item, i) => `
                <div class="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm hover:shadow-md transition-all group animate-fade" style="animation-delay: ${i*100}ms">
                    <div class="flex justify-between items-start mb-6">
                        <div class="flex items-center gap-3">
                            <span class="bg-rose-50 text-rose-500 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">Sering Ditanya: ${item.count} Warga</span>
                            <span class="bg-sky-50 text-sky-500 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter italic">Saran AI</span>
                        </div>
                        <i data-lucide="brain" class="text-sky-500 w-5 h-5"></i>
                    </div>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Pertanyaan Baru</label>
                            <h4 class="text-lg font-bold text-slate-800 font-outfit leading-relaxed">${item.query}</h4>
                        </div>
                        <div class="border-l border-slate-100 pl-0 lg:pl-8 flex flex-col gap-4">
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Kategori Topik (AI Suggestion)</label>
                                <input id="tg-cat-${i}" type="text" value="${item.suggestedCategory || 'Lainnya'}" class="w-full text-xs font-bold bg-sky-50 border border-sky-100 text-sky-700 rounded-xl p-3 focus:ring-2 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all">
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Saran Jawaban (Draf)</label>
                                <textarea id="tg-ans-${i}" class="w-full text-sm bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:ring-2 focus:ring-sky-500/10 focus:border-sky-500 outline-none h-32 leading-relaxed transition-all">${item.suggestedAnswer}</textarea>
                            </div>
                            <div class="flex gap-3 mt-4">
                                <button id="btn-approve-${i}" onclick="approveTraining('${i}', '${encodeURIComponent(item.query)}')" class="flex-1 bg-emerald-500 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100">
                                    <i data-lucide="check" class="w-4 h-4"></i>
                                    <span>Setujui & Tambah</span>
                                </button>
                                <button onclick="window.removeTrainingSuggestion('${encodeURIComponent(item.query)}')" class="px-5 border border-slate-100 rounded-2xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all">
                                    <i data-lucide="x" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
            
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error(e);
        }
    }

    window.approveTraining = async (idx, queryEncoded) => {
        const query = decodeURIComponent(queryEncoded);
        const category = document.getElementById(`tg-cat-${idx}`).value;
        const answer = document.getElementById(`tg-ans-${idx}`).value;
        const btn = document.getElementById(`btn-approve-${idx}`);
        
        btn.disabled = true;
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i>';
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch('/api/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: query, answer, category })
            });

            if (res.ok) {
                showNotification('✅ Pengetahuan baru berhasil dipelajari!');
                fetchTrainingData(); 
                fetchKB();
                fetchStatus();
            }
        } catch (e) {
            showNotification('Gagal menyimpan data', 'error');
            const btn = document.getElementById(`btn-approve-${idx}`);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Setujui & Tambah';
            }
        }
    };
    
    window.removeTrainingSuggestion = async (queryEncoded) => {
        const query = decodeURIComponent(queryEncoded);
        if (!confirm(`Hapus saran untuk "${query}" secara permanen?`)) return;
        
        try {
            const res = await fetch('/api/training/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            if (res.ok) {
                showNotification('🗑️ Saran berhasil dihapus permanen!');
                fetchTrainingData();
            }
        } catch (e) {
            showNotification('Gagal menghapus saran', 'error');
        }
    };

    // --- ANALYTICS ---
    async function fetchAnalytics() {
        try {
            const res = await fetch('/api/analytics');
            const data = await res.json();
            const container = document.getElementById('top-questions-list');
            if (!container) return;

            if (!data.topQuestions || data.topQuestions.length === 0) {
                container.innerHTML = '<div class="text-slate-400 italic text-sm">Belum ada data pertanyaan standar.</div>';
                return;
            }

            container.innerHTML = data.topQuestions.map((q, i) => `
                <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-sky-200 transition-all group animate-fade" style="animation-delay: ${i * 0.1}s">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">#${i+1}</div>
                        <span class="text-sm font-medium text-slate-700 capitalize">${q.query}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-1 rounded-lg">${q.count}x</span>
                        <button onclick="fillManual('${q.query.replace(/'/g, "\\'")}')" class="p-2 text-slate-400 hover:text-sky-500 hover:bg-white rounded-lg transition-all">
                            <i data-lucide="plus" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error(e);
        }
    }

    async function fetchLogs(isTerminal = false) {
        try {
            const range = document.getElementById('log-range')?.value || 'all';
            const res = await fetch(`/api/logs?range=${range}`);
            const data = await res.json();
            
            if (isTerminal) {
                const terminal = document.getElementById('live-terminal');
                if (terminal) {
                    terminal.innerHTML = data.logs.slice(-20).map(line => {
                        const color = line.includes('Error') ? 'text-rose-400' : line.includes('AI Response') ? 'text-sky-400' : 'text-emerald-400';
                        return `<div class="${color} mb-1">> ${line}</div>`;
                    }).join('');
                    terminal.scrollTop = terminal.scrollHeight;
                }
                return;
            }

            const container = document.getElementById('chat-container');
            if (!container) return;

            container.innerHTML = data.logs.map(log => {
                const isAI = log.includes('[AI Response]');
                const isUser = log.includes('[Message Received]');
                const time = log.match(/\[(.*?)\]/)?.[1] || "";
                
                let content = log;
                if (isAI) content = log.split('[AI Response] to ')[1]?.split(': ')[1] || log;
                if (isUser) content = log.split('[Message Received] ')[1]?.split(': ')[1] || log;

                if (isUser) {
                    return `<div class="message user shadow-soft animate-fade">
                                <div class="text-[10px] opacity-70 mb-1 font-bold">${time}</div>
                                <div>${content}</div>
                            </div>`;
                } else if (isAI) {
                    return `<div class="message bot shadow-soft animate-fade">
                                <div class="text-[10px] text-slate-400 mb-1 font-bold">${time}</div>
                                <div>${content}</div>
                            </div>`;
                }
                return `<div class="text-center text-[10px] text-slate-400 my-2">${content}</div>`;
            }).join('');
            
            container.scrollTop = container.scrollHeight;
            if (window.lucide) lucide.createIcons();
        } catch (e) {}
    }

    // --- DATABASE / KB ---
    async function fetchKB() {
        try {
            const res = await fetch('/api/kb');
            const data = await res.json();
            allKBData = data.kb;
            
            document.getElementById('kb-count').innerText = allKBData.length;
            renderKB(allKBData);
        } catch (e) {
            console.error("KB fetch error", e);
        }
    }

    function renderKB(items) {
        const container = document.getElementById('kb-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<div class="bg-white p-10 rounded-3xl border border-slate-200 text-center text-slate-400">Tidak ada data ditemukan.</div>';
            return;
        }

        container.innerHTML = items.map((item, i) => {
            // Support multiple possible key names for Question and Answer
            const q = item.Question || item.Pertanyaan || item.question || item.pertanyaan || Object.values(item)[1] || "No Question";
            const a = item.Answer || item.Jawaban || item.answer || item.jawaban || Object.values(item)[2] || "No Answer";
            const id = `kb-item-${i}`;
            
            return `
                <div class="bg-white rounded-3xl border border-slate-200 hover:border-sky-200 transition-all shadow-sm group overflow-hidden">
                    <div onclick="toggleKB('${id}')" class="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-all">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm">#${i+1}</div>
                            <span class="text-sm font-bold text-slate-800 line-clamp-1">${q}</span>
                        </div>
                        <i data-lucide="chevron-down" id="icon-${id}" class="w-5 h-5 text-slate-300 group-hover:text-sky-500 transition-all"></i>
                    </div>
                    
                    <div id="${id}" class="hidden p-6 pt-0 border-t border-slate-50 animate-fade-down">
                        <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-4">
                            <p class="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">${a}</p>
                        </div>
                        <div class="flex justify-end gap-2">
                             <button onclick="fillManual('${q.replace(/'/g, "\\'")}', '${a.replace(/'/g, "\\'").replace(/\n/g, "\\n")}')" class="flex items-center gap-2 px-6 py-2 bg-sky-500 text-white hover:bg-sky-600 rounded-xl transition-all font-bold text-xs">
                                 <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit / Gunakan
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (window.lucide) lucide.createIcons();
    }

    window.filterKB = (query) => {
        const q = query.toLowerCase().trim();
        
        // If query is empty, show all data
        if (!q) {
            renderKB(allKBData);
            return;
        }

        const filtered = allKBData.filter(item => {
            const vals = Object.values(item).map(v => String(v).toLowerCase()).join(' ');
            return vals.includes(q);
        });
        
        renderKB(filtered);
    };

    // --- LOGS ---
    async function fetchLogs() {
        try {
            const range = document.getElementById('log-range')?.value || 'all';
            const res = await fetch(`/api/logs?range=${range}`);
            const data = await res.json();
            const container = document.getElementById('chat-container');
            if (!container) return;

            container.innerHTML = data.logs.map(log => {
                const isAI = log.includes('[AI Response]');
                const isUser = log.includes('[Message Received]');
                const isBroadcast = log.includes('[BROADCAST START]');
                const time = log.match(/\[(.*?)\]/)?.[1] || "";
                
                // Sound Trigger Logic
                if (isUser) {
                    const timestamp = new Date(time).getTime();
                    if (lastProcessedTimestamp && timestamp > lastProcessedTimestamp) {
                        playNotification();
                    }
                    if (!lastProcessedTimestamp || timestamp > lastProcessedTimestamp) {
                        lastProcessedTimestamp = timestamp;
                    }
                }

                let content = log;
                if (isAI) content = log.split('[AI Response] to ')[1]?.split(': ')[1] || log;
                if (isUser) content = log.split('[Message Received] ')[1]?.split(': ')[1] || log;
                if (isBroadcast) content = `<div class="bg-sky-50 p-2 rounded-lg border border-sky-100 flex items-center gap-2 text-sky-700">
                    <i data-lucide="megaphone" class="w-3.5 h-3.5"></i>
                    <strong>BROADCAST:</strong> ${log.split('Message: ')[1] || ""}
                </div>`;

                if (isUser) {
                    return `<div class="message user shadow-soft animate-fade">
                                <div class="text-[10px] opacity-70 mb-1 font-bold">${time}</div>
                                <div>${content}</div>
                            </div>`;
                } else if (isAI) {
                    return `<div class="message bot shadow-soft animate-fade">
                                <div class="text-[10px] text-slate-400 mb-1 font-bold">${time}</div>
                                <div>${content}</div>
                            </div>`;
                }
                return `<div class="text-center text-[10px] text-slate-400 my-2">${content}</div>`;
            }).join('');
            
            container.scrollTop = container.scrollHeight;
            if (window.lucide) lucide.createIcons();
        } catch (e) {}
    }

    // --- BROADCAST ---
    async function fetchRecipients() {
        try {
            const range = document.getElementById('recipient-range')?.value || '7d';
            const res = await fetch(`/api/recipients?range=${range}`);
            if (res.status === 401 || res.url.includes('/login')) {
                window.location.href = '/login';
                return;
            }
            const data = await res.json();
            const container = document.getElementById('recipient-list');
            if (!container) return;

            if (data.recipients.length === 0) {
                container.innerHTML = '<div class="text-center py-10 text-slate-400 italic text-sm font-outfit uppercase tracking-widest">Tidak ada nomor baru ditemukan.</div>';
                return;
            }

            container.innerHTML = data.recipients.map(id => {
                const parts = id.split('@');
                const phone = parts[0];
                const type = parts[1]; // c.us or lid
                
                // Allow Indonesian 62... or newer long numeric IDs
                const isPossibleUser = /^\d{10,20}$/.test(phone);
                if (!isPossibleUser) return '';

                const isPhone = phone.startsWith('62') && phone.length < 15;
                const localNum = isPhone ? '0' + phone.slice(2) : '-';
                const displayNum = type === 'lid' ? `User ID: ${phone.substring(0, 8)}...` : `+${phone}`;
                
                return `
                <label class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-sky-50 dark:hover:bg-slate-700 hover:border-sky-200 transition-all group">
                    <input type="checkbox" name="recipient" value="${id}" class="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500">
                    <div class="flex-1">
                        <div class="text-sm font-bold text-slate-700 dark:text-white font-outfit">${displayNum}</div>
                        <div class="text-[10px] text-slate-400 font-semibold tracking-wide">${localNum} — ${type.toUpperCase()}</div>
                    </div>
                    <i data-lucide="${type === 'lid' ? 'user-check' : 'phone-forwarded'}" class="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-all"></i>
                </label>
            `; }).join('');
            
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error("Fetch Recipients Error:", e);
            const container = document.getElementById('recipient-list');
            if (container) container.innerHTML = '<div class="text-center py-10 text-rose-500 text-xs font-bold font-outfit uppercase tracking-widest">Sesi Berakhir atau Gangguan Server. <br>Silakan Login Ulang.</div>';
        }
    };

    window.toggleAllRecipients = () => {
        const checks = document.querySelectorAll('input[name="recipient"]');
        const allChecked = Array.from(checks).every(c => c.checked);
        checks.forEach(c => c.checked = !allChecked);
    };

    window.sendBroadcast = async () => {
        const msg = document.getElementById('broadcast-msg').value;
        const logRecipients = Array.from(document.querySelectorAll('input[name="recipient"]:checked')).map(c => c.value);
        const manualInput = document.getElementById('manual-ids').value;
        
        let manualRecipients = manualInput.split(',')
            .map(n => n.trim().replace(/[^0-9]/g, ''))
            .filter(n => n.length > 5)
            .map(n => n + '@c.us');

        const recipients = [...new Set([...logRecipients, ...manualRecipients])];
        
        if (!msg) return showNotification('Pesan siaran tidak boleh kosong!', 'error');
        if (recipients.length === 0) return showNotification('Pilih minimal 1 penerima!', 'error');

        if (!confirm(`Kirim pesan ke ${recipients.length} orang? \n(Log: ${logRecipients.length}, Manual: ${manualRecipients.length})`)) return;

        const btn = document.getElementById('broadcast-btn');
        const progressContainer = document.getElementById('broadcast-progress-container');
        const progressBar = document.getElementById('broadcast-progress-bar');
        const progressText = document.getElementById('broadcast-progress-text');

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="animate-spin w-5 h-5"></i><span>Memulai Siaran...</span>';
        if (window.lucide) lucide.createIcons();
        
        progressContainer.classList.remove('hidden');
        
        try {
            const res = await fetch('/api/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, recipients })
            });

            if (res.ok) {
                showNotification(`Siaran telah dimulai untuk ${recipients.length} penerima.`);
                
                // Simulated Progress UI (since server handles it in background)
                let count = 0;
                const total = recipients.length;
                
                const interval = setInterval(() => {
                    count++;
                    const percent = (count / total) * 100;
                    progressBar.style.width = `${percent}%`;
                    progressText.innerText = `${count} / ${total}`;
                    
                    if (count >= total) {
                        clearInterval(interval);
                        btn.disabled = false;
                        btn.innerHTML = '<i data-lucide="check" class="w-5 h-5"></i><span>Siaran Selesai!</span>';
                        setTimeout(() => {
                           btn.innerHTML = '<i data-lucide="send" class="w-5 h-5"></i><span>Kirim Siaran Lagi</span>';
                           progressContainer.classList.add('hidden');
                           progressBar.style.width = '0%';
                        }, 5000);
                        if (window.lucide) lucide.createIcons();
                    }
                }, 4000); // Average of 3-5s
            }
        } catch (e) {
            showNotification('Gagal mengirim siaran', 'error');
            btn.disabled = false;
        }
    };

    // --- ACTIONS ---
    window.syncSpreadsheet = async () => {
        const btn = document.getElementById('sync-btn');
        btn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Syncing...';
        btn.disabled = true;
        showGlobalProgress(true, 'Sinkronisasi Spreadsheet', 'Sedang mengambil data terbaru dari Google Sheets...');

        try {
            const res = await fetch('/api/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                const displayMsg = data.count ? data.count + ' entries' : (data.message || 'System Updated');
                showNotification('Sync Berhasil! Data: ' + displayMsg);
                fetchStatus();
                fetchKB();
            } else {
                showNotification('Gagal Sinkronisasi', 'error');
            }
        } catch (e) {
            showNotification('Gagal Sinkronisasi', 'error');
        } finally {
            btn.innerHTML = '🔄 Sync Spreadsheet';
            btn.disabled = false;
            showGlobalProgress(false);
        }
    };

    window.showNotification = (msg, type = 'success') => {
        const n = document.getElementById('notification');
        const content = n.querySelector('.noti-content');
        content.innerText = msg;
        n.classList.remove('hidden', 'translate-y-20');
        n.classList.add('flex', 'translate-y-0');
        
        setTimeout(() => {
            n.classList.add('translate-y-20');
            setTimeout(() => n.classList.add('hidden'), 300);
        }, 3000);
    };

    window.logout = () => {
        document.cookie = "auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/admin;";
        window.location.href = '/login';
    };

    window.toggleMute = () => {
        isMuted = !isMuted;
        const icon = document.getElementById('mute-icon');
        const btn = document.getElementById('mute-btn');
        
        if (isMuted) {
            icon.setAttribute('data-lucide', 'volume-x');
            btn.classList.add('text-slate-400');
            btn.classList.remove('text-rose-500', 'bg-rose-50');
        } else {
            icon.setAttribute('data-lucide', 'volume-2');
            btn.classList.remove('text-slate-400');
            btn.classList.add('text-emerald-500', 'bg-emerald-50');
            // Try playing once to "unlock" audio context
            const audio = document.getElementById('notif-sound');
            audio.play().catch(() => {});
            showNotification('Notifikasi Suara Aktif');
        }
        if (window.lucide) lucide.createIcons();
    };

    window.playNotification = () => {
        if (isMuted) return;
        const audio = document.getElementById('notif-sound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn("Audio play blocked", e));
        }
    };

    window.updateAiMode = async (mode) => {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aiMode: mode })
            });
            if (res.ok) {
                showNotification(`AI Mode diubah ke: ${mode.toUpperCase()}`);
                fetchStatus();
            }
        } catch (e) { showNotification('Gagal mengubah mode', 'error'); }
    };

    // --- SYSTEM HEALTH (Phase 10) ---
    async function fetchSystemHealth() {
        try {
            const res = await fetch('/api/system/health');
            const data = await res.json();
            
            // 1. Update Grid Kunci API
            const grid = document.getElementById('api-keys-grid');
            if (grid && data.keysStatus) {
                grid.innerHTML = data.keysStatus.map((k, i) => `
                    <div class="p-5 rounded-2xl border transition-all ${i === data.activeIndex ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-100'}">
                        <div class="flex justify-between items-start">
                            <div class="space-y-1">
                                <span class="text-[10px] font-black uppercase ${i === data.activeIndex ? 'text-sky-600' : 'text-slate-400'}">Key #${i+1}</span>
                                <div class="font-mono text-xs font-bold text-slate-700">${k.key}</div>
                            </div>
                            <span class="px-2 py-1 rounded-md text-[8px] font-black uppercase ${k.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}">
                                ${k.status}
                            </span>
                        </div>
                        <div class="mt-3 flex justify-between items-center">
                            <span class="text-[10px] text-slate-400">Errors: ${k.errors}</span>
                            ${i === data.activeIndex ? '<span class="text-[10px] font-bold text-sky-500 animate-pulse">ACTIVE NOW</span>' : ''}
                        </div>
                    </div>
                `).join('');
            }

            // 2. Update Error Logs
            const logBox = document.getElementById('system-error-logs');
            if (logBox && data.recentErrors) {
                if (data.recentErrors.length === 0) {
                    logBox.innerHTML = '<div class="opacity-30"># Tidak ada error terdeteksi. Sistem berjalan normal.</div>';
                } else {
                    logBox.innerHTML = data.recentErrors.map(e => `<div>> ${e}</div>`).join('');
                }
            }

            // 3. Update Stats
            document.getElementById('sys-model').innerText = data.modelUsed || "Gemini 1.5 Flash";
            document.getElementById('sys-key-idx').innerText = `#${(data.activeIndex || 0) + 1}`;
            
            const hours = Math.floor(data.uptime / 3600);
            const mins = Math.floor((data.uptime % 3600) / 60);
            document.getElementById('sys-uptime').innerText = `${hours}h ${mins}m`;

            // 4. Update Hardware Progress
            if (data.hardware) {
                const ramVal = data.hardware.ramUsage || 0;
                document.getElementById('sys-ram-val').innerText = `${ramVal}%`;
                document.getElementById('sys-ram-bar').style.width = `${ramVal}%`;
                // Color change based on usage
                const bar = document.getElementById('sys-ram-bar');
                if (ramVal > 85) bar.className = "bg-rose-500 h-full transition-all duration-500";
                else if (ramVal > 60) bar.className = "bg-amber-500 h-full transition-all duration-500";
                else bar.className = "bg-sky-500 h-full transition-all duration-500";
            }

            // 5. Update WhatsApp Status
            const waBadge = document.getElementById('sys-wa-status');
            if (waBadge && data.whatsapp) {
                waBadge.innerText = data.whatsapp;
                if (data.whatsapp === 'READY') {
                    waBadge.className = "px-2 py-1 rounded bg-emerald-100 text-[10px] font-black uppercase text-emerald-600";
                } else if (data.whatsapp === 'SCAN_QR') {
                    waBadge.className = "px-2 py-1 rounded bg-amber-100 text-[10px] font-black uppercase text-amber-600 animate-pulse";
                } else {
                    waBadge.className = "px-2 py-1 rounded bg-rose-100 text-[10px] font-black uppercase text-rose-600";
                }
            }

            // 6. Update Pause Status
            const pauseToggle = document.getElementById('bot-pause-toggle');
            if (pauseToggle) {
                // We invert the visual because checked = PAUSED (or RED), un-checked = RUNNING
                // Actually let's make it intuitive: Checked = ACTIVE/RUNNING, Unchecked = PAUSED
                pauseToggle.checked = !data.botPaused;
                
                const statusText = document.getElementById('pause-status-text');
                const iconBg = document.getElementById('pause-icon-bg');
                
                if (!data.botPaused) {
                    statusText.innerText = "SEDANG BERJALAN";
                    statusText.className = "text-[10px] text-emerald-600 font-bold";
                    iconBg.className = "w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600";
                    iconBg.innerHTML = '<i data-lucide="play" class="w-5 h-5"></i>';
                } else {
                    statusText.innerText = "BOT SEDANG DIJEDA";
                    statusText.className = "text-[10px] text-rose-600 font-bold";
                    iconBg.className = "w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600";
                    iconBg.innerHTML = '<i data-lucide="pause" class="w-5 h-5"></i>';
                }
                lucide.createIcons();
            }

            // 7. Update Health Checklist Icons (Updated for Multi-Model)
            const updateCheck = (id, ok) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (ok) {
                    el.innerHTML = '<i data-lucide="check-circle-2" class="w-3 h-3"></i> READY';
                    el.className = "font-bold text-emerald-500 flex items-center gap-1 transition-all";
                } else {
                    el.innerHTML = '<i data-lucide="x-circle" class="w-3 h-3"></i> ERROR';
                    el.className = "font-bold text-rose-500 flex items-center gap-1 transition-all";
                }
            };
            
            updateCheck('health-ds', data.deepseekReady);
            updateCheck('health-gemini', data.geminiReady);
            updateCheck('health-mistral', data.mistralReady);
            updateCheck('health-ollama', data.ollamaReady);
            updateCheck('health-vector', true);
            
            const uptimeMsg = `${hours}h ${mins}m`;
            document.getElementById('stat-uptime').innerText = uptimeMsg;
            
            // Sync Global Badges
            updateSystemBadges();
            lucide.createIcons();

        } catch (e) {
            console.error("Health fetch error", e);
        }
    }

    window.maintenanceCleanup = async () => {
        if (!confirm("🧹 Bersihkan sampah sistem sekarang? Ini akan mengosongkan log lama dan cache AI.")) return;
        try {
            const res = await fetch('/api/system/maintenance/clean', { method: 'POST' });
            const data = await res.json();
            showNotification(data.message, 'success');
            fetchSystemHealth();
        } catch (e) {
            showNotification("Gagal membersihkan sistem", "error");
        }
    };

    window.downloadLogs = () => {
        window.open('/api/system/logs/export');
    };

    window.toggleBotPause = async () => {
        try {
            const res = await fetch('/api/system/pause', { method: 'POST' });
            const data = await res.json();
            showNotification(data.paused ? "Bot Dijeda" : "Bot Berjalan Kembali", "info");
            fetchSystemHealth(); // Refresh UI
        } catch (e) {
            showNotification("Gagal mengubah status bot", "error");
        }
    };

    window.logout = async () => {
        if (!confirm("Konfirmasi: Apakah Anda ingin keluar dari dashboard?")) return;
        try {
            await fetch('/api/logout', { method: 'POST' });
            showNotification("Berhasil Keluar. Mengalihkan...", "success");
            setTimeout(() => {
                window.location.href = '/login';
            }, 500);
        } catch (e) {
            // Fallback: clear cookie client-side
            document.cookie = "auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = '/login';
        }
    };

    window.remoteRestart = async () => {
        if (!confirm("⚠️ Anda yakin ingin merestart bot sekarang? Ini akan mematikan proses sejenak (5-10 detik).")) return;
        
        try {
            const btn = event.currentTarget;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Restarting...</span>';
            lucide.createIcons();
            
            const res = await fetch('/api/system/restart', { method: 'POST' });
            const data = await res.json();
            showNotification(data.message, 'success');
            
            // Wait for reboot
            setTimeout(() => {
                location.reload();
            }, 7000);
        } catch (e) {
            showNotification("Gagal mengirim perintah restart", "error");
        }
    };

    // --- FORM ACTIONS ---
    window.addManual = async () => {
        const question = document.getElementById('manual-q').value;
        const answer = document.getElementById('manual-a').value;
        if (!question || !answer) return showNotification('Lengkapi data!', 'error');

        try {
            const res = await fetch('/api/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answer })
            });
            if (res.ok) {
                showNotification('Data tersimpan ke Sheets!');
                document.getElementById('manual-q').value = '';
                document.getElementById('manual-a').value = '';
                fetchStatus();
            }
        } catch (e) { showNotification('Error saving data', 'error'); }
    };

    window.fillManual = (query, answer = "") => {
        document.getElementById('manual-q').value = query;
        if (answer) document.getElementById('manual-a').value = answer;
        
        // Switch to Dashboard (the first tab) to see the input
        const dashboardTab = document.querySelectorAll('.nav-item')[0];
        if (dashboardTab) switchTab('dashboard', dashboardTab);
        document.getElementById('manual-q').focus();
    };

    window.toggleKB = (id) => {
        const el = document.getElementById(id);
        const icon = document.getElementById(`icon-${id}`);
        if (!el || !icon) return;
        
        const isHidden = el.classList.contains('hidden');
        
        if (isHidden) {
            el.classList.remove('hidden');
            icon.style.transform = 'rotate(180deg)';
        } else {
            el.classList.add('hidden');
            icon.style.transform = 'rotate(0deg)';
        }
    };

    // --- MODERATION LOGIC ---
    async function fetchReviews() {
        const container = document.getElementById('review-list');
        if (!container) return;

        try {
            const res = await fetch('/api/reviews');
            const data = await res.json();
            
            if (!data.reviews || data.reviews.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full py-20 text-center opacity-40 italic">
                        <i data-lucide="coffee" class="w-12 h-12 mx-auto mb-4"></i>
                        Semua niat sudah rapi dan jelas. Belum ada antrean moderasi baru.
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
                return;
            }

            container.innerHTML = data.reviews.map(r => `
                <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-soft space-y-4 animate-fade">
                    <div class="flex justify-between items-start">
                        <div class="px-3 py-1 bg-sky-50 text-sky-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                            Kemiripan ${(r.score * 100).toFixed(1)}%
                        </div>
                        <span class="text-[10px] text-slate-400 font-mono">${new Date(r.timestamp).toLocaleString()}</span>
                    </div>

                    <div class="space-y-3">
                        <div class="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                            <label class="text-[9px] font-bold text-purple-400 uppercase tracking-widest block mb-1">Pertanyaan Baru (User)</label>
                            <p class="text-sm font-bold text-purple-900">"${r.newQuestion}"</p>
                        </div>
                        <div class="flex justify-center -my-2 relative z-10">
                            <div class="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400">
                                <i data-lucide="git-branch" class="w-4 h-4"></i>
                            </div>
                        </div>
                        <div class="p-4 bg-sky-50 rounded-2xl border border-sky-100">
                            <label class="text-[9px] font-bold text-sky-400 uppercase tracking-widest block mb-1">Pengetahuan Terkait (Database)</label>
                            <p class="text-sm font-bold text-sky-900">"${r.matchedQuestion}"</p>
                            <p class="text-[10px] text-sky-600 mt-2 line-clamp-2 italic">A: ${r.existingAnswer}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <button onclick="window.submitReviewDecision(${r.id}, 'merged')" class="bg-sky-500 text-white rounded-xl py-3 text-xs font-bold hover:bg-sky-600 transition-all flex items-center justify-center gap-2">
                            <i data-lucide="merge" class="w-4 h-4"></i>
                            Ya, Gabungkan
                        </button>
                        <button onclick="window.submitReviewDecision(${r.id}, 'separate')" class="border border-slate-200 text-slate-600 rounded-xl py-3 text-xs font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
                            <i data-lucide="split" class="w-4 h-4"></i>
                            Beda, Pisahkan
                        </button>
                    </div>
                </div>
            `).join('');
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-10 text-rose-500 font-bold">Error: ${e.message}</div>`;
        }
    }

    window.submitReviewDecision = async (id, decision) => {
        try {
            const res = await fetch('/api/reviews/decision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, decision })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                showNotification(`✅ ${data.message}`);
                fetchReviews();
                setTimeout(fetchKB, 1500);
            }
        } catch (e) {
            showNotification(`❌ Gagal: ${e.message}`);
        }
    };

    // --- BACKLOG LOGIC ---
    async function fetchBacklog() {
        const container = document.getElementById('backlog-list');
        if (!container) return;

        try {
            const res = await fetch('/api/backlog');
            const data = await res.json();
            
            if (!data.backlog || data.backlog.length === 0) {
                container.innerHTML = `<div class="py-20 text-center opacity-40 italic">Semua antrean kosong. Pelayanan berjalan lancar!</div>`;
                return;
            }

            container.innerHTML = data.backlog.map(item => `
                <div class="bg-white p-8 rounded-3xl border border-slate-200 shadow-soft space-y-6 animate-fade">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center font-bold">
                                <i data-lucide="user" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800">${item.from}</h4>
                                <p class="text-[10px] text-slate-400 font-mono uppercase tracking-widest">${item.timestamp}</p>
                            </div>
                        </div>
                        <div class="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black italic">PENDING AS BUSY</div>
                    </div>

                    <div class="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                        <label class="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Pesan Warga:</label>
                        <p class="text-sm font-bold text-slate-800 italic">"${item.body}"</p>
                    </div>

                    <div class="space-y-4">
                        <textarea id="reply-${item.timestamp.replace(/\W/g,'')}" placeholder="Ketik jawaban resmi Anda di sini..." class="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-rose-500/20 outline-none transition-all resize-none"></textarea>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <button onclick="window.resolveBacklog('${item.from}', '${item.body}', '${item.timestamp}', 'resolve')" class="btn-premium py-4 justify-center">
                                <i data-lucide="send" class="w-4 h-4"></i>
                                Kirim & Masukkan Memori
                            </button>
                            <button onclick="window.resolveBacklog('${item.from}', '${item.body}', '${item.timestamp}', 'delete')" class="border border-slate-200 text-slate-400 rounded-2xl py-4 text-sm font-bold hover:bg-rose-50 hover:text-rose-500 transition-all">
                                Abaikan & Hapus
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            container.innerHTML = `<div class="p-10 text-rose-500 font-bold">Error: ${e.message}</div>`;
        }
    }

    window.resolveBacklog = async (from, body, timestamp, action) => {
        try {
            const safeId = timestamp.replace(/\W/g,'');
            const answer = document.getElementById(`reply-${safeId}`)?.value || "";
            if (action === 'resolve' && !answer) return showNotification("❌ Ketik jawaban dulu!");

            const res = await fetch('/api/backlog/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from, body, answer, timestamp, action })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                showNotification(`✅ ${data.message}`);
                fetchBacklog();
                if (action === 'resolve') setTimeout(fetchKB, 2000);
            }
        } catch (e) {
            showNotification(`❌ Error: ${e.message}`);
        }
    };

    // Periodic Check for Badges (Reviews & Backlog)
    async function updateSystemBadges() {
        try {
            // 1. Moderation Badge
            const rBadge = document.getElementById('review-badge');
            const rRes = await fetch('/api/reviews');
            const rData = await rRes.json();
            if (rData.reviews && rData.reviews.length > 0) {
                rBadge.innerText = rData.reviews.length;
                rBadge.classList.remove('hidden');
                rBadge.className = "absolute -top-1 -right-1 bg-sky-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce";
            } else {
                rBadge.classList.add('hidden');
            }

            // 2. Backlog Badge
            const bBadge = document.getElementById('backlog-badge');
            const bRes = await fetch('/api/backlog');
            const bData = await bRes.json();
            if (bData.backlog && bData.backlog.length > 0) {
                const count = bData.backlog.length;
                if (bBadge.innerText != count && !isMuted) playNotification();
                bBadge.innerText = count;
                bBadge.classList.remove('hidden');
                bBadge.className = "absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-pulse";
            } else {
                bBadge.classList.add('hidden');
            }
        } catch(e) {}
    }

    // Initialization
    fetchStatus();
    initCharts();
    fetchAnalytics();
    setInterval(fetchStatus, 10000);
    setInterval(fetchAnalytics, 15000);
    setInterval(updateSystemBadges, 8000);
});
