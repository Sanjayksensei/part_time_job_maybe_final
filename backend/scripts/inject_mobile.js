const fs = require('fs');
const files = ['dashboard.html', 'profile.html', 'notifications.html', 'browse-jobs.html', 'employer-jobs.html', 'job-details.html', 'applications.html', 'tokens.html', 'calendar.html', 'reviews.html'];

const injection = `    <!-- Main Content -->
    <div class="main-content" style="margin-left: 250px; flex: 1;">
        <!-- Mobile Top Bar -->
        <div class="mobile-top-bar">
            <button class="btn-menu" aria-label="Menu" onclick="toggleMobileMenu()">
                <i class="fas fa-bars"></i>
            </button>
            <div class="mobile-brand"><i class="fas fa-briefcase"></i> Job Finder</div>
            <div class="mobile-user" style="opacity:0"><i class="fas fa-bars"></i></div>
        </div>
        <div class="sidebar-overlay" onclick="toggleMobileMenu()" id="sidebarOverlay"></div>`;

files.forEach(f => {
    const path = 'C:/Users/ADWAITH/OneDrive/Documents/part time job finder antigravity latest edition/frontend/' + f;
    try {
        let content = fs.readFileSync(path, 'utf8');
        // Simple accurate regex replacement
        content = content.replace(/<!-- Main Content -->\s*<div class="main-content" style="margin-left: 250px; flex: 1;">/, injection);
        fs.writeFileSync(path, content);
        console.log('✅ Updated ' + f);
    } catch(e) { console.error('❌ Failed ' + f, e); }
});
