const API_BASE = 'https://part-time-job-maybe-final.onrender.com';

function getToken() {
    return sessionStorage.getItem('authToken');
}

function getAuthHeaders() {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    return headers;
}

// Helper to parse error response — always returns a meaningful message
async function parseError(res) {
    if (res.status === 401) {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return { error: 'Session expired or logged in from another device. Please log in again.' };
    }
    try {
        const body = await res.json();
        return body; // { error: '...' }
    } catch (_) {
        return { error: `Server error (HTTP ${res.status}). Please try again.` };
    }
}

async function apiGet(endpoint) {
    try {
        const res = await fetch(API_BASE + endpoint, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw await parseError(res);
        return res.json();
    } catch (err) {
        if (err.error) throw err; // already parsed
        throw { error: 'Network error — check your connection or server.' };
    }
}

async function apiPost(endpoint, data) {
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await parseError(res);
        return res.json();
    } catch (err) {
        if (err.error) throw err;
        throw { error: 'Network error — check your connection or server.' };
    }
}

async function apiPut(endpoint, data) {
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await parseError(res);
        return res.json();
    } catch (err) {
        if (err.error) throw err;
        throw { error: 'Network error — check your connection or server.' };
    }
}

async function apiDelete(endpoint) {
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!res.ok) throw await parseError(res);
        return res.json();
    } catch (err) {
        if (err.error) throw err;
        throw { error: 'Network error — check your connection or server.' };
    }
}

// Auth guard — redirect to login if no token
function requireAuth() {
    if (!getToken()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Get current user role from sessionStorage
function getCurrentRole() {
    return sessionStorage.getItem('userRole') || sessionStorage.getItem('currentView') || 'employee';
}

// Alias for backwards compatibility
function getCurrentUserRole() {
    return getCurrentRole();
}

// Show toast notification (reusable)
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'check-circle' : type === 'info' ? 'info-circle' : 'times-circle';
    toast.innerHTML = `<i class="fas fa-${icon} me-2"></i>${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Global Confirmation Modal
function confirmAction(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.style.zIndex = '10000';

        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.maxWidth = '400px';
        modal.style.textAlign = 'center';
        modal.style.padding = '2rem';

        modal.innerHTML = `
            <div style="font-size: 3rem; color: var(--primary-color); margin-bottom: 1rem;">
                <i class="fas fa-question-circle"></i>
            </div>
            <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-dark);">Confirm Action</h3>
            <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.95rem;">${message}</p>
            <div style="display: flex; gap: 1rem; width: 100%;">
                <button class="btn btn-light" style="flex: 1;" id="btnConfirmNo">NO</button>
                <button class="btn btn-primary" style="flex: 1;" id="btnConfirmYes">YES</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = (result) => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 300);
        };

        modal.querySelector('#btnConfirmNo').onclick = () => close(false);
        modal.querySelector('#btnConfirmYes').onclick = () => close(true);
    });
}

// Logout
function logout() {
    sessionStorage.clear();
    window.location.href = '/frontend/login.html';
}

// 📱 Mobile Navigation Toggle Engine
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('mobile-open');
}
// Utility: Format DB Time (HH:MM:SS) to 12-hour AM/PM string
function formatTime(timeStr) {
    if (!timeStr) return '';
    try {
        const [h, m] = timeStr.split(':');
        const d = new Date();
        d.setHours(parseInt(h, 10), parseInt(m, 10));
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return timeStr;
    }
}

// ====== Inactivity Session Expiry Timer (1 Hour) ======
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
let inactivityTimer;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (getToken()) {
        inactivityTimer = setTimeout(() => {
            alert("Your session has expired due to 1 hour of inactivity. Please log in again.");
            sessionStorage.clear();
            window.location.href = 'login.html';
        }, INACTIVITY_TIMEOUT_MS);
    }
}

// Reset native timers universally mapping basic user behaviors
['click', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
});

document.addEventListener("DOMContentLoaded", resetInactivityTimer);

// ====== Dynamic Location Autocomplete System ======
let cachedLocations = null;

async function setupLocationAutocomplete(inputId, onSelectCallback) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    // Create dropdown wrapper globally securely locking structural alignment
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    wrapper.appendChild(inputEl);

    // Create shadow dropdown ul
    const dropdown = document.createElement('ul');
    dropdown.className = 'list-group position-absolute w-100 d-none shadow-sm';
    dropdown.style.zIndex = '1050';
    dropdown.style.maxHeight = '200px';
    dropdown.style.overflowY = 'auto';
    dropdown.style.top = '100%';
    dropdown.style.marginTop = '4px';
    wrapper.appendChild(dropdown);

    // Initial cache fetch securely grabbing all jobs natively directly
    if (!cachedLocations) {
        try {
            const res = await fetch(API_BASE + '/jobs/locations');
            const data = await res.json();
            cachedLocations = data.locations || [];
        } catch (e) {
            cachedLocations = [];
        }
    }

    inputEl.addEventListener('input', () => {
        const val = inputEl.value.trim().toLowerCase();
        dropdown.innerHTML = '';
        if (!val) {
            dropdown.classList.add('d-none');
            if (onSelectCallback) onSelectCallback();
            return;
        }

        const matches = cachedLocations.filter(l => l.toLowerCase().includes(val));
        if (matches.length > 0) {
            dropdown.classList.remove('d-none');
            matches.forEach(match => {
                const li = document.createElement('li');
                li.className = 'list-group-item list-group-item-action';
                li.style.cursor = 'pointer';
                li.textContent = match;
                li.onmousedown = (e) => {
                    e.preventDefault(); // preventing blur logic destroying modal instantly
                    inputEl.value = match;
                    dropdown.classList.add('d-none');
                    if (onSelectCallback) onSelectCallback();
                };
                dropdown.appendChild(li);
            });
        } else {
            dropdown.classList.add('d-none');
        }

        if (onSelectCallback) onSelectCallback();
    });

    inputEl.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.add('d-none'), 150);
    });

    inputEl.addEventListener('focus', () => {
        if (inputEl.value.trim() && dropdown.children.length > 0) {
            dropdown.classList.remove('d-none');
        } else if (!inputEl.value.trim() && cachedLocations && cachedLocations.length > 0) {
            // Show all when empty and focused explicitly mimicking generic dropdown behaviour flawlessly
            dropdown.innerHTML = '';
            dropdown.classList.remove('d-none');
            cachedLocations.forEach(match => {
                const li = document.createElement('li');
                li.className = 'list-group-item list-group-item-action';
                li.style.cursor = 'pointer';
                li.textContent = match;
                li.onmousedown = (e) => {
                    e.preventDefault();
                    inputEl.value = match;
                    dropdown.classList.add('d-none');
                    if (onSelectCallback) onSelectCallback();
                };
                dropdown.appendChild(li);
            });
        }
    });
}

// ====== Real-World Location Autocomplete System (Nominatim Maps API) ======
function setupRealLocationAutocomplete(inputId) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    wrapper.appendChild(inputEl);

    const dropdown = document.createElement('ul');
    dropdown.className = 'list-group position-absolute w-100 d-none shadow-sm';
    dropdown.style.zIndex = '1050';
    dropdown.style.maxHeight = '200px';
    dropdown.style.overflowY = 'auto';
    dropdown.style.top = '100%';
    dropdown.style.marginTop = '4px';
    wrapper.appendChild(dropdown);

    let debounceTimeout;

    inputEl.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        const val = inputEl.value.trim();
        dropdown.innerHTML = '';

        if (val.length < 2) {
            dropdown.classList.add('d-none');
            return;
        }

        // Show loading state securely
        dropdown.classList.remove('d-none');
        dropdown.innerHTML = '<li class="list-group-item text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Searching Maps...</li>';

        debounceTimeout = setTimeout(async () => {
            try {
                // Fetch public maps endpoint dynamically without CORS blockers
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&addressdetails=1&limit=5`;
                const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
                const data = await res.json();

                dropdown.innerHTML = '';
                if (data.length > 0) {
                    data.forEach(place => {
                        const li = document.createElement('li');
                        li.className = 'list-group-item list-group-item-action cursor-pointer';
                        li.style.cursor = 'pointer';

                        // Smart display formatting ("City, State, Country")
                        const parts = place.display_name.split(',');
                        let cleanName = place.display_name;
                        if (parts.length > 3) {
                            cleanName = `${parts[0].trim()}, ${parts[1].trim()}, ${parts[parts.length - 1].trim()}`;
                        }

                        li.innerHTML = `<i class="fas fa-map-marker-alt text-primary me-2"></i> ${cleanName}`;

                        li.onmousedown = (e) => {
                            e.preventDefault(); // Lock blur execution gracefully
                            inputEl.value = cleanName;
                            dropdown.classList.add('d-none');
                        };
                        dropdown.appendChild(li);
                    });
                } else {
                    dropdown.innerHTML = '<li class="list-group-item text-danger"><i class="fas fa-exclamation-circle me-2"></i>No real locations found</li>';
                }
            } catch (e) {
                console.error('Nominatim API error:', e);
                dropdown.innerHTML = '<li class="list-group-item text-danger"><i class="fas fa-wifi me-2"></i>Search failed check connection</li>';
            }
        }, 600); // 600ms debounce preventing API limits
    });

    inputEl.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('d-none'), 150));
    inputEl.addEventListener('focus', () => { if (inputEl.value.trim().length >= 2 && dropdown.children.length > 0) dropdown.classList.remove('d-none'); });
}
