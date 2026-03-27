// ------------------ LOGIN ------------------
function login() {
    // Auto-redirect to Job Seeker UI by default
    sessionStorage.setItem("role", "job_seeker");
    sessionStorage.setItem("currentView", "job_seeker");
    window.location.href = "dashboard.html";
}

// ------------------ DASHBOARD ROLE DISPLAY ------------------
function loadRole() {
    const role = sessionStorage.getItem("role");
    const display = document.getElementById("roleDisplay");

    if (display && role) {
        display.innerText = "Logged in as: " + role;
    }
}

// ------------------ LOGOUT ------------------
function logout() {
    sessionStorage.clear();
    window.location.href = "login.html";
}

// ------------------ APPLY JOB ------------------
function applyJob() {
    showToast("Application Submitted Successfully!");
}

// ------------------ SAVE PROFILE ------------------
function saveProfile() {
    showToast("Profile Updated Successfully!");
}

// ------------------ TOAST FUNCTION ------------------
function showToast(message) {
    alert(message);
}

// ------------------ AUTO LOAD FUNCTIONS ------------------
document.addEventListener("DOMContentLoaded", function() {
    loadRole();
});