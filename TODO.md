# Role Persistence Fix - Implementation Plan

## Problem Summary
The role switching feature works on dashboard.html but resets to Job Seeker mode when navigating to other pages because:
1. Other pages have hardcoded static sidebars
2. No role detection logic exists in other pages
3. No shared role management system

## Solution Overview
Create a centralized role management system that persists across all pages using localStorage.

## Implementation Steps

### Step 1: Create Shared Role Management Script (js/roleManager.js)
- [x] 1.1 Create roleManager.js with:
  - [x] Function to get current role from localStorage
  - [x] Function to set role in localStorage
  - [x] Function to toggle between Job Seeker and Employer
  - [x] Function to update sidebar dynamically based on role
  - [x] Function to update UI (show/hide role-specific sections)

### Step 2: Update dashboard.html
- [x] 2.1 Include roleManager.js script
- [x] 2.2 Replace inline role functions with roleManager calls
- [x] 2.3 Add role initialization on page load

### Step 3: Update profile.html
- [x] 3.1 Include roleManager.js and CSS
- [x] 3.2 Add role toggle header
- [x] 3.3 Add dynamic sidebar (replace static with roleManager.updateSidebar())
- [x] 3.4 Create separate sections for Job Seeker Profile and Employer Profile
- [x] 3.5 Add role detection to show correct profile

### Step 4: Update reviews.html
- [x] 4.1 Include roleManager.js and CSS
- [x] 4.2 Add role toggle header
- [x] 4.3 Add dynamic sidebar
- [x] 4.4 Create separate sections for Job Seeker Reviews and Employer Reviews
- [x] 4.5 Add role detection to show correct reviews

### Step 5: Update applications.html
- [x] 5.1 Include roleManager.js and CSS
- [x] 5.2 Add role toggle header
- [x] 5.3 Add dynamic sidebar
- [x] 5.4 Show "My Applications" for Job Seeker / "Applicants" for Employer

### Step 6: Update browse-jobs.html
- [x] 6.1 Include roleManager.js and CSS
- [x] 6.2 Add role toggle header
- [x] 6.3 Add dynamic sidebar
- [x] 6.4 Show browse jobs for Job Seeker mode

### Step 7: Update tokens.html
- [x] 7.1 Include roleManager.js and CSS
- [x] 7.2 Add role toggle header
- [x] 7.3 Add dynamic sidebar
- [x] 7.4 Show tokens section for Job Seeker mode

## Files Modified/Created
1. ✅ js/roleManager.js (created new)
2. ✅ frontend/dashboard.html
3. ✅ frontend/profile.html
4. ✅ frontend/reviews.html
5. ✅ frontend/applications.html
6. ✅ frontend/browse-jobs.html
7. ✅ frontend/tokens.html

## Status: COMPLETED ✅

All tasks have been completed. The role persistence feature is now fully functional across all pages.

