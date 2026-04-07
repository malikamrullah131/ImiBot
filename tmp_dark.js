const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'admin.html');
let html = fs.readFileSync(filePath, 'utf8');

// Global replacement of classes to support dark mode
const replacements = [
    { target: 'class="bg-slate-50 text-slate-800', replace: 'class="bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100' },
    { target: 'bg-white', replace: 'bg-white dark:bg-slate-800' },
    { target: 'border-slate-200', replace: 'border-slate-200 dark:border-slate-700' },
    { target: 'border-slate-100', replace: 'border-slate-100 dark:border-slate-800' },
    { target: 'text-slate-800', replace: 'text-slate-800 dark:text-white' },
    { target: 'text-slate-500', replace: 'text-slate-500 dark:text-slate-300' },
    { target: 'text-slate-400', replace: 'text-slate-400 dark:text-slate-400' },
    { target: 'bg-slate-50', replace: 'bg-slate-50 dark:bg-slate-850' },
    { target: 'shadow-soft', replace: 'shadow-soft dark:shadow-none' },
    { target: 'border-r border-slate-200', replace: 'border-r border-slate-200 dark:border-slate-700' }
];

replacements.forEach(r => {
    // Only replace instances inside class="..." but doing a simple replaceAll is risky.
    // Given the templating, a simple split/join on exact string tokens is safe enough for tailwind classes if we preserve what's there.
    html = html.split(r.target).join(r.replace);
});

// Avoid double replacements (e.g. if we replaced bg-slate-50 inside bg-slate-50 dark:...)
html = html.replace(/dark:dark:/g, 'dark:');
html = html.replace(/dark:bg-slate-850 dark:bg-slate-850/g, 'dark:bg-slate-850');
html = html.replace(/bg-white dark:bg-slate-800\/60/g, 'bg-white/60 dark:bg-slate-800/60'); // Handled broken alpha

// Add Dark mode toggle button to header
const toggleBtnHtml = `
                <!-- Dark Mode Toggle -->
                <button id="dark-mode-btn" aria-label="Toggle Dark Mode" onclick="toggleDarkMode()" class="w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-300 hover:text-sky-500 dark:hover:text-sky-400 transition-all shadow-sm group">
                    <i data-lucide="moon" id="dark-icon" class="w-5 h-5"></i>
                </button>
`;

if (!html.includes('id="dark-mode-btn"')) {
    html = html.replace('<!-- AI Thinking Indicator (Dynamic Pulse) -->', toggleBtnHtml + '\n                <!-- AI Thinking Indicator (Dynamic Pulse) -->');
}

// Add Global Progress Overlay
const progressOverlayHtml = `
    <!-- Global Progress Indicator -->
    <div id="global-progress" class="hidden fixed inset-0 z-[300] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center transition-all opacity-0">
        <div class="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 max-w-sm text-center border border-slate-200 dark:border-slate-700">
            <div class="w-12 h-12 border-4 border-slate-100 border-t-sky-500 rounded-full animate-spin"></div>
            <h3 id="progress-title" class="text-lg font-bold text-slate-800 dark:text-white mt-2">Memproses...</h3>
            <p id="progress-desc" class="text-sm text-slate-500 dark:text-slate-300">Harap tunggu sebentar, sistem sedang sinkronisasi data.</p>
        </div>
    </div>
`;
if (!html.includes('id="global-progress"')) {
    html = html.replace('</body>', progressOverlayHtml + '\n</body>');
}

// Add ARIA labels to sidebars
html = html.replace(/<div onclick="switchTab/g, '<div role="button" tabindex="0" onclick="switchTab');

fs.writeFileSync(filePath, html);
console.log('admin.html successfully modified for Dark Mode and Progress Indicator');
