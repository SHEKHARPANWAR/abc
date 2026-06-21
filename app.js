// Syrma SGS Equipment Management System - Supabase State Engine
// Time Reference: June 2026 and relative dynamic offsets
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase Connection Settings
const SUPABASE_URL = 'https://fdgrdnwwxonsalswlkqy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oAN3pbIZ5gcJq4eE_MUzTA_5NGzUyKT';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Dynamic user system with LocalStorage
let registeredUsers = JSON.parse(localStorage.getItem('sm_app_users')) || [];
let currentUser = JSON.parse(localStorage.getItem('sm_current_user')) || null;
let activeTab = 'equipment'; // 'equipment' or 'users'
let editingUserEmail = null; // Store which user is being edited in modal

const AVATAR_COLORS = [
  "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 font-extrabold shadow-[inset_0_0_8px_rgba(6,182,212,0.15)]",
  "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-extrabold shadow-[inset_0_0_8px_rgba(16,185,129,0.15)]",
  "bg-amber-500/10 border-amber-500/30 text-amber-400 font-extrabold shadow-[inset_0_0_8px_rgba(245,158,11,0.15)]",
  "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400 font-extrabold shadow-[inset_0_0_8px_rgba(217,70,239,0.15)]",
  "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 font-extrabold shadow-[inset_0_0_8px_rgba(99,102,241,0.15)]",
  "bg-teal-500/10 border-teal-500/30 text-teal-400 font-extrabold shadow-[inset_0_0_8px_rgba(20,184,166,0.15)]",
  "bg-rose-500/10 border-rose-500/30 text-rose-400 font-extrabold shadow-[inset_0_0_8px_rgba(244,63,94,0.15)]",
  "bg-violet-500/10 border-violet-500/30 text-violet-400 font-extrabold shadow-[inset_0_0_8px_rgba(139,92,246,0.15)]"
];

// State Management
let equipmentList = [];
let uploadedFilesCache = []; // Store temporary file objects during form filling
let activeEditAssetNumber = null; // Stored if editing an item
let currentSortColumn = 'assetNumber';
let currentSortDirection = 'asc';
let isDbConnected = false;

// Pre-fill helper for relative dates
function getRelativeDateString(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// Autocomplete suggestions databases
const departments = ["SMT Production", "Assembly Line", "Quality Control", "Research & Development", "Logistics", "Facility Facilities", "Calibration Bureau"];
const locations = ["SMT Room - Line 1", "SMT Room - Line 2", "Aisle B - Production Floor", "Aisle C - Production Floor", "Testing Bay - Quality Control", "R&D Lab 2", "Warehouse Storage B", "Cleanroom Alpha"];
const owners = ["Ramesh Kumar", "Jonathan Doe", "Srinivas Prasad", "Vidya Sharma", "Amrit Singh", "Karthik Subramanian", "Sarah Myers"];
const machineNames = [
  "Electrovert Wave Soldering Machine - Line 3",
  "Fuji NXT III SMT Pick and Place Unit",
  "Keysight ICT3070 In-Circuit Tester",
  "Tektronix MSO Series 6 Oscilloscope",
  "Heller 1913 MK5 Reflow Oven",
  "Vitronics Soltec MySelective Wave",
  "Yamaha YSM20R High-Speed SMT Mounter",
  "Koh Young KY8030 Solder Paste Inspection",
  "Omron VP9000 3D AOI System"
];

// Normalize data structure between camelCase / snake_case formats
function normalizeEquipment(item) {
  return {
    assetNumber: item.asset_number || item.assetNumber || '',
    serialNumber: item.serial_number || item.serialNumber || '',
    machineName: item.machine_name || item.machineName || '',
    calibrationDueDate: item.calibration_due_date || item.calibrationDueDate || '',
    location: item.location || '',
    equipmentOwner: item.equipment_owner || item.equipmentOwner || '',
    department: item.department || '',
    equipmentStatus: item.equipment_status || item.equipmentStatus || '',
    remarks: item.remarks || '',
    documents: Array.isArray(item.documents) ? item.documents : (typeof item.documents === 'string' ? JSON.parse(item.documents) : [])
  };
}

// Global UI Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const bgStyles = {
    success: 'from-emerald-500/10 to-teal-500/5 border-emerald-500 text-emerald-400 shadow-emerald-950/10',
    error: 'from-rose-500/10 to-red-500/5 border-rose-500 text-rose-400 shadow-rose-950/10',
    info: 'from-sky-500/10 to-blue-500/5 border-sky-500 text-sky-400 shadow-sky-950/10'
  };

  const toast = document.createElement('div');
  toast.className = `flex items-center gap-3 glass-panel px-4 py-3 rounded-lg border bg-gradient-to-r ${bgStyles[type]} shadow-lg transition-all duration-300 transform translate-y-2 opacity-50`;
  
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon} text-lg shrink-0"></i>
    <span class="text-sm font-medium leading-tight">${message}</span>
    <button class="ml-auto hover:text-white transition-colors" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-times text-xs"></i>
    </button>
  `;

  container.appendChild(toast);
  
  // Trigger transition
  setTimeout(() => {
    toast.className = toast.className.replace('translate-y-2 opacity-50', 'translate-y-0 opacity-100');
  }, 10);

  // Auto remove
  setTimeout(() => {
    toast.className = toast.className.replace('translate-y-0 opacity-100', 'translate-y-2 opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Compute dynamic calibration status categories
function getCalibrationStatus(item) {
  if (item.equipmentStatus === 'Retired') {
    return { label: 'Retired', code: 'retired', colorClass: 'text-slate-400', bgClass: 'bg-slate-500/10 border-slate-500/30 text-slate-300', ledGlow: 'led-glow-gray', rowClass: 'row-retired opacity-70 grayscale' };
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(item.calibrationDueDate);
  dueDate.setHours(0, 0, 0, 0);

  // 30 day warning window
  const warningWindow = new Date();
  warningWindow.setDate(today.getDate() + 30);
  warningWindow.setHours(0, 0, 0, 0);

  if (dueDate < today) {
    return { label: 'Overdue', code: 'overdue', colorClass: 'text-rose-400 font-semibold', bgClass: 'bg-rose-500/10 border-rose-500/30 text-rose-400', ledGlow: 'led-glow-red', rowClass: 'row-overdue' };
  } else if (dueDate <= warningWindow) {
    return { label: 'Due Soon', code: 'due-soon', colorClass: 'text-amber-400 font-semibold', bgClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400', ledGlow: 'led-glow-yellow', rowClass: 'row-due-soon' };
  } else {
    return { label: 'Valid', code: 'valid', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', ledGlow: 'led-glow-green', rowClass: 'row-valid' };
  }
}

// Update Database Connection Indicator in Header
function updateDbIndicator(status) {
  const icon = document.getElementById('dbLoaderIcon');
  const label = document.getElementById('dbStatusLabel');
  if (!icon || !label) return;

  if (status === 'connected') {
    icon.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 led-glow-green';
    label.textContent = 'SUPABASE CLOUD: CONNECTED';
    label.className = 'text-[9px] font-mono text-emerald-450 uppercase font-bold tracking-wide';
  } else if (status === 'error') {
    icon.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 led-glow-red animate-pulse';
    label.textContent = 'SUPABASE CLOUD: TABLE MISSING';
    label.className = 'text-[9px] font-mono text-rose-450 uppercase font-bold tracking-wide';
  } else if (status === 'loading') {
    icon.className = 'w-1.5 h-1.5 rounded-full bg-cyan-400 led-glow-cyan animate-ping';
    label.textContent = 'SUPABASE CLOUD: SECURE SYNCING...';
    label.className = 'text-[9px] font-mono text-cyan-400 uppercase font-bold tracking-wide';
  }
}

// Load Equipment database from Supabase
async function fetchEquipment() {
  updateDbIndicator('loading');
  try {
    const { data, error } = await supabase
      .from('equipment')
      .select('*');

    if (error) {
      throw error;
    }

    equipmentList = (data || []).map(normalizeEquipment);
    isDbConnected = true;
    updateDbIndicator('connected');
  } catch (e) {
    console.error("Supabase Database load error: ", e);
    isDbConnected = false;
    updateDbIndicator('error');
    equipmentList = [];
    showToast("Supabase table error. Run the SQL Schema Setup script below to build your 'equipment' table.", "error");
  }
}

// Authenticative State Engine & User Profiles Synchronization
function updateAuthUI() {
  const authContainer = document.getElementById('authContainer');
  const authenticatedWorkspace = document.getElementById('authenticatedWorkspace');
  const userProfileHeader = document.getElementById('userProfileHeader');
  
  const headerUserName = document.getElementById('headerUserName');
  const headerUserRole = document.getElementById('headerUserRole');
  const headerUserAvatar = document.getElementById('headerUserAvatar');
  
  const tabUserManagement = document.getElementById('tabUserManagement');
  const userCountBadge = document.getElementById('userCountBadge');
  
  if (currentUser) {
    // Check if current user is still in registered list and is disabled
    const exists = registeredUsers.find(u => u.email.toLowerCase() === currentUser.email.toLowerCase());
    if (exists && exists.disabled) {
      currentUser = null;
      localStorage.removeItem('sm_current_user');
      showToast("Security Notice: This account has been disabled by an Administrator.", "error");
      updateAuthUI();
      return;
    }
    
    if (authContainer) authContainer.classList.add('hidden');
    if (authenticatedWorkspace) authenticatedWorkspace.classList.remove('hidden');
    
    if (userProfileHeader) {
      userProfileHeader.classList.remove('hidden');
      userProfileHeader.classList.add('flex');
    }
    
    if (headerUserName) headerUserName.textContent = currentUser.fullName;
    if (headerUserRole) headerUserRole.textContent = currentUser.role;
    if (headerUserAvatar) {
      headerUserAvatar.textContent = currentUser.avatar || "U";
      headerUserAvatar.className = `w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs shadow-lg border select-none transition-transform hover:scale-105 duration-200 ${currentUser.avatarColor || AVATAR_COLORS[0]}`;
    }
    
    // Auto-fill owner input with the logged-in user for productivity
    const ownerInput = document.getElementById('equipmentOwner');
    if (ownerInput && !ownerInput.value.trim()) {
      ownerInput.value = currentUser.fullName;
    }
    
    // Check dynamic Admin permissions to render tab
    const isAdmin = currentUser.role === 'Admin';
    if (isAdmin) {
      if (tabUserManagement) {
        tabUserManagement.classList.remove('hidden');
        tabUserManagement.classList.add('flex');
      }
      if (userCountBadge) {
        userCountBadge.textContent = registeredUsers.length;
      }
    } else {
      if (tabUserManagement) {
        tabUserManagement.classList.add('hidden');
        tabUserManagement.classList.remove('flex');
      }
      // If non-admin somehow gets inside users tab, auto switch back to equipment SMT view
      if (activeTab === 'users') {
        activeTab = 'equipment';
      }
    }
    
    switchTabStateUI();
  } else {
    if (authContainer) authContainer.classList.remove('hidden');
    if (authenticatedWorkspace) authenticatedWorkspace.classList.add('hidden');
    if (userProfileHeader) {
      userProfileHeader.classList.add('hidden');
      userProfileHeader.classList.remove('flex');
    }
    if (tabUserManagement) {
      tabUserManagement.classList.add('hidden');
      tabUserManagement.classList.remove('flex');
    }
    
    // Pre-fill email on Login form if Remember Me is checked
    const rememberedEmail = localStorage.getItem('remembered_email');
    const emailInput = document.getElementById('loginEmail');
    const rememberCheckbox = document.getElementById('loginRemember');
    if (emailInput) {
      if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        if (rememberCheckbox) rememberCheckbox.checked = true;
      } else {
        emailInput.value = '';
        if (rememberCheckbox) rememberCheckbox.checked = false;
      }
    }
    const passwordInput = document.getElementById('loginPassword');
    if (passwordInput) passwordInput.value = '';
  }
}

// Global scope bindings for Auth / Register
window.switchAuthMode = function(mode) {
  const loginForm = document.getElementById('authLoginForm');
  const registerForm = document.getElementById('authRegisterForm');
  const tabLogin = document.getElementById('authTabLogin');
  const tabRegister = document.getElementById('authTabRegister');
  
  if (mode === 'login') {
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (tabLogin) tabLogin.className = "flex-1 pb-3 text-sm font-bold text-cyan-400 border-b-2 border-cyan-400 transition-colors uppercase tracking-wider cursor-pointer";
    if (tabRegister) tabRegister.className = "flex-1 pb-3 text-sm font-semibold text-slate-500 hover:text-slate-350 border-b-2 border-transparent transition-colors uppercase tracking-wider cursor-pointer";
  } else {
    if (loginForm) loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.remove('hidden');
    if (tabLogin) tabLogin.className = "flex-1 pb-3 text-sm font-semibold text-slate-500 hover:text-slate-350 border-b-2 border-transparent transition-colors uppercase tracking-wider cursor-pointer";
    if (tabRegister) tabRegister.className = "flex-1 pb-3 text-sm font-bold text-cyan-400 border-b-2 border-cyan-400 transition-colors uppercase tracking-wider cursor-pointer";
  }
};

window.handleLoginSubmit = function(event) {
  if (event) event.preventDefault();
  
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const rememberCheckbox = document.getElementById('loginRemember');
  
  if (!emailInput || !passwordInput) return;
  
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  
  const user = registeredUsers.find(u => u.email.toLowerCase() === email);
  if (!user) {
    showToast("Credentials mismatch: operator not found in Syrma SGS system.", "error");
    return;
  }
  
  if (user.password !== password) {
    showToast("Authentication Denied: incorrect operator password verification.", "error");
    return;
  }
  
  if (user.disabled) {
    showToast("Safety Notice: This operator profile is disabled. Contact Admin.", "error");
    return;
  }
  
  // Remember Me logic
  if (rememberCheckbox && rememberCheckbox.checked) {
    localStorage.setItem('remembered_email', email);
  } else {
    localStorage.removeItem('remembered_email');
  }
  
  currentUser = user;
  localStorage.setItem('sm_current_user', JSON.stringify(user));
  showToast(`Credentials verified. Welcome, ${user.fullName}!`, "success");
  
  passwordInput.value = '';
  updateAuthUI();
};

window.handleRegisterSubmit = function(event) {
  if (event) event.preventDefault();
  
  const fullNameInput = document.getElementById('regFullName');
  const employeeIdInput = document.getElementById('regEmployeeId');
  const roleSelect = document.getElementById('regRole');
  const emailInput = document.getElementById('regEmail');
  const passwordInput = document.getElementById('regPassword');
  const confirmPasswordInput = document.getElementById('regConfirmPassword');
  
  if (!fullNameInput || !employeeIdInput || !roleSelect || !emailInput || !passwordInput || !confirmPasswordInput) return;
  
  const fullName = fullNameInput.value.trim();
  const employeeId = employeeIdInput.value.trim().toUpperCase();
  const role = roleSelect.value;
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  if (fullName.length < 2) {
    showToast("ValidationError: Operator name must contain at least 2 letters.", "error");
    return;
  }
  if (!employeeId) {
    showToast("ValidationError: Employee ID cannot be empty.", "error");
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast("ValidationError: Please supply a valid corporate email.", "error");
    return;
  }
  if (password.length < 6) {
    showToast("ValidationError: Hardened password must be at least 6 characters.", "error");
    return;
  }
  if (password !== confirmPassword) {
    showToast("ValidationError: Password confirmation verify mismatch.", "error");
    return;
  }
  
  // Prevent duplicate emails
  const exists = registeredUsers.some(u => u.email.toLowerCase() === email);
  if (exists) {
    showToast("SecurityException: This email address is already bound to an active profile.", "error");
    return;
  }
  
  const avatarChar = fullName.charAt(0).toUpperCase() || "O";
  const avatarColorClass = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  
  const newUser = {
    id: 'usr-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    fullName,
    employeeId,
    role,
    email,
    password,
    disabled: false,
    avatar: avatarChar,
    avatarColor: avatarColorClass
  };
  
  registeredUsers.push(newUser);
  localStorage.setItem('sm_app_users', JSON.stringify(registeredUsers));
  
  showToast(`Profile registered successfully for operator ${fullName}.`, "success");
  
  // Clear inputs
  fullNameInput.value = '';
  employeeIdInput.value = '';
  emailInput.value = '';
  passwordInput.value = '';
  confirmPasswordInput.value = '';
  
  // Auto login
  currentUser = newUser;
  localStorage.setItem('sm_current_user', JSON.stringify(newUser));
  showToast(`Welcome! Operator session loaded automatically.`, "success");
  
  updateAuthUI();
};

window.handleLogout = function() {
  if (confirm("Confirm Session Terminate: Unsaved calibration metrics forms will be discarded.")) {
    currentUser = null;
    localStorage.removeItem('sm_current_user');
    showToast("Operator session closed. Logged out successfully.", "info");
    updateAuthUI();
  }
};

// Toggle navigation tabs SMT Equipment vs Operator management
window.switchThemeTab = function(tab) {
  if (!currentUser) return;
  if (tab === 'users' && currentUser.role !== 'Admin') {
    showToast("AccessViolation: permission denied. SMT User Hub console is locked.", "error");
    return;
  }
  activeTab = tab;
  switchTabStateUI();
};

function switchTabStateUI() {
  const tabEquipment = document.getElementById('tabEquipment');
  const tabUserManagement = document.getElementById('tabUserManagement');
  const dashboardHeaderPanel = document.getElementById('dashboard-header-panel');
  const kpiGrid = document.getElementById('kpiGrid');
  const workspaceGrid = document.getElementById('workspaceGrid');
  const userManagementPanel = document.getElementById('userManagementPanel');
  
  if (activeTab === 'users') {
    if (tabEquipment) {
      tabEquipment.className = "px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-350 border-b-2 border-transparent transition-all cursor-pointer flex items-center gap-2";
    }
    if (tabUserManagement) {
      tabUserManagement.className = "px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-400 border-b-2 border-cyan-400 transition-all cursor-pointer flex items-center gap-2 bg-slate-950/20 rounded-t";
    }
    
    if (dashboardHeaderPanel) dashboardHeaderPanel.classList.add('hidden');
    if (kpiGrid) kpiGrid.classList.add('hidden');
    if (workspaceGrid) workspaceGrid.classList.add('hidden');
    if (userManagementPanel) userManagementPanel.classList.remove('hidden');
    
    renderUsersList();
  } else {
    if (tabEquipment) {
      tabEquipment.className = "px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-400 border-b-2 border-cyan-400 transition-all cursor-pointer flex items-center gap-2 bg-slate-950/20 rounded-t";
    }
    if (tabUserManagement) {
      tabUserManagement.className = "px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-350 border-b-2 border-transparent transition-all cursor-pointer flex items-center gap-2";
    }
    
    if (dashboardHeaderPanel) dashboardHeaderPanel.classList.remove('hidden');
    if (kpiGrid) kpiGrid.classList.remove('hidden');
    if (workspaceGrid) workspaceGrid.classList.remove('hidden');
    if (userManagementPanel) userManagementPanel.classList.add('hidden');
    
    renderDashboard();
  }
}

// Users Directory Rendering inside Table console
function renderUsersList() {
  const tableBody = document.getElementById('usersTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  if (registeredUsers.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="6" class="px-4 py-8 text-center text-slate-500 italic bg-slate-950/25 rounded-md">
        No accounts registered on local SMT network database.
      </td>
    `;
    tableBody.appendChild(row);
    return;
  }
  
  registeredUsers.forEach(user => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-900/40 transition-colors border-b border-slate-850";
    
    const isCurrent = currentUser && user.email.toLowerCase() === currentUser.email.toLowerCase();
    const statusClass = user.disabled 
      ? 'bg-rose-500/10 border-rose-500/25 text-rose-400' 
      : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
    const statusLabel = user.disabled ? 'Disabled' : 'Enabled';
    
    tr.innerHTML = `
      <td class="px-4 py-3 pb-3.5 flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] border shadow select-none ${user.avatarColor || AVATAR_COLORS[0]}">
          ${user.avatar}
        </div>
        <div>
          <span class="font-bold text-slate-200 block">${user.fullName} ${isCurrent ? '<span class="text-[9px] text-cyan-400 font-mono font-medium ml-1 bg-cyan-950/50 px-1 border border-cyan-500/20 rounded">Logged</span>' : ''}</span>
        </div>
      </td>
      <td class="px-4 py-3 pb-3.5 font-mono text-[11px] text-slate-350">${user.employeeId}</td>
      <td class="px-4 py-3 pb-3.5 text-slate-400 select-all">${user.email}</td>
      <td class="px-4 py-3 pb-3.5 font-mono text-[#06B6D4] text-[10px] uppercase">${user.role}</td>
      <td class="px-4 py-3 pb-3.5">
        <span class="px-2 py-0.5 rounded-full text-[9px] border uppercase font-bold tracking-wider ${statusClass}">
          ${statusLabel}
        </span>
      </td>
      <td class="px-4 py-3 pb-3.5 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="openEditUserModal('${user.email}')" class="w-6 h-6 flex items-center justify-center bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-white rounded cursor-pointer transition-colors" title="Edit operator values">
            <i class="fa-solid fa-user-pen text-[10px]"></i>
          </button>
          <button onclick="toggleDisableUser('${user.email}')" class="w-6 h-6 flex items-center justify-center border rounded cursor-pointer transition-all ${user.disabled ? 'bg-emerald-550/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' : 'bg-slate-900 border-slate-800 text-slate-450 hover:text-rose-450 hover:border-rose-550/30'}" ${isCurrent ? 'disabled class="w-6 h-6 flex items-center justify-center bg-slate-950/60 border-slate-900 text-slate-700 rounded cursor-not-allowed"' : `title="${user.disabled ? 'Enable Profile' : 'Disable Profile'}"`}>
            <i class="fa-solid ${user.disabled ? 'fa-user-check' : 'fa-user-slash'} text-[10px]"></i>
          </button>
          <button onclick="deleteUser('${user.email}')" class="w-6 h-6 flex items-center justify-center bg-slate-900 border border-slate-850 hover:bg-rose-950/40 hover:border-rose-500/30 text-slate-450 hover:text-rose-450 rounded cursor-pointer transition-colors" ${isCurrent ? 'disabled class="w-6 h-6 flex items-center justify-center bg-slate-950/60 border-slate-900 text-slate-700 rounded cursor-not-allowed"' : 'title="Erase Profile"'}>
            <i class="fa-solid fa-trash-can text-[10px]"></i>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// User Modal setup
window.openCreateUserModal = function() {
  const modal = document.getElementById('adminUserModal');
  const modeInput = document.getElementById('adminUserMode');
  const title = document.getElementById('adminUserModalTitle');
  const icon = document.getElementById('adminUserModalIcon');
  const passContainer = document.getElementById('adminUserPasswordContainer');
  const passInput = document.getElementById('adminUserPassword');
  const submitBtn = document.getElementById('adminUserModalSubmitBtn');
  
  if (modeInput) modeInput.value = 'create';
  if (title) title.textContent = "Register Operator Profile";
  if (icon) icon.className = "fa-solid fa-user-plus text-cyan-400";
  if (passContainer) passContainer.classList.remove('hidden');
  if (passInput) {
    passInput.required = true;
    passInput.value = '';
    const label = document.getElementById('adminUserPasswordLabel');
    if (label) label.innerHTML = 'Password <span class="text-rose-500">*</span>';
  }
  if (submitBtn) submitBtn.textContent = 'Add System User';
  
  // Clear other fields
  const names = document.getElementById('adminUserFullName');
  const ids = document.getElementById('adminUserEmployeeId');
  const emails = document.getElementById('adminUserEmail');
  const roles = document.getElementById('adminUserRole');
  if (names) names.value = '';
  if (ids) ids.value = '';
  if (emails) emails.value = '';
  if (roles) roles.value = 'Lead Inspector';
  
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.openEditUserModal = function(email) {
  const user = registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;
  
  const modal = document.getElementById('adminUserModal');
  const modeInput = document.getElementById('adminUserMode');
  const oldEmailInput = document.getElementById('adminUserOldEmail');
  const title = document.getElementById('adminUserModalTitle');
  const icon = document.getElementById('adminUserModalIcon');
  const passContainer = document.getElementById('adminUserPasswordContainer');
  const passInput = document.getElementById('adminUserPassword');
  const submitBtn = document.getElementById('adminUserModalSubmitBtn');
  
  const names = document.getElementById('adminUserFullName');
  const ids = document.getElementById('adminUserEmployeeId');
  const emails = document.getElementById('adminUserEmail');
  const roles = document.getElementById('adminUserRole');
  if (names) names.value = user.fullName;
  if (ids) ids.value = user.employeeId;
  if (emails) emails.value = user.email;
  if (roles) roles.value = user.role;
  
  if (oldEmailInput) oldEmailInput.value = user.email;
  if (modeInput) modeInput.value = 'edit';
  if (title) title.textContent = "Modify Operator Particulars";
  if (icon) icon.className = "fa-solid fa-user-pen text-cyan-400";
  
  if (passInput) {
    passInput.required = false;
    passInput.value = '';
    const label = document.getElementById('adminUserPasswordLabel');
    if (label) label.innerHTML = 'Password <span class="text-slate-500 text-[9px]">(Leave blank to keep unaltered)</span>';
  }
  if (passContainer) passContainer.classList.remove('hidden');
  if (submitBtn) submitBtn.textContent = 'Commit Alterations';
  
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.closeAdminUserModal = function() {
  const modal = document.getElementById('adminUserModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.handleAdminUserSubmit = function(event) {
  if (event) event.preventDefault();
  
  const modeInput = document.getElementById('adminUserMode');
  const mode = modeInput ? modeInput.value : 'create';
  
  const oldEmailInput = document.getElementById('adminUserOldEmail');
  const oldEmail = oldEmailInput ? oldEmailInput.value : '';
  
  const fullName = document.getElementById('adminUserFullName').value.trim();
  const employeeId = document.getElementById('adminUserEmployeeId').value.trim().toUpperCase();
  const role = document.getElementById('adminUserRole').value;
  const email = document.getElementById('adminUserEmail').value.trim().toLowerCase();
  
  if (fullName.length < 2) {
    showToast("Operator name must contains at least 2 characters.", "error");
    return;
  }
  
  // Duplication check
  const duplicate = registeredUsers.some(u => u.email.toLowerCase() === email && (mode === 'create' || u.email.toLowerCase() !== oldEmail.toLowerCase()));
  if (duplicate) {
    showToast("Duplication check failed: this email address is already registered.", "error");
    return;
  }
  
  if (mode === 'create') {
    const password = document.getElementById('adminUserPassword').value;
    if (password.length < 6) {
      showToast("Weak password. SMT security directives mandate at least 6 characters.", "error");
      return;
    }
    
    const avatarChar = fullName.charAt(0).toUpperCase() || "X";
    const avatarColorClass = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    
    const newUser = {
      id: 'usr-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      fullName,
      employeeId,
      role,
      email,
      password,
      disabled: false,
      avatar: avatarChar,
      avatarColor: avatarColorClass
    };
    
    registeredUsers.push(newUser);
    showToast(`Registered system operator profile for ${fullName}.`, "success");
  } else {
    // Editing existing operator
    const user = registeredUsers.find(u => u.email.toLowerCase() === oldEmail.toLowerCase());
    if (user) {
      user.fullName = fullName;
      user.employeeId = employeeId;
      user.role = role;
      user.email = email;
      user.avatar = fullName.charAt(0).toUpperCase() || "X";
      
      const newPassword = document.getElementById('adminUserPassword').value;
      if (newPassword) {
        if (newPassword.length < 6) {
          showToast("Password too weak. Please use at least 6 characters.", "error");
          return;
        }
        user.password = newPassword;
      }
      
      // Update our logged in profile if modifying itself
      if (currentUser && currentUser.email.toLowerCase() === oldEmail.toLowerCase()) {
        currentUser = { ...currentUser, ...user };
        localStorage.setItem('sm_current_user', JSON.stringify(currentUser));
      }
      showToast(`Saved operator particulars for ${fullName}.`, "success");
    }
  }
  
  localStorage.setItem('sm_app_users', JSON.stringify(registeredUsers));
  closeAdminUserModal();
  updateAuthUI();
  renderUsersList();
};

window.toggleDisableUser = function(email) {
  if (currentUser && currentUser.email.toLowerCase() === email.toLowerCase()) {
    showToast("Safety Lock: You cannot disable your own operational operator account.", "error");
    return;
  }
  
  const user = registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;
  
  user.disabled = !user.disabled;
  localStorage.setItem('sm_app_users', JSON.stringify(registeredUsers));
  showToast(`Operator ${user.fullName} access status toggled to ${user.disabled ? 'Suspended' : 'Operational'}.`, "success");
  renderUsersList();
};

window.deleteUser = function(email) {
  if (currentUser && currentUser.email.toLowerCase() === email.toLowerCase()) {
    showToast("Safety Lock: You cannot delete your own operational operator account.", "error");
    return;
  }
  
  const user = registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return;
  
  if (confirm(`CRITICAL SYSTEM AUDITING ACTION: Do you want to completely erase user account for ${user.fullName}? All logging signatures remains trace offline.`)) {
    registeredUsers = registeredUsers.filter(u => u.email.toLowerCase() !== email.toLowerCase());
    localStorage.setItem('sm_app_users', JSON.stringify(registeredUsers));
    showToast(`Operator record has been permanently purged.`, "success");
    
    // Update badge quantity
    const userCountBadge = document.getElementById('userCountBadge');
    if (userCountBadge) userCountBadge.textContent = registeredUsers.length;
    
    renderUsersList();
  }
};

// Initialize Application UI Setup
async function initApp() {
  const tomorrow = getRelativeDateString(1);
  const dateInput = document.getElementById('calibrationDueDate');
  if (dateInput) {
    dateInput.value = tomorrow;
    dateInput.min = getRelativeDateString(-365);
  }
  
  setupEventListeners();
  updateAuthUI();
  await fetchEquipment();
  renderDashboard();
  setupAutocompletes();
}

// Setup Event Listeners
function setupEventListeners() {
  // Handle Table Search
  const searchBar = document.getElementById('globalSearch');
  const tableSearch = document.getElementById('tableSearch');
  
  const handleSearchEvent = (e) => {
    const term = e.target.value;
    if (searchBar) searchBar.value = term;
    if (tableSearch) tableSearch.value = term;
    renderTable(term);
  };

  if (searchBar) searchBar.addEventListener('input', handleSearchEvent);
  if (tableSearch) tableSearch.addEventListener('input', handleSearchEvent);

  // Drag and Drop Logic
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => e.preventDefault(), false);
      document.body.addEventListener(eventName, (e) => e.preventDefault(), false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('border-cyan-400', 'bg-cyan-500/5');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('border-cyan-400', 'bg-cyan-500/5');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      handleUploadedFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
      handleUploadedFiles(e.target.files);
    });
  }

  // Equipment Form Submit
  const form = document.getElementById('equipmentForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleFormSubmit();
    });

    const cancelBtn = document.getElementById('cancelFormBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        resetForm();
      });
    }
  }

  // Export Buttons
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCSV);
  document.getElementById('exportExcelBtn')?.addEventListener('click', exportExcel);
  document.getElementById('printListBtn')?.addEventListener('click', () => window.print());

  // Seeder button
  document.getElementById('seedSampleDataBtn')?.addEventListener('click', seedSampleDevices);

  // Sorting Header Event Listeners
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
      }
      
      document.querySelectorAll('th[data-sort] i').forEach(ico => ico.className = 'fa-solid fa-sort text-slate-600 ml-1 text-xs');
      const activeIco = th.querySelector('i');
      if (activeIco) {
        activeIco.className = `fa-solid ${currentSortDirection === 'asc' ? 'fa-sort-up text-cyan-400' : 'fa-sort-down text-cyan-400'} ml-1 text-xs`;
      }
      renderTable();
    });
  });

  // Modal background dismissing capture
  window.addEventListener('click', (e) => {
    const detailModal = document.getElementById('detailModal');
    const printModal = document.getElementById('printModal');
    const adminUserModal = document.getElementById('adminUserModal');
    if (e.target === detailModal) closeDetailModal();
    if (e.target === printModal) closePrintModal();
    if (e.target === adminUserModal) window.closeAdminUserModal();
  });
}

// File Attachment System
function handleUploadedFiles(files) {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (!allowedTypes.includes(file.type)) {
      showToast(`Invalid file type: ${file.name}. Only PDF, JPG, and PNG accepted.`, 'error');
      continue;
    }
    
    uploadedFilesCache.push({
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified
    });
  }
  
  renderUploadChips();
  showToast(`Attached ${files.length} certification file(s) to metadata.`, 'info');
}

function renderUploadChips() {
  const container = document.getElementById('uploadChips');
  if (!container) return;
  
  container.innerHTML = '';
  if (uploadedFilesCache.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  
  uploadedFilesCache.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'flex items-center gap-2 bg-slate-900 border border-slate-700 hover:border-cyan-500 px-3 py-1.5 rounded-md text-xs transition-colors duration-200';
    
    const iconClass = file.type === 'application/pdf' ? 'fa-file-pdf text-rose-500' : 'fa-file-image text-cyan-400';
    
    chip.innerHTML = `
      <i class="fa-solid ${iconClass}"></i>
      <span class="max-w-[120px] truncate text-slate-300 font-medium">${file.name}</span>
      <button type="button" class="text-slate-500 hover:text-cyan-400 transition-colors ml-1 focus:outline-none cursor-pointer" onclick="removeUploadedFile(${index})">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(chip);
  });
}

window.removeUploadedFile = function(index) {
  uploadedFilesCache.splice(index, 1);
  renderUploadChips();
};

// Form Autocompletes Setup
function setupAutocompletes() {
  createAutocomplete('department', departments);
  createAutocomplete('location', locations);
  createAutocomplete('equipmentOwner', owners);
  createAutocomplete('machineName', machineNames);
}

function createAutocomplete(inputId, dataset) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const wrapper = input.parentElement;
  
  const suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'autocomplete-suggestions hidden';
  wrapper.appendChild(suggestionsDiv);

  input.addEventListener('input', () => {
    const text = input.value.trim().toLowerCase();
    suggestionsDiv.innerHTML = '';

    if (!text) {
      suggestionsDiv.classList.add('hidden');
      return;
    }

    const matches = dataset.filter(val => val.toLowerCase().includes(text));

    if (matches.length === 0) {
      suggestionsDiv.classList.add('hidden');
      return;
    }

    suggestionsDiv.classList.remove('hidden');
    matches.forEach(match => {
      const row = document.createElement('div');
      row.className = 'autocomplete-item';
      
      const index = match.toLowerCase().indexOf(text);
      if (index >= 0) {
        const start = match.substring(0, index);
        const middle = match.substring(index, index + text.length);
        const end = match.substring(index + text.length);
        row.innerHTML = `${start}<strong class="text-cyan-400 font-semibold">${middle}</strong>${end}`;
      } else {
        row.textContent = match;
      }

      row.addEventListener('click', () => {
        input.value = match;
        suggestionsDiv.classList.add('hidden');
        input.classList.remove('border-red-500');
        input.classList.add('border-emerald-500');
      });
      suggestionsDiv.appendChild(row);
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== suggestionsDiv) {
      suggestionsDiv.classList.add('hidden');
    }
  });
}

// QR Code SVG Simulation generator
function generateMockQRCodeSVG(data, color = "#06B6D4") {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="w-full h-full">
      <rect width="100" height="100" fill="transparent"/>
      <rect x="5" y="5" width="22" height="22" fill="${color}" stroke="#FFFFFF" stroke-width="1.5"/>
      <rect x="9" y="9" width="14" height="14" fill="#0F172A"/>
      <rect x="12" y="12" width="8" height="8" fill="${color}"/>
      
      <rect x="73" y="5" width="22" height="22" fill="${color}" stroke="#FFFFFF" stroke-width="1.5"/>
      <rect x="77" y="9" width="14" height="14" fill="#0F172A"/>
      <rect x="80" y="12" width="8" height="8" fill="${color}"/>
      
      <rect x="5" y="73" width="22" height="22" fill="${color}" stroke="#FFFFFF" stroke-width="1.5"/>
      <rect x="9" y="77" width="14" height="14" fill="#0F172A"/>
      <rect x="12" y="80" width="8" height="8" fill="${color}"/>

      <rect x="35" y="5" width="10" height="6" fill="${color}"/>
      <rect x="55" y="10" width="8" height="12" fill="${color}"/>
      <rect x="40" y="15" width="12" height="4" fill="${color}"/>
      <rect x="35" y="24" width="24" height="6" fill="${color}"/>

      <rect x="5" y="35" width="6" height="12" fill="${color}"/>
      <rect x="15" y="50" width="12" height="6" fill="${color}"/>
      <rect x="35" y="35" width="16" height="16" fill="${color}"/>
      <rect x="55" y="32" width="28" height="8" fill="${color}"/>

      <rect x="73" y="45" width="12" height="12" fill="${color}"/>
      <rect x="88" y="54" width="8" height="14" fill="${color}"/>

      <rect x="35" y="58" width="8" height="24" fill="${color}"/>
      <rect x="48" y="70" width="12" height="18" fill="${color}"/>
      
      <rect x="68" y="73" width="18" height="8" fill="${color}"/>
      <rect x="80" y="84" width="16" height="12" fill="${color}"/>
      
      <rect x="30" y="10" width="2" height="2" fill="#FFFFFF"/>
      <rect x="45" y="45" width="3" height="3" fill="#FFFFFF"/>
      <text x="50" y="94" font-family="'IBM Plex Mono', monospace" font-size="7" fill="#64748B" text-anchor="middle" font-weight="bold">${data}</text>
    </svg>
  `;
}

// Main Render Loop for KPIs and Dashboard stats
function renderDashboard() {
  const listToUse = equipmentList;
  
  const totalEquipment = listToUse.length;
  const activeEquipment = listToUse.filter(item => item.equipmentStatus === 'Active').length;
  
  let calibrationDueSoon = 0;
  let overdueCalibration = 0;

  listToUse.forEach(item => {
    const stat = getCalibrationStatus(item);
    if (stat.code === 'due-soon') calibrationDueSoon++;
    if (stat.code === 'overdue') overdueCalibration++;
  });

  updateDomText('kpiTotal', totalEquipment);
  updateDomText('kpiActive', activeEquipment);
  updateDomText('kpiDueSoon', calibrationDueSoon);
  updateDomText('kpiOverdue', overdueCalibration);

  const totalCountEl = document.getElementById('kpiTotal');
  if (totalCountEl) totalCountEl.classList.add('animate-pulse');
  setTimeout(() => totalCountEl?.classList.remove('animate-pulse'), 1000);

  renderTable();
}

function updateDomText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Render Core Table Rows with Dynamic Search & Sort Support
function renderTable(searchTerm = '') {
  const tableBody = document.getElementById('equipmentTableBody');
  const emptyState = document.getElementById('emptyState');
  const tableContainer = document.getElementById('equipmentTableContainer');
  
  if (!tableBody) return;

  const term = searchTerm.trim().toLowerCase();
  let filtered = equipmentList.filter(item => {
    return (
      item.assetNumber.toLowerCase().includes(term) ||
      item.serialNumber.toLowerCase().includes(term) ||
      item.machineName.toLowerCase().includes(term) ||
      item.location.toLowerCase().includes(term) ||
      item.equipmentOwner.toLowerCase().includes(term) ||
      item.department.toLowerCase().includes(term) ||
      (item.remarks && item.remarks.toLowerCase().includes(term))
    );
  });

  filtered.sort((a, b) => {
    let valA = a[currentSortColumn] ? a[currentSortColumn].toString().toLowerCase() : '';
    let valB = b[currentSortColumn] ? b[currentSortColumn].toString().toLowerCase() : '';

    if (currentSortColumn === 'calibrationDueDate') {
      valA = new Date(a.calibrationDueDate).getTime();
      valB = new Date(b.calibrationDueDate).getTime();
    }

    if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    if (tableContainer) tableContainer.classList.add('hidden');
    if (emptyState) {
      emptyState.classList.remove('hidden');
      const messageSpan = emptyState.querySelector('.empty-message');
      const seedBtn = document.getElementById('seedSampleDataBtn');
      
      if (messageSpan) {
        if (searchTerm) {
          messageSpan.textContent = `No equipment matches the search term "${searchTerm}". Try modifying your query.`;
          if (seedBtn) seedBtn.classList.add('hidden');
        } else {
          messageSpan.textContent = "No equipment found in Supabase. You can register your first asset manually or seed demo machines!";
          if (seedBtn) seedBtn.classList.remove('hidden');
        }
      }
    }
    return;
  }

  if (tableContainer) tableContainer.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  tableBody.innerHTML = '';
  
  filtered.forEach(item => {
    const statusInfo = getCalibrationStatus(item);
    
    const tr = document.createElement('tr');
    tr.id = `row-${item.assetNumber}`;
    tr.className = `border-b border-slate-800/60 hover:bg-slate-900/40 transition-colors duration-150 relative ${statusInfo.rowClass}`;
    
    const formattedDate = new Date(item.calibrationDueDate).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit'
    });

    let docMarkup = '';
    if (item.documents && item.documents.length > 0) {
      const hasPdf = item.documents.some(d => d.type === 'application/pdf');
      const hasImage = item.documents.some(d => d.type.startsWith('image/'));
      
      docMarkup += `<div class="flex items-center gap-1.5 text-slate-400">`;
      if (hasPdf) docMarkup += `<i class="fa-solid fa-file-pdf text-rose-500" title="PDF Certificate"></i>`;
      if (hasImage) docMarkup += `<i class="fa-solid fa-file-image text-cyan-400" title="Equipment Diagram Image"></i>`;
      docMarkup += `<span class="text-xs font-semibold">${item.documents.length}</span></div>`;
    } else {
      docMarkup = `<span class="text-slate-600 text-xs">None</span>`;
    }

    tr.innerHTML = `
      <td class="px-4 py-3 text-center">
        <button onclick="openPrintModal('${item.assetNumber}')" class="text-cyan-400 hover:text-white transition-all cursor-pointer hover:scale-115 shrink-0" title="Print QR Label">
          <i class="fa-solid fa-qrcode text-lg"></i>
        </button>
      </td>
      <td class="px-4 py-3 font-mono text-cyan-400 text-sm font-semibold tracking-wide">${item.assetNumber}</td>
      <td class="px-4 py-3 font-mono text-xs text-slate-300">${item.serialNumber}</td>
      <td class="px-4 py-3 text-slate-200">
        <div class="font-medium">${item.machineName}</div>
        <div class="text-xs text-slate-500">${item.department}</div>
      </td>
      <td class="px-4 py-3 text-sm">
        <div class="text-slate-200">${formattedDate}</div>
        <div class="text-xs ${statusInfo.colorClass} flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full ${statusInfo.bgClass.split(' ')[0]} ${statusInfo.ledGlow}"></span>
          ${statusInfo.label}
        </div>
      </td>
      <td class="px-4 py-3 text-sm text-slate-300">
        <i class="fa-solid fa-location-dot text-slate-500 text-xs mr-1"></i>${item.location}
      </td>
      <td class="px-4 py-3 text-sm text-slate-300">
        <i class="fa-solid fa-user-gear text-slate-500 text-xs mr-1"></i>${item.equipmentOwner}
      </td>
      <td class="px-4 py-3 text-center">${docMarkup}</td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${statusInfo.bgClass}">
          ${item.equipmentStatus}
        </span>
      </td>
      <td class="px-4 py-3 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button id="viewBtn-${item.assetNumber}" onclick="openDetailModal('${item.assetNumber}')" class="btn-icon text-sky-400 hover:text-white hover:bg-sky-500/10 p-1.5 rounded" title="View Details">
            <i class="fa-solid fa-eye text-sm"></i>
          </button>
          <button id="editBtn-${item.assetNumber}" onclick="editEquipment('${item.assetNumber}')" class="btn-icon text-amber-400 hover:text-white hover:bg-amber-500/10 p-1.5 rounded" title="Edit Element">
            <i class="fa-solid fa-pen text-sm"></i>
          </button>
          ${currentUser && currentUser.role === 'Admin' ? `
          <button id="deleteBtn-${item.assetNumber}" onclick="deleteEquipment('${item.assetNumber}')" class="btn-icon text-rose-500 hover:text-white hover:bg-rose-500/10 p-1.5 rounded" title="Remove Asset">
            <i class="fa-solid fa-trash text-sm"></i>
          </button>
          ` : ''}
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// Add/Update Equipment Logic (Validation & Submission to Supabase)
async function handleFormSubmit() {
  const assetNumberEl = document.getElementById('assetNumber');
  const serialNumberEl = document.getElementById('serialNumber');
  const machineNameEl = document.getElementById('machineName');
  const calibrationDueDateEl = document.getElementById('calibrationDueDate');
  const locationEl = document.getElementById('location');
  const equipmentOwnerEl = document.getElementById('equipmentOwner');
  const departmentEl = document.getElementById('department');
  const equipmentStatusEl = document.getElementById('equipmentStatus');
  const remarksEl = document.getElementById('remarks');

  const fields = [
    { el: assetNumberEl, name: "Asset Number" },
    { el: serialNumberEl, name: "Serial Number" },
    { el: machineNameEl, name: "Machine Name" },
    { el: calibrationDueDateEl, name: "Calibration Due Date" },
    { el: locationEl, name: "Location" },
    { el: equipmentOwnerEl, name: "Equipment Owner" },
    { el: departmentEl, name: "Department" }
  ];

  let isValid = true;

  fields.forEach(f => {
    if (!f.el.value.trim()) {
      f.el.classList.add('border-red-500', 'bg-red-500/5', 'focus:ring-red-500');
      f.el.classList.remove('border-slate-800', 'border-emerald-500');
      isValid = false;
    } else {
      f.el.classList.remove('border-red-500', 'bg-red-500/5');
      f.el.classList.add('border-emerald-500');
    }
  });

  if (!isValid) {
    showToast("Please fill in all required validation fields properly.", "error");
    return;
  }

  const candidateAssetNum = assetNumberEl.value.trim().toUpperCase();
  
  const payload = {
    assetNumber: candidateAssetNum,
    serialNumber: serialNumberEl.value.trim(),
    machineName: machineNameEl.value.trim(),
    calibrationDueDate: calibrationDueDateEl.value,
    location: locationEl.value.trim(),
    equipmentOwner: equipmentOwnerEl.value.trim(),
    department: departmentEl.value.trim(),
    equipmentStatus: equipmentStatusEl.value,
    remarks: remarksEl.value.trim(),
    documents: [...uploadedFilesCache]
  };

  // Map to snake_case for DB columns standard
  const dbPayload = {
    asset_number: payload.assetNumber,
    serial_number: payload.serialNumber,
    machine_name: payload.machineName,
    calibration_due_date: payload.calibrationDueDate,
    location: payload.location,
    equipment_owner: payload.equipmentOwner,
    department: payload.department,
    equipment_status: payload.equipmentStatus,
    remarks: payload.remarks,
    documents: payload.documents
  };

  showToast("Saving asset to Supabase cloud...", "info");

  if (activeEditAssetNumber !== null) {
    // Retain older attached documents if the cached array is empty (standard practice)
    if (payload.documents.length === 0) {
      const idx = equipmentList.findIndex(e => e.assetNumber === activeEditAssetNumber);
      if (idx !== -1) {
        dbPayload.documents = equipmentList[idx].documents || [];
      }
    }

    // Try Standard snake_case Update first, fallback to CamelCase
    const { error } = await supabase
      .from('equipment')
      .update(dbPayload)
      .eq('asset_number', activeEditAssetNumber);

    if (error) {
      console.warn("Retrying with camelCase properties update", error);
      const { error: errorCamel } = await supabase
        .from('equipment')
        .update({
          assetNumber: payload.assetNumber,
          serialNumber: payload.serialNumber,
          machineName: payload.machineName,
          calibrationDueDate: payload.calibrationDueDate,
          location: payload.location,
          equipmentOwner: payload.equipmentOwner,
          department: payload.department,
          equipmentStatus: payload.equipmentStatus,
          remarks: payload.remarks,
          documents: payload.documents
        })
        .eq('assetNumber', activeEditAssetNumber);

      if (errorCamel) {
        showToast(`Database Update Failed: ${errorCamel.message}`, "error");
        return;
      }
    }
    showToast(`Asset ${candidateAssetNum} successfully optimized and saved.`, "success");
  } else {
    // New entry creation uniqueness check
    const exists = equipmentList.some(item => item.assetNumber.toUpperCase() === candidateAssetNum);
    if (exists) {
      assetNumberEl.classList.add('border-red-500', 'bg-red-500/5');
      showToast(`Asset number ${candidateAssetNum} already registered in memory!`, "error");
      return;
    }

    // Try Standard snake_case Insertion first, fallback to CamelCase
    const { error } = await supabase
      .from('equipment')
      .insert([dbPayload]);

    if (error) {
      console.warn("Retrying insert with camelCase columns", error);
      const camelPayload = {
        assetNumber: payload.assetNumber,
        serialNumber: payload.serialNumber,
        machineName: payload.machineName,
        calibrationDueDate: payload.calibrationDueDate,
        location: payload.location,
        equipmentOwner: payload.equipmentOwner,
        department: payload.department,
        equipmentStatus: payload.equipmentStatus,
        remarks: payload.remarks,
        documents: payload.documents
      };
      
      const { error: errorCamel } = await supabase
        .from('equipment')
        .insert([camelPayload]);

      if (errorCamel) {
        showToast(`Database Insert Failed: ${errorCamel.message}. Check SQL schema block.`, "error");
        return;
      }
    }
    showToast(`Asset ${candidateAssetNum} registered in Supabase securely!`, "success");
  }

  resetForm();
  await fetchEquipment();
  renderDashboard();
}

function resetForm() {
  const form = document.getElementById('equipmentForm');
  if (form) form.reset();
  
  uploadedFilesCache = [];
  renderUploadChips();
  
  const inputs = document.querySelectorAll('#equipmentForm input, #equipmentForm textarea, #equipmentForm select');
  inputs.forEach(inp => {
    inp.classList.remove('border-emerald-500', 'border-red-500', 'bg-red-500/5');
  });

  activeEditAssetNumber = null;
  const submitBtn = document.getElementById('submitFormBtn');
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="fa-solid fa-plus-circle mr-2"></i>Register Equipment`;
  }
  const heading = document.getElementById('formHeading');
  if (heading) {
    heading.textContent = 'Add New Production Asset';
  }

  const dateInput = document.getElementById('calibrationDueDate');
  if (dateInput) {
    dateInput.value = getRelativeDateString(1);
  }
  
  const assetNumberEl = document.getElementById('assetNumber');
  if (assetNumberEl) {
    assetNumberEl.removeAttribute('readonly');
    assetNumberEl.classList.remove('bg-slate-900/60');
  }
}

// Edit Equipment (Loads database model into editor)
window.editEquipment = function(assetNo) {
  const item = equipmentList.find(itm => itm.assetNumber === assetNo);
  if (!item) return;

  activeEditAssetNumber = assetNo;
  window.scrollTo({ top: document.getElementById('equipmentRegisterFormContainer')?.offsetTop - 80 || 0, behavior: 'smooth' });

  const assetNumberEl = document.getElementById('assetNumber');
  if (assetNumberEl) {
    assetNumberEl.value = item.assetNumber;
    assetNumberEl.setAttribute('readonly', 'true');
    assetNumberEl.classList.add('bg-slate-900/60');
  }
  
  document.getElementById('serialNumber').value = item.serialNumber;
  document.getElementById('machineName').value = item.machineName;
  document.getElementById('calibrationDueDate').value = item.calibrationDueDate;
  document.getElementById('location').value = item.location;
  document.getElementById('equipmentOwner').value = item.equipmentOwner;
  document.getElementById('department').value = item.department;
  document.getElementById('equipmentStatus').value = item.equipmentStatus;
  document.getElementById('remarks').value = item.remarks || '';

  uploadedFilesCache = [...(item.documents || [])];
  renderUploadChips();

  const submitBtn = document.getElementById('submitFormBtn');
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-2"></i>Save Structural Changes`;
  }
  const heading = document.getElementById('formHeading');
  if (heading) {
    heading.textContent = `Modifying Active Asset Registry [${assetNo}]`;
  }
  
  showToast(`Loaded ${assetNo} into the editor.`, "info");
};

// Delete Equipment Registry from Supabase
window.deleteEquipment = async function(assetNo) {
  const isAdmin = currentUser && currentUser.role === 'Admin';
  if (!isAdmin) {
    showToast("AccessViolation: Permission denied. Delete operations are reserved for Administrators.", "error");
    return;
  }

  if (confirm(`Are you absolutely sure you want to remove Asset [${assetNo}] from your Supabase SQL database?`)) {
    showToast("Deleting asset...", "info");
    const { error } = await supabase
      .from('equipment')
      .delete()
      .eq('asset_number', assetNo);
      
    if (error) {
      console.warn("Retrying delete using camelCase ID", error);
      const { error: errorCamel } = await supabase
        .from('equipment')
        .delete()
        .eq('assetNumber', assetNo);

      if (errorCamel) {
        showToast(`Database deletion failed: ${errorCamel.message}`, "error");
        return;
      }
    }
    
    showToast(`Asset [${assetNo}] removed from Supabase permanently.`, "success");
    await fetchEquipment();
    renderDashboard();
    
    if (activeEditAssetNumber === assetNo) {
      resetForm();
    }
  }
};

// Seed sample equipment dataset for demonstration purposes
async function seedSampleDevices() {
  if (!confirm("Would you like to seed 4 high-tech default electronics equipment records directly to your Supabase tables?")) {
    return;
  }

  const seedData = [
    {
      asset_number: "EQ-2026-001",
      serial_number: "SGS-WS-99021",
      machine_name: "Electrovert Wave Soldering Machine - Line 3",
      calibration_due_date: getRelativeDateString(56),
      location: "Aisle B - Production Floor",
      equipment_owner: "Ramesh Kumar",
      department: "Assembly Line",
      equipment_status: "Active",
      remarks: "Perfect working condition. pre-heater calibration certified compliance.",
      documents: [{ name: "wave_caliber_cert.pdf", type: "application/pdf" }]
    },
    {
      asset_number: "EQ-2026-002",
      serial_number: "SGS-PP-44012",
      machine_name: "Fuji NXT III SMT Pick and Place Unit",
      calibration_due_date: getRelativeDateString(12),
      location: "SMT Room - Line 1",
      equipment_owner: "Jonathan Doe",
      department: "SMT Production",
      equipment_status: "Active",
      remarks: "Highly critical microchip placement unit. Nozzle calibration active.",
      documents: [{ name: "fuji_nozzle_log.png", type: "image/png" }]
    },
    {
      asset_number: "EQ-2026-003",
      serial_number: "SGS-CT-10931",
      machine_name: "Keysight ICT3070 In-Circuit Tester",
      calibration_due_date: getRelativeDateString(-8),
      location: "Testing Bay - Quality Control",
      equipment_owner: "Srinivas Prasad",
      department: "Quality Control",
      equipment_status: "Calibration Pending",
      remarks: "Overdue safety compliance certificate. Recalibration scheduled by QC inspectors.",
      documents: [{ name: "expired_reports.pdf", type: "application/pdf" }]
    },
    {
      asset_number: "EQ-2026-004",
      serial_number: "SGS-OS-00481",
      machine_name: "Tektronix MSO Series 6 Oscilloscope",
      calibration_due_date: getRelativeDateString(180),
      location: "R&D Lab 2",
      equipment_owner: "Vidya Sharma",
      department: "Research & Development",
      equipment_status: "Active",
      remarks: "Central checkout asset stored in lab locker compartment.",
      documents: []
    }
  ];

  showToast("Seeding sample data to Supabase...", "info");
  
  // Try snake_case batch inserts
  const { error } = await supabase
    .from('equipment')
    .insert(seedData);

  if (error) {
    console.warn("Snake case insertion failed, trying camelCase format", error);
    const camelSeeds = seedData.map(item => ({
      assetNumber: item.asset_number,
      serialNumber: item.serial_number,
      machineName: item.machine_name,
      calibrationDueDate: item.calibration_due_date,
      location: item.location,
      equipmentOwner: item.equipment_owner,
      department: item.department,
      equipmentStatus: item.equipment_status,
      remarks: item.remarks,
      documents: item.documents
    }));

    const { error: errorCamel } = await supabase
      .from('equipment')
      .insert(camelSeeds);

    if (errorCamel) {
      showToast(`Seeding failed: ${errorCamel.message}. Make sure table exists using query template.`, "error");
      return;
    }
  }

  showToast("Sample instruments successfully seeded to your database!", "success");
  await fetchEquipment();
  renderDashboard();
}

// DETAIL MODAL LOGIC
window.openDetailModal = function(assetNo) {
  const item = equipmentList.find(itm => itm.assetNumber === assetNo);
  if (!item) return;

  const modal = document.getElementById('detailModal');
  if (!modal) return;

  const statusInfo = getCalibrationStatus(item);
  const formattedDate = new Date(item.calibrationDueDate).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: '2-digit'
  });

  document.getElementById('modalAssetNo').textContent = item.assetNumber;
  document.getElementById('modalTitle').textContent = item.machineName;
  document.getElementById('modalSerialNo').textContent = item.serialNumber;
  
  const statusBadge = document.getElementById('modalStatusBadge');
  if (statusBadge) {
    statusBadge.textContent = item.equipmentStatus;
    statusBadge.className = `px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.bgClass}`;
  }

  const calBadge = document.getElementById('modalCalBadge');
  if (calBadge) {
    calBadge.textContent = `${statusInfo.label} (Due ${formattedDate})`;
    calBadge.className = `ml-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.bgClass} border`;
  }

  document.getElementById('modalOwner').textContent = item.equipmentOwner;
  document.getElementById('modalDept').textContent = item.department;
  document.getElementById('modalLoc').textContent = item.location;
  document.getElementById('modalRemarks').textContent = item.remarks || 'No detailed log remarks listed.';

  const qrBox = document.getElementById('modalQRBox');
  if (qrBox) {
    qrBox.innerHTML = generateMockQRCodeSVG(`${item.assetNumber}|${item.serialNumber}`);
  }

  const docList = document.getElementById('modalDocList');
  if (docList) {
    docList.innerHTML = '';
    if (item.documents && item.documents.length > 0) {
      item.documents.forEach((doc, idx) => {
        const docDiv = document.createElement('div');
        docDiv.className = 'p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-3 text-sm';
        
        const isPdf = doc.type === 'application/pdf';
        const docIconClass = isPdf ? 'fa-file-pdf text-rose-500 text-xl' : 'fa-file-image text-cyan-400 text-xl';
        
        docDiv.innerHTML = `
          <div class="flex items-center gap-2">
            <i class="fa-solid ${docIconClass} shrink-0"></i>
            <span class="text-slate-300 font-medium truncate max-w-[200px]">${doc.name}</span>
          </div>
          <button type="button" onclick="previewDoc('${doc.name}', '${doc.type}')" class="px-2.5 py-1 text-xs shrink-0 bg-cyan-500/10 hover:bg-cyan-500 hover:text-white transition-colors duration-200 text-cyan-400 rounded-md font-semibold cursor-pointer">
            <i class="fa-solid fa-eye mr-1"></i>Preview
          </button>
        `;
        docList.appendChild(docDiv);
      });
    } else {
      docList.innerHTML = `
        <div class="col-span-2 text-center text-xs text-slate-500 py-3 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          No external calibration documents attached to this database asset.
        </div>
      `;
    }
  }

  const editBtn = document.getElementById('modalActionEdit');
  const printBtn = document.getElementById('modalActionPrint');
  
  if (editBtn) {
    editBtn.onclick = () => {
      closeDetailModal();
      editEquipment(item.assetNumber);
    };
  }
  if (printBtn) {
    printBtn.onclick = () => {
      closeDetailModal();
      openPrintModal(item.assetNumber);
    };
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

window.closeDetailModal = function() {
  const modal = document.getElementById('detailModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  const docPreviewFrameContainer = document.getElementById('docPreviewFrameContainer');
  if (docPreviewFrameContainer) {
    docPreviewFrameContainer.classList.add('hidden');
    docPreviewFrameContainer.innerHTML = '';
  }
};

// Document Preview Logic
window.previewDoc = function(name, type) {
  const container = document.getElementById('docPreviewFrameContainer');
  if (!container) return;
  
  container.innerHTML = '';
  container.classList.remove('hidden');
  
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3';
  header.innerHTML = `
    <span class="text-xs font-semibold text-cyan-400 tracking-wide uppercase"><i class="fa-solid fa-magnifying-glass-chart mr-1.5"></i>Live File Sandbox: ${name}</span>
    <button onclick="document.getElementById('docPreviewFrameContainer').classList.add('hidden')" class="text-slate-500 hover:text-white text-xs cursor-pointer"><i class="fa-solid fa-times"></i> Dismiss Sandbox</button>
  `;
  container.appendChild(header);

  let docVisualDiv = document.createElement('div');
  docVisualDiv.className = 'w-full bg-slate-950 rounded-lg p-5 border border-slate-800 text-center flex flex-col items-center justify-center';
  
  const isPdf = type === 'application/pdf';

  if (isPdf) {
    docVisualDiv.innerHTML = `
      <div class="py-10 max-w-sm flex flex-col items-center gap-3">
        <i class="fa-solid fa-file-pdf text-slate-700 text-5xl"></i>
        <div class="text-slate-200 text-sm font-semibold">Simulated Calibration Compliance Certificate PDF</div>
        <p class="text-xs text-slate-500">ISO/IEC 17025 accredited laboratory calibration report verified for traceabilities.</p>
        <div class="w-full h-1.5 bg-slate-900 overflow-hidden rounded relative">
          <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-cyan-400 shimmer w-full"></div>
        </div>
        <div class="text-emerald-400 font-mono text-[10px] font-bold"><i class="fa-solid fa-shield-check mr-1 text-xs"></i>SECURE DIGITALLY SIGNED CERTIFICATE VERIFIED</div>
      </div>
    `;
  } else {
    docVisualDiv.innerHTML = `
      <div class="p-3 w-full flex flex-col items-center justify-center gap-2">
        <div class="text-xs text-slate-500 mb-1 max-w-xs uppercase font-mono tracking-wide">IMAGE RETRIEVED FROM CALIBRATION ARCHIVES</div>
        <div class="relative w-48 h-48 border border-cyan-500/20 rounded bg-slate-900 flex items-center justify-center overflow-hidden">
          <i class="fa-solid fa-microchip text-[#06B6D4]/30 text-8xl absolute"></i>
          <div class="relative text-xs text-center px-4 font-sans text-slate-300">
            <i class="fa-solid fa-circle-check text-cyan-400 text-2xl mb-2"></i>
            <div>Equipment Alignment Verified</div>
            <div class="font-mono text-[9px] text-[#06B6D4] mt-1">RESOLUTION STABLE</div>
          </div>
        </div>
        <span class="text-xs text-slate-400 mt-2">Diagram status verification report: <strong class="text-slate-300">${name}</strong></span>
      </div>
    `;
  }
  container.appendChild(docVisualDiv);
  container.scrollIntoView({ behavior: "smooth" });
};

// THERMAL PRINT MODAL LOGIC
window.openPrintModal = function(assetNo) {
  const item = equipmentList.find(itm => itm.assetNumber === assetNo);
  if (!item) return;

  const modal = document.getElementById('printModal');
  if (!modal) return;

  document.getElementById('lblAssetNo').textContent = item.assetNumber;
  document.getElementById('lblMachineName').textContent = item.machineName;
  document.getElementById('lblSerialNo').textContent = item.serialNumber;
  document.getElementById('lblLocation').textContent = item.location;
  
  const formatDate = new Date(item.calibrationDueDate).toLocaleDateString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  
  document.getElementById('lblDueDate').textContent = formatDate;

  const printQR = document.getElementById('lblQRCode');
  if (printQR) {
    printQR.innerHTML = generateMockQRCodeSVG(`${item.assetNumber}`, '#000000');
  }

  const finalActPrint = document.getElementById('finalActionPrint');
  if (finalActPrint) {
    finalActPrint.onclick = () => {
      const printContents = document.getElementById('thermalLabelPrintArea').innerHTML;
      
      const printWin = window.open('', '', 'width=600,height=400');
      if (printWin) {
        printWin.document.write(`
          <html>
            <head>
              <title>Print Label - ${item.assetNumber}</title>
              <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@600;700&family=Inter:wght@500;700&display=swap" rel="stylesheet" />
              <style>
                body {
                  margin: 0;
                  padding: 10px;
                  font-family: 'Inter', sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  background: white;
                }
                .label-box {
                  width: 100mm;
                  height: 50mm;
                  border: 2px solid #000;
                  padding: 8px;
                  box-sizing: border-box;
                  display: flex;
                  flex-direction: row;
                  background: white;
                  color: black;
                }
                .label-content {
                  flex: 1;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                  font-size: 10px;
                  line-height: 1.25;
                }
                .label-title {
                  font-size: 11px;
                  font-weight: 700;
                  text-transform: uppercase;
                  border-bottom: 2px solid #000;
                  padding-bottom: 3px;
                  margin-bottom: 3px;
                }
                .grid-info {
                  display: grid;
                  grid-template-columns: auto 1fr;
                  gap: 1px 6px;
                }
                .grid-lbl {
                  font-weight: 700;
                  font-size: 9px;
                  text-transform: uppercase;
                }
                .grid-val {
                  color: #222;
                }
                .mono-font {
                  font-family: 'IBM Plex Mono', monospace;
                  font-weight: 700;
                  font-size: 11px;
                }
                .footer-stamp {
                  font-size: 8px;
                  font-weight: 700;
                  border-top: 1px solid #777;
                  padding-top: 2px;
                  margin-top: 3px;
                }
                .label-qr {
                  width: 80px;
                  height: 80px;
                  align-self: center;
                  margin-left: 8px;
                  border: 1px solid #000;
                  padding: 2px;
                }
                svg {
                  width: 100%;
                  height: 100%;
                }
              </style>
            </head>
            <body onload="window.print(); window.close();">
              ${printContents}
            </body>
          </html>
        `);
        printWin.document.close();
      } else {
        alert("Pop-up blocker is preventing thermal label generator from launching. Please allow popups.");
      }
    };
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closePrintModal = function() {
  const modal = document.getElementById('printModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

// EXPORT ACTION CHANNELS
function exportCSV() {
  if (equipmentList.length === 0) {
    showToast("No equipment records to export.", "error");
    return;
  }

  let headers = ["Asset Number", "Serial Number", "Machine Name", "Calibration Due Date", "Location", "Owner", "Department", "Status", "Remarks"];
  let rows = equipmentList.map(itm => [
    itm.assetNumber,
    itm.serialNumber,
    itm.machineName,
    itm.calibrationDueDate,
    itm.location,
    itm.equipmentOwner,
    itm.department,
    itm.equipmentStatus,
    itm.remarks || ''
  ]);

  let csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(","), ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Syrma_SGS_Calibration_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Calibration ledger exported successfully as CSV.", "success");
}

function exportExcel() {
  if (equipmentList.length === 0) {
    showToast("No equipment records to export.", "error");
    return;
  }

  let xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
  xml += '<Styles><Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F172A" ss:Pattern="Solid"/></Style></Styles>';
  xml += '<Worksheet ss:Name="Syrma SGS Equipment">';
  xml += '<Table>';
  
  xml += '<Row>';
  const cols = ["Asset Number", "Serial Number", "Machine Name", "Calibration Due Date", "Location", "Owner", "Department", "Status"];
  cols.forEach(c => xml += `<Cell ss:StyleID="hdr"><Data ss:Type="String">${c}</Data></Cell>`);
  xml += '</Row>';

  equipmentList.forEach(itm => {
    xml += '<Row>';
    xml += `<Cell><Data ss:Type="String">${itm.assetNumber}</Data></Cell>`;
    xml += `<Cell><Data ss:Type="String">${itm.serialNumber}</Data></Cell>`;
    xml += `<Cell><Data ss:Type="String">${itm.machineName}</Data></Cell>`;
    xml += `<Cell><Data ss:Type="String">${itm.calibrationDueDate}</Data></Cell>`;
    xml += `<Cell><Data ss:Type="String">${itm.location}</Data></Cell>`;
    xml += `<Cell><Data ss:Type="String">${itm.equipmentOwner}</Data></Cell>`;
    xml += `<Cell><Data ss:Type="String">${itm.department}</Data></Cell>`;
    xml += `<Cell><Data ss:Type="String">${itm.equipmentStatus}</Data></Cell>`;
    xml += '</Row>';
  });

  xml += '</Table></Worksheet></Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Syrma_SGS_Equipment_Ledger_${new Date().toISOString().split('T')[0]}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Dashboard compiled successfully as Excel sheet XML.", "success");
}

// Schema Modal Handlers
window.openSchemaModal = function() {
  const modal = document.getElementById('sqlSchemaModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.closeSchemaModal = function() {
  const modal = document.getElementById('sqlSchemaModal');
  if (modal) {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }
};

window.copySchemaSql = function() {
  const codeBlock = document.getElementById('sqlQueryBlock');
  if (codeBlock) {
    const text = codeBlock.textContent;
    navigator.clipboard.writeText(text).then(() => {
      showToast("SQL Schema copied to clipboard successfully!", "success");
    }).catch(err => {
      console.error('Failed to copy: ', err);
      showToast("Could not copy SQL automatically.", "error");
    });
  }
};

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});
