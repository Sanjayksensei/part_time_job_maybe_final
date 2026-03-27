/**
 * Role Manager - Centralized Role Management System
 * Enforces strict role-based access. No free toggling.
 * Uses userRole (from JWT/login) as the source of truth.
 */

function getCurrentRole() {
    return sessionStorage.getItem('userRole') || sessionStorage.getItem('currentView') || 'employee';
}

function getUserRoles() {
    const roles = sessionStorage.getItem('userRoles') || getCurrentRole();
    return roles.split(',');
}

function hasBothRoles() {
    const roles = getUserRoles();
    return roles.includes('employee') && roles.includes('employer');
}

function getActivePage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop().replace('.html', '');
    return filename || 'dashboard';
}

async function switchRole(newRole) {
    try {
        const data = await apiPost('/auth/switch-role', { role: newRole });
        // Update local storage with new token and role
        sessionStorage.setItem('authToken', data.token);
        sessionStorage.setItem('userRole', data.user.role);
        sessionStorage.setItem('currentView', data.user.role);
        sessionStorage.setItem('userRoles', data.user.roles || data.user.role);
        // Reload the page to reflect new role
        window.location.reload();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(err.error || 'Failed to switch role', 'error');
        } else {
            console.error('Switch role error:', err);
        }
    }
}

function updateSidebar() {
    const role = getCurrentRole();
    const currentPage = getActivePage();
    const navContainer = document.getElementById('sidebarNav');
    const bothRoles = hasBothRoles();
    
    if (!navContainer) return;
    
    let roleSwitchItem = '';
    if (bothRoles) {
        // User has both roles — show switch button
        const otherRole = role === 'employer' ? 'employee' : 'employer';
        const otherLabel = otherRole === 'employer' ? 'Employer' : 'Job Seeker';
        roleSwitchItem = `
            <li class="nav-item mt-3">
                <a href="#" class="nav-link text-info" onclick="switchRole('${otherRole}'); return false;">
                    <i class="fas fa-exchange-alt me-2"></i>Switch to ${otherLabel}
                </a>
            </li>
        `;
    } else {
        // User has only one role — show register button for the other
        const otherRole = role === 'employer' ? 'employee' : 'employer';
        const otherLabel = otherRole === 'employer' ? 'Employer' : 'Job Seeker';
        roleSwitchItem = `
            <li class="nav-item mt-3">
                <a href="register.html?addRole=${otherRole}" class="nav-link text-warning">
                    <i class="fas fa-user-plus me-2"></i>Register as ${otherLabel}
                </a>
            </li>
        `;
    }

    if (role === 'employer') {
        navContainer.innerHTML = `
            <li class="nav-item">
                <a href="dashboard.html" class="nav-link${currentPage === 'dashboard' ? ' active' : ''}">
                    <i class="fas fa-home me-2"></i>Dashboard
                </a>
            </li>
            <li class="nav-item">
                <a href="#" class="nav-link" onclick="if(typeof openPostJobModal === 'function') openPostJobModal(); else window.location.href='dashboard.html'">
                    <i class="fas fa-plus-circle me-2"></i>Post Job
                </a>
            </li>
            <li class="nav-item">
                <a href="applications.html" class="nav-link${currentPage === 'applications' ? ' active' : ''}">
                    <i class="fas fa-users me-2"></i>Applicants
                </a>
            </li>
            <li class="nav-item">
                <a href="tokens.html" class="nav-link${currentPage === 'tokens' ? ' active' : ''}">
                    <i class="fas fa-file-contract me-2"></i>Contracts
                </a>
            </li>
            <li class="nav-item">
                <a href="calendar.html" class="nav-link${currentPage === 'calendar' ? ' active' : ''}">
                    <i class="fas fa-calendar-alt me-2"></i>Calendar
                </a>
            </li>
            <li class="nav-item">
                <a href="profile.html" class="nav-link${currentPage === 'profile' ? ' active' : ''}">
                    <i class="fas fa-user me-2"></i>Profile
                </a>
            </li>
            <li class="nav-item">
                <a href="reviews.html" class="nav-link${currentPage === 'reviews' ? ' active' : ''}">
                    <i class="fas fa-star me-2"></i>Reviews
                </a>
            </li>
            <li class="nav-item">
                <a href="notifications.html" class="nav-link${currentPage === 'notifications' ? ' active' : ''}">
                    <i class="fas fa-bell me-2"></i>Notifications
                </a>
            </li>
            ${roleSwitchItem}
        `;
    } else {
        navContainer.innerHTML = `
            <li class="nav-item">
                <a href="dashboard.html" class="nav-link${currentPage === 'dashboard' ? ' active' : ''}">
                    <i class="fas fa-home me-2"></i>Dashboard
                </a>
            </li>
            <li class="nav-item">
                <a href="browse-jobs.html" class="nav-link${currentPage === 'browse-jobs' ? ' active' : ''}">
                    <i class="fas fa-search me-2"></i>Browse Jobs
                </a>
            </li>
            <li class="nav-item">
                <a href="applications.html" class="nav-link${currentPage === 'applications' ? ' active' : ''}">
                    <i class="fas fa-paper-plane me-2"></i>My Applications
                </a>
            </li>
            <li class="nav-item">
                <a href="tokens.html" class="nav-link${currentPage === 'tokens' ? ' active' : ''}">
                    <i class="fas fa-file-contract me-2"></i>Contracts
                </a>
            </li>
            <li class="nav-item">
                <a href="calendar.html" class="nav-link${currentPage === 'calendar' ? ' active' : ''}">
                    <i class="fas fa-calendar-alt me-2"></i>Calendar
                </a>
            </li>
                <a href="profile.html" class="nav-link${currentPage === 'profile' ? ' active' : ''}">
                    <i class="fas fa-user me-2"></i>Profile
                </a>
            </li>
            <li class="nav-item">
                <a href="reviews.html" class="nav-link${currentPage === 'reviews' ? ' active' : ''}">
                    <i class="fas fa-star me-2"></i>Reviews
                </a>
            </li>
            <li class="nav-item">
                <a href="notifications.html" class="nav-link${currentPage === 'notifications' ? ' active' : ''}">
                    <i class="fas fa-bell me-2"></i>Notifications
                </a>
            </li>
            ${roleSwitchItem}
        `;
    }
}

function initRole() {
    // Set the role indicator text on all pages
    const role = getCurrentRole();
    const roleText = document.getElementById('currentRoleText');
    if (roleText) {
        roleText.textContent = role === 'employer' ? 'Employer Mode' : 'Job Seeker Mode';
    }
    updateSidebar();
}

document.addEventListener('DOMContentLoaded', function() {
    initRole();
});
