// ==================== API CONFIGURATION ====================
const API_BASE_URL = window.APP_CONFIG?.apiBaseUrl || '/api';
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let currentEditingMember = null;
let currentApprovingRegistration = null;
let membersCache = [];
let registrationsCache = [];
let expensesCache = [];
let roleChangeHandler = null;

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function apiCall(endpoint, options = {}) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        ...options
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ==================== UI HELPERS ====================
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function isIndia(location) { return location === 'India'; }

function locationBadge(location) {
    return `<span class="px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-300">${escapeHtml(location || 'Unspecified')}</span>`;
}

// ==================== PUBLIC CLUB PHOTO GALLERY ====================
const clubPhotos = Array.from({ length: 17 }, (_, index) => `club-gallery/${index + 1}.jpeg`);
let currentClubPhotoIndex = 0;

const carouselImage = document.getElementById('clubPhotoCarouselImage');
const photoDots = document.getElementById('clubPhotoDots');
const reducedPhotoMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let photoCarouselTimer = null;

photoDots.innerHTML = clubPhotos.map((_, index) => `
    <button type="button" data-photo-index="${index}" aria-label="Show photo ${index + 1}" aria-current="${index === 0}"></button>
`).join('');
document.getElementById('clubPhotoAllGrid').innerHTML = clubPhotos.map((src, index) => `
    <button type="button" data-club-photo="${index}" aria-label="View club photo ${index + 1}">
        <img src="${src}" alt="Brahmastra Club photo ${index + 1}" loading="lazy">
    </button>
`).join('');

function setCarouselPhoto(index) {
    currentClubPhotoIndex = (index + clubPhotos.length) % clubPhotos.length;
    carouselImage.classList.add('is-changing');
    window.setTimeout(() => {
        carouselImage.src = clubPhotos[currentClubPhotoIndex];
        carouselImage.alt = `Brahmastra Club photo ${currentClubPhotoIndex + 1}`;
        document.getElementById('clubPhotoCarouselCaption').textContent =
            `Photo ${currentClubPhotoIndex + 1} of ${clubPhotos.length}`;
        photoDots.querySelectorAll('button').forEach((dot, dotIndex) => {
            dot.setAttribute('aria-current', String(dotIndex === currentClubPhotoIndex));
        });
        carouselImage.classList.remove('is-changing');
    }, reducedPhotoMotion.matches ? 0 : 220);
}

function stopPhotoCarousel() {
    if (photoCarouselTimer) window.clearInterval(photoCarouselTimer);
    photoCarouselTimer = null;
}

function startPhotoCarousel() {
    stopPhotoCarousel();
    if (reducedPhotoMotion.matches || document.hidden) return;
    photoCarouselTimer = window.setInterval(() => {
        setCarouselPhoto(currentClubPhotoIndex + 1);
    }, 4000);
}

document.getElementById('clubPhotoPreviousSlide').addEventListener('click', () => {
    setCarouselPhoto(currentClubPhotoIndex - 1);
    startPhotoCarousel();
});
document.getElementById('clubPhotoNextSlide').addEventListener('click', () => {
    setCarouselPhoto(currentClubPhotoIndex + 1);
    startPhotoCarousel();
});
photoDots.addEventListener('click', (event) => {
    const button = event.target.closest('[data-photo-index]');
    if (!button) return;
    setCarouselPhoto(Number(button.dataset.photoIndex));
    startPhotoCarousel();
});
document.getElementById('clubPhotoCarousel').addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    showClubPhoto(currentClubPhotoIndex);
    document.getElementById('clubPhotoViewer').showModal();
    stopPhotoCarousel();
});
document.getElementById('clubPhotoCarousel').addEventListener('mouseenter', stopPhotoCarousel);
document.getElementById('clubPhotoCarousel').addEventListener('mouseleave', startPhotoCarousel);
document.getElementById('clubPhotoCarousel').addEventListener('focusin', stopPhotoCarousel);
document.getElementById('clubPhotoCarousel').addEventListener('focusout', startPhotoCarousel);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPhotoCarousel();
    else startPhotoCarousel();
});
reducedPhotoMotion.addEventListener('change', startPhotoCarousel);
startPhotoCarousel();

function showClubPhoto(index) {
    currentClubPhotoIndex = (index + clubPhotos.length) % clubPhotos.length;
    const image = document.getElementById('clubPhotoViewerImage');
    image.src = clubPhotos[currentClubPhotoIndex];
    image.alt = `Brahmastra Club photo ${currentClubPhotoIndex + 1}`;
    document.getElementById('clubPhotoViewerCaption').textContent =
        `Club photo ${currentClubPhotoIndex + 1} of ${clubPhotos.length}`;
}

document.getElementById('viewAllClubPhotos').addEventListener('click', () => {
    stopPhotoCarousel();
    document.getElementById('clubPhotoAllDialog').showModal();
});
document.getElementById('clubPhotoAllClose').addEventListener('click', () => {
    document.getElementById('clubPhotoAllDialog').close();
});
document.getElementById('clubPhotoAllDialog').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
});
document.getElementById('clubPhotoAllDialog').addEventListener('close', startPhotoCarousel);
document.getElementById('clubPhotoAllGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-club-photo]');
    if (!button) return;
    document.getElementById('clubPhotoAllDialog').close();
    showClubPhoto(Number(button.dataset.clubPhoto));
    document.getElementById('clubPhotoViewer').showModal();
});

document.getElementById('clubPhotoPrevious').addEventListener('click', () => {
    showClubPhoto(currentClubPhotoIndex - 1);
});
document.getElementById('clubPhotoNext').addEventListener('click', () => {
    showClubPhoto(currentClubPhotoIndex + 1);
});
document.getElementById('clubPhotoViewerClose').addEventListener('click', () => {
    document.getElementById('clubPhotoViewer').close();
});
document.getElementById('clubPhotoViewer').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
});
document.getElementById('clubPhotoViewer').addEventListener('close', startPhotoCarousel);
document.addEventListener('keydown', (event) => {
    const viewer = document.getElementById('clubPhotoViewer');
    if (!viewer.open) return;
    if (event.key === 'ArrowLeft') showClubPhoto(currentClubPhotoIndex - 1);
    if (event.key === 'ArrowRight') showClubPhoto(currentClubPhotoIndex + 1);
});

// Alternate the login welcome panel and membership invitation every 10 seconds.
let activeLoginFeature = 0;
let loginFeatureTimer = null;

function setLoginFeature(index) {
    activeLoginFeature = index % 2;
    const panels = [
        document.getElementById('loginFeaturePoster'),
        document.getElementById('loginFeatureRegistration')
    ];
    panels.forEach((panel, panelIndex) => {
        const active = panelIndex === activeLoginFeature;
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', String(!active));
        panel.querySelectorAll('button').forEach(button => {
            button.tabIndex = active ? 0 : -1;
        });
    });
}

function stopLoginFeatureRotation() {
    if (loginFeatureTimer) window.clearInterval(loginFeatureTimer);
    loginFeatureTimer = null;
}

function startLoginFeatureRotation() {
    stopLoginFeatureRotation();
    if (document.hidden || document.getElementById('loginPage').classList.contains('hidden')) return;
    loginFeatureTimer = window.setInterval(() => {
        setLoginFeature(activeLoginFeature + 1);
    }, 10000);
}

document.getElementById('loginFeatureRegisterBtn').addEventListener('click', () => showPage('registerPage'));
document.addEventListener('visibilitychange', startLoginFeatureRotation);
startLoginFeatureRotation();

// ==================== PAGINATION ====================
const PAGE_SIZE = 10;
const paginationState = {};

function paginateArray(array, groupKey) {
    const total = Math.max(1, Math.ceil(array.length / PAGE_SIZE));
    let page = Math.min(paginationState[groupKey] || 1, total);
    if (page < 1) page = 1;
    paginationState[groupKey] = page;

    const start = (page - 1) * PAGE_SIZE;
    return { pageItems: array.slice(start, start + PAGE_SIZE), page, total };
}

function paginationControlsHtml(groupKey, page, total) {
    if (total <= 1) return '';
    return `
        <div class="flex items-center justify-center gap-3 pt-3">
            <button data-page-group="${groupKey}" data-page-dir="-1" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition btn-pop disabled:opacity-30 disabled:pointer-events-none" ${page <= 1 ? 'disabled' : ''}>&larr; Prev</button>
            <span class="text-gray-400 text-sm">Page ${page} of ${total}</span>
            <button data-page-group="${groupKey}" data-page-dir="1" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition btn-pop disabled:opacity-30 disabled:pointer-events-none" ${page >= total ? 'disabled' : ''}>Next &rarr;</button>
        </div>
    `;
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page-group]');
    if (!btn) return;
    const groupKey = btn.dataset.pageGroup;
    paginationState[groupKey] = (paginationState[groupKey] || 1) + parseInt(btn.dataset.pageDir, 10);

    if (groupKey === 'membersIndia' || groupKey === 'membersOutside') renderMembersTab();
    else if (groupKey === 'registrationsIndia' || groupKey === 'registrationsOutside') renderRegistrationsTab();
    else if (groupKey === 'expenses') renderExpensesTab();
});

function toast(message, type = 'info') {
    const colors = {
        success: 'bg-green-900/90 border-green-500 text-green-200',
        error: 'bg-red-900/90 border-red-500 text-red-200',
        info: 'bg-gray-800/90 border-orange-500 text-gray-200'
    };
    const container = document.getElementById('toastContainer');
    const div = document.createElement('div');
    div.className = `animate-slide-in px-4 py-3 rounded-lg border shadow-lg text-sm max-w-xs ${colors[type] || colors.info}`;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => {
        div.style.transition = 'opacity .3s ease';
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
    }, 3200);
}

function showConfirm(message, title = 'Are you sure?') {
    return new Promise(resolve => {
        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalMessage').textContent = message;
        const modal = document.getElementById('confirmModal');
        const confirmBtn = document.getElementById('confirmModalConfirmBtn');
        const cancelBtn = document.getElementById('confirmModalCancelBtn');

        function cleanup(result) {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            resolve(result);
        }
        function onConfirm() { cleanup(true); }
        function onCancel() { cleanup(false); }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        modal.classList.remove('hidden');
    });
}

function animateNumber(el, target, duration = 800) {
    const startTime = performance.now();
    function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased).toLocaleString('en-IN');
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
window.closeModal = closeModal;

function showPage(id) {
    ['loginPage', 'registerPage', 'registerPendingPage', 'adminDashboard', 'memberDashboard'].forEach(pageId => {
        document.getElementById(pageId).classList.toggle('hidden', pageId !== id);
    });
    if (id === 'loginPage') startLoginFeatureRotation();
    else stopLoginFeatureRotation();
}

// ==================== LOGIN / REGISTER NAVIGATION ====================
document.getElementById('showRegisterBtn').addEventListener('click', () => showPage('registerPage'));
document.getElementById('backToLoginBtn').addEventListener('click', () => showPage('loginPage'));
document.getElementById('pendingBackToLoginBtn').addEventListener('click', () => showPage('loginPage'));

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('userId').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.classList.add('hidden');

    try {
        const data = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ userId, password })
        });

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        if (currentUser.role === 'admin') {
            showPage('adminDashboard');
            await initAdmin();
        } else {
            showPage('memberDashboard');
            await initMember();
        }
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    }
});

document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
    document.getElementById('passwordResetForm').reset();
    document.getElementById('passwordResetError').classList.add('hidden');
    document.getElementById('resetCodeFields').classList.add('hidden');
    document.getElementById('resetIdentifier').value = document.getElementById('userId').value.trim();
    openModal('passwordResetModal');
});
document.getElementById('closePasswordResetBtn').addEventListener('click', () => closeModal('passwordResetModal'));

document.getElementById('requestResetCodeBtn').addEventListener('click', async () => {
    const errorDiv = document.getElementById('passwordResetError');
    errorDiv.classList.add('hidden');
    const identifier = document.getElementById('resetIdentifier').value.trim();
    if (!identifier) {
        errorDiv.textContent = 'Enter your registered mobile number or email';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        const result = await apiCall('/auth/password-reset/request', {
            method: 'POST',
            body: JSON.stringify({ identifier })
        });
        document.getElementById('resetCodeMessage').textContent = result.message;
        document.getElementById('resetCodeFields').classList.remove('hidden');
    } catch (error) {
        errorDiv.textContent = `${error.message} If you cannot reset it, contact an administrator for a temporary password, sign in, then use Edit Profile → Change password.`;
        errorDiv.classList.remove('hidden');
    }
});

document.getElementById('passwordResetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorDiv = document.getElementById('passwordResetError');
    errorDiv.classList.add('hidden');
    const identifier = document.getElementById('resetIdentifier').value.trim();
    const code = document.getElementById('resetOtp').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;

    if (!/^\d{6}$/.test(code)) {
        errorDiv.textContent = 'Enter the six-digit code from your email';
        errorDiv.classList.remove('hidden');
        return;
    }
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.classList.remove('hidden');
        return;
    }
    if (newPassword.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        const result = await apiCall('/auth/password-reset/confirm', {
            method: 'POST',
            body: JSON.stringify({ identifier, code, newPassword })
        });
        closeModal('passwordResetModal');
        document.getElementById('passwordResetForm').reset();
        toast(result.message, 'success');
    } catch (error) {
        errorDiv.textContent = `${error.message} If you cannot reset it, contact an administrator for a temporary password, sign in, then use Edit Profile → Change password.`;
        errorDiv.classList.remove('hidden');
    }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('registerError');
    errorDiv.classList.add('hidden');

    try {
        await apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('regName').value,
                mobile: document.getElementById('regMobile').value,
                email: document.getElementById('regEmail').value,
                whatsapp: document.getElementById('regWhatsapp').value,
                location: document.getElementById('regLocation').value,
                bloodGroup: document.getElementById('regBloodGroup').value,
                address: document.getElementById('regAddress').value
            })
        });
        e.target.reset();
        showPage('registerPendingPage');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    }
});

// ==================== ADMIN FUNCTIONS ====================
async function initAdmin() {
    document.getElementById('adminName').textContent = currentUser.memberName;
    populateYears();
    await Promise.all([loadDashboard(), loadMembers(), loadRegistrations()]);
    setupTabs();
}

async function loadDashboard() {
    try {
        const data = await apiCall('/dashboard/stats');
        animateNumber(document.getElementById('totalMembers'), data.totalMembers);
        animateNumber(document.getElementById('monthlyCollection'), data.monthlyCollection);
        animateNumber(document.getElementById('monthlyExpenses'), data.monthlyExpenses);
        animateNumber(document.getElementById('netBalance'), data.netBalance);
    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

function memberActionsHtml(m) {
    return m.memberId !== 'brahmastra01' ? `
        <button data-action="edit-member" data-id="${escapeHtml(m.memberId)}" class="text-blue-400 hover:text-blue-300 px-3 py-1.5 bg-blue-500/10 rounded-lg transition btn-pop text-sm font-medium">Edit</button>
        <button data-action="delete-member" data-id="${escapeHtml(m.memberId)}" class="text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-500/10 rounded-lg transition btn-pop text-sm font-medium">Delete</button>
    ` : `<span class="text-gray-500 text-sm">Main Admin</span>`;
}

function memberRoleBadge(m) {
    return `<span class="px-3 py-1 rounded-full text-sm ${m.role === 'admin' ? 'bg-orange-500/15 text-orange-300' : 'bg-blue-500/15 text-blue-300'}">${escapeHtml(m.role)}</span>`;
}

const BLOOD_DROP_SVG = '<svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C12 2 5 11.5 5 16a7 7 0 0014 0c0-4.5-7-14-7-14z"/></svg>';

function bloodGroupBadge(bloodGroup) {
    return bloodGroup
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-300">${BLOOD_DROP_SVG}${escapeHtml(bloodGroup)}</span>`
        : `<span class="text-gray-600 text-xs">&mdash;</span>`;
}

function renderMembersGroup(members, tableId, cardsId, paginationId, groupKey, showLocationColumn) {
    const { pageItems, page, total } = paginateArray(members, groupKey);

    document.getElementById(tableId).innerHTML = pageItems.map(m => `
        <tr class="border-b border-white/5 animate-fade-in">
            <td class="py-3 px-4 text-white">${escapeHtml(m.memberId)}</td>
            <td class="py-3 px-4 text-white">${escapeHtml(m.memberName)}</td>
            <td class="py-3 px-4 text-gray-400">${escapeHtml(m.email || '-')}</td>
            ${showLocationColumn ? `<td class="py-3 px-4">${locationBadge(m.location)}</td>` : ''}
            <td class="py-3 px-4 text-center">${bloodGroupBadge(m.bloodGroup)}</td>
            <td class="py-3 px-4">${memberRoleBadge(m)}</td>
            <td class="py-3 px-4 text-center space-x-2">${memberActionsHtml(m)}</td>
        </tr>
    `).join('');

    document.getElementById(cardsId).innerHTML = pageItems.map(m => `
        <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in">
            <div class="flex items-start justify-between gap-3 mb-3">
                <div class="min-w-0">
                    <p class="text-white font-semibold truncate">${escapeHtml(m.memberName)}</p>
                    <p class="text-gray-500 text-xs">${escapeHtml(m.memberId)}</p>
                    ${m.email ? `<p class="text-gray-400 text-xs truncate">${escapeHtml(m.email)}${m.emailVerified ? ' · verified' : ' · not verified'}</p>` : '<p class="text-gray-500 text-xs">No email on file</p>'}
                </div>
                <div class="flex flex-col items-end gap-1.5 shrink-0">
                    ${memberRoleBadge(m)}
                    ${showLocationColumn ? locationBadge(m.location) : ''}
                    ${bloodGroupBadge(m.bloodGroup)}
                </div>
            </div>
            <div class="flex gap-2">${memberActionsHtml(m)}</div>
        </div>
    `).join('');

    document.getElementById(paginationId).innerHTML = paginationControlsHtml(groupKey, page, total);
}

function renderMembersTab() {
    const indiaMembers = membersCache.filter(m => isIndia(m.location));
    const outsideMembers = membersCache.filter(m => !isIndia(m.location));

    document.getElementById('membersIndiaCount').textContent = `(${indiaMembers.length})`;
    document.getElementById('membersOutsideCount').textContent = `(${outsideMembers.length})`;

    renderMembersGroup(indiaMembers, 'membersTableIndia', 'membersCardsIndia', 'membersPaginationIndia', 'membersIndia', false);
    renderMembersGroup(outsideMembers, 'membersTableOutside', 'membersCardsOutside', 'membersPaginationOutside', 'membersOutside', true);
}

async function loadMembers() {
    try {
        membersCache = await apiCall('/members');
        renderMembersTab();
    } catch (error) {
        console.error('Load members error:', error);
    }
}

function handleMemberAction(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-member') openEditModal(id);
    if (btn.dataset.action === 'delete-member') deleteMember(id);
}
['membersTableIndia', 'membersCardsIndia', 'membersTableOutside', 'membersCardsOutside'].forEach(id => {
    document.getElementById(id).addEventListener('click', handleMemberAction);
});

let paymentsCache = [];
let paymentsFilter = 'not_paid';
let paymentsSearchTerm = '';

function initials(name) {
    return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function paymentToggleHtml(r) {
    const isPaid = r.status === 'paid';
    const month = document.getElementById('paymentMonth');
    const monthName = month.options[month.selectedIndex].textContent;
    const year = document.getElementById('paymentYear').value;
    const nextAction = isPaid ? 'Mark as unpaid' : 'Mark as paid';
    return `
        <span class="px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${isPaid ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}">${isPaid ? 'Paid' : 'Unpaid'}</span>
        <button data-action="toggle-payment" data-member="${escapeHtml(r.memberId)}" aria-label="${nextAction} for ${escapeHtml(r.memberName)}, ${monthName} ${year}" class="px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition btn-pop shrink-0 ${isPaid ? 'bg-white/10 text-gray-200 hover:bg-white/20' : 'bg-green-600 hover:bg-green-500 text-white'}">
            ${nextAction}
        </button>
    `;
}

function paymentRemindHtml(r) {
    if (r.status === 'paid') return '';
    if (r.reminded) {
        return `
            <span title="A reminder was already sent this month" class="text-gray-500 p-2 bg-white/5 rounded-lg shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 13l4 4L19 7"></path></svg>
            </span>
        `;
    }
    return `
        <button data-action="remind-payment" data-member="${escapeHtml(r.memberId)}" aria-label="Send payment reminder to ${escapeHtml(r.memberName)}" title="Send payment reminder" class="text-orange-400 hover:text-orange-300 p-2 bg-orange-500/10 rounded-lg transition btn-pop shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
        </button>
    `;
}

function paymentRowHtml(r) {
    return `
        <div class="bg-black/30 border border-white/10 rounded-xl p-3 flex items-center gap-3 animate-fade-in" data-row-member="${escapeHtml(r.memberId)}">
            <div class="w-9 h-9 rounded-full gradient-bg flex items-center justify-center text-white font-bold text-xs shrink-0">${escapeHtml(initials(r.memberName))}</div>
            <div class="flex-1 min-w-0">
                <p class="text-white font-medium truncate">${escapeHtml(r.memberName)}</p>
                <p class="text-gray-500 text-xs">Monthly dues: ₹${r.amount}</p>
            </div>
            ${paymentRemindHtml(r)}
            ${paymentToggleHtml(r)}
        </div>
    `;
}

function paymentsMatchesFilter(r) {
    if (paymentsFilter !== 'all' && r.status !== paymentsFilter) return false;
    const term = paymentsSearchTerm.trim().toLowerCase();
    if (term && !r.memberName.toLowerCase().includes(term)) return false;
    return true;
}

function renderPaymentsList() {
    const filtered = paymentsCache.filter(paymentsMatchesFilter);

    document.getElementById('paymentsList').innerHTML = filtered.map(paymentRowHtml).join('');
    document.getElementById('paymentsEmptyState').classList.toggle('hidden', filtered.length > 0);

    document.querySelectorAll('#paymentsList [data-action="toggle-payment"]').forEach(btn => {
        btn.addEventListener('click', () => togglePayment(btn.dataset.member));
    });
    document.querySelectorAll('#paymentsList [data-action="remind-payment"]').forEach(btn => {
        btn.addEventListener('click', () => remindPayment(btn.dataset.member));
    });
}

function updatePaymentsStats() {
    const total = paymentsCache.length;
    const paid = paymentsCache.filter(r => r.status === 'paid').length;
    const collected = paymentsCache.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.amount, 0);

    document.getElementById('paymentsPaidCount').textContent = paid;
    document.getElementById('paymentsTotalCount').textContent = total;
    document.getElementById('paymentsCollected').textContent = collected.toLocaleString('en-IN');
    document.getElementById('paymentsProgressBar').style.width = total ? `${(paid / total) * 100}%` : '0%';
}

async function loadPayments() {
    const month = parseInt(document.getElementById('paymentMonth').value);
    const year = parseInt(document.getElementById('paymentYear').value);

    try {
        paymentsCache = await apiCall(`/payments?month=${month}&year=${year}`);
        renderPaymentsList();
        updatePaymentsStats();
    } catch (error) {
        console.error('Load payments error:', error);
    }
}

async function togglePayment(memberId) {
    const month = parseInt(document.getElementById('paymentMonth').value);
    const year = parseInt(document.getElementById('paymentYear').value);
    const record = paymentsCache.find(r => r.memberId === memberId);
    if (!record) return;

    const previousStatus = record.status;
    const newStatus = previousStatus === 'paid' ? 'not_paid' : 'paid';
    const monthSelect = document.getElementById('paymentMonth');
    const monthName = monthSelect.options[monthSelect.selectedIndex].textContent;
    const message = newStatus === 'paid'
        ? `Confirm that you received ₹${record.amount} from ${record.memberName} for ${monthName} ${year}. This only updates the record; it does not collect money.`
        : `Change ${record.memberName}'s ${monthName} ${year} dues status back to unpaid?`;
    const confirmed = await showConfirm(message, newStatus === 'paid' ? 'Mark dues as paid?' : 'Mark dues as unpaid?');
    if (!confirmed) return;

    try {
        await apiCall(`/payments/${encodeURIComponent(memberId)}`, {
            method: 'PUT',
            body: JSON.stringify({ month, year, status: newStatus })
        });
        record.status = newStatus;
        renderPaymentsList();
        updatePaymentsStats();
        toast(`${record.memberName} marked as ${newStatus === 'paid' ? 'Paid' : 'Unpaid'}`, 'success');
        await loadDashboard();
    } catch (error) {
        record.status = previousStatus;
        toast(error.message, 'error');
        await loadPayments();
    }
}

document.getElementById('paymentSearch').addEventListener('input', (e) => {
    paymentsSearchTerm = e.target.value;
    renderPaymentsList();
});

document.querySelectorAll('.payment-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        paymentsFilter = btn.dataset.filter;
        document.querySelectorAll('.payment-filter-btn').forEach(b => {
            b.classList.toggle('bg-orange-500', b === btn);
            b.classList.toggle('text-white', b === btn);
            b.classList.toggle('bg-white/10', b !== btn);
            b.classList.toggle('text-gray-300', b !== btn);
        });
        renderPaymentsList();
    });
});

async function remindPayment(memberId) {
    const month = parseInt(document.getElementById('paymentMonth').value);
    const year = parseInt(document.getElementById('paymentYear').value);

    try {
        const result = await apiCall('/payments/remind', {
            method: 'POST',
            body: JSON.stringify({ memberId, month, year })
        });
        if (result.reminded) {
            const record = paymentsCache.find(r => r.memberId === memberId);
            if (record) record.reminded = true;
            renderPaymentsList();
        }
        toast(result.smsSent ? 'Reminder SMS sent!' : 'Reminder failed to send — try contacting them directly.', result.smsSent ? 'success' : 'info');
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function remindAllUnpaid() {
    const month = parseInt(document.getElementById('paymentMonth').value);
    const year = parseInt(document.getElementById('paymentYear').value);
    const unpaid = paymentsCache.filter(r => r.status !== 'paid' && !r.reminded);

    if (unpaid.length === 0) {
        toast('Everyone has paid, or already been reminded, for this month!', 'info');
        return;
    }

    const ok = await showConfirm(`Send a payment reminder SMS to ${unpaid.length} member(s) who haven't paid?`, 'Remind all unpaid members?');
    if (!ok) return;

    let sent = 0;
    let failed = 0;
    for (const r of unpaid) {
        try {
            const result = await apiCall('/payments/remind', {
                method: 'POST',
                body: JSON.stringify({ memberId: r.memberId, month, year })
            });
            if (result.reminded) r.reminded = true;
            if (result.smsSent) sent++; else failed++;
        } catch (error) {
            failed++;
        }
    }

    renderPaymentsList();
    toast(`Reminders sent: ${sent}${failed ? `, failed: ${failed}` : ''}`, failed ? 'info' : 'success');
}

function printPayments() {
    const monthSelect = document.getElementById('paymentMonth');
    const monthLabel = monthSelect.options[monthSelect.selectedIndex].textContent;
    const year = document.getElementById('paymentYear').value;

    const paidCount = paymentsCache.filter(r => r.status === 'paid').length;
    const totalCollected = paymentsCache.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.amount, 0);

    const rowsHtml = paymentsCache.map(r => `
        <tr>
            <td>${escapeHtml(r.memberName)}</td>
            <td>₹${r.amount}</td>
            <td>${r.status === 'paid' ? 'Paid' : 'Unpaid'}</td>
        </tr>
    `).join('');

    document.getElementById('printSection').innerHTML = `
        <h1 style="font-size:20px;font-weight:bold;">Brahmastra Arts &amp; Sports Club</h1>
        <h2 style="font-size:16px;margin-top:4px;">Payment Report &mdash; ${monthLabel} ${year}</h2>
        <p style="margin-top:8px;">Total Members: ${paymentsCache.length} &nbsp; | &nbsp; Paid: ${paidCount} &nbsp; | &nbsp; Collected: ₹${totalCollected}</p>
        <table>
            <thead><tr><th>Member</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>
        <p style="margin-top:16px;font-size:12px;color:#555;">Generated ${new Date().toLocaleString('en-IN')}</p>
    `;
    window.print();
}

function donationsSummaryHtml(donations) {
    if (!donations || donations.length === 0) return '<span class="text-gray-600">&mdash;</span>';
    const total = donations.reduce((sum, d) => sum + d.amount, 0);
    const title = donations.map(d => `${d.purpose}: ₹${d.amount}`).join(', ');
    return `<span title="${escapeHtml(title)}" class="text-white">₹${total} <span class="text-gray-500 text-xs">(${donations.length})</span></span>`;
}

function donationsListHtml(donations) {
    if (!donations || donations.length === 0) return '';
    return `
        <div class="mt-3 pt-2 border-t border-white/10 space-y-1">
            <p class="text-gray-500 text-xs font-medium mb-1">Donations</p>
            ${donations.map(d => `
                <div class="flex justify-between text-sm gap-2">
                    <span class="text-gray-400 truncate">${escapeHtml(d.purpose)}</span>
                    <span class="text-white shrink-0">₹${d.amount}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function expenseActionsHtml(e) {
    return `
        <button data-action="edit-expense" data-id="${e._id}" class="text-blue-400 hover:text-blue-300 px-2.5 py-1 bg-blue-500/10 rounded-lg transition btn-pop text-sm font-medium">Edit</button>
        <button data-action="delete-expense" data-id="${e._id}" class="text-red-400 hover:text-red-300 px-2.5 py-1 bg-red-500/10 rounded-lg transition btn-pop text-sm font-medium">Delete</button>
    `;
}

function renderExpensesTab() {
    const { pageItems, page, total } = paginateArray(expensesCache, 'expenses');

    document.getElementById('expensesTable').innerHTML = pageItems.map(e => `
        <tr class="border-b border-white/5 animate-fade-in">
            <td class="py-3 px-4 text-white">${monthNames[e.month]} ${e.year}</td>
            <td class="py-3 px-4 text-center text-white">₹${e.electricityBill}</td>
            <td class="py-3 px-4 text-center text-white">₹${e.waterBill}</td>
            <td class="py-3 px-4 text-center text-white">₹${e.internetBill}</td>
            <td class="py-3 px-4 text-center text-white">₹${e.rent}</td>
            <td class="py-3 px-4 text-center text-white">₹${e.miscellaneous}</td>
            <td class="py-3 px-4 text-center text-green-400">₹${e.totalExpense}</td>
            <td class="py-3 px-4 text-center text-white">₹${e.amountFromAbroad || 0}</td>
            <td class="py-3 px-4 text-center">${donationsSummaryHtml(e.donations)}</td>
            <td class="py-3 px-4 text-center space-x-2">${expenseActionsHtml(e)}</td>
        </tr>
    `).join('');

    document.getElementById('expensesCards').innerHTML = pageItems.map(e => `
        <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in">
            <div class="flex items-center justify-between mb-3">
                <p class="text-white font-semibold">${monthNames[e.month]} ${e.year}</p>
                <div class="flex gap-2">${expenseActionsHtml(e)}</div>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                <div class="flex justify-between"><span class="text-gray-500">Electricity</span><span class="text-white">₹${e.electricityBill}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Water</span><span class="text-white">₹${e.waterBill}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Internet</span><span class="text-white">₹${e.internetBill}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Rent</span><span class="text-white">₹${e.rent}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Misc</span><span class="text-white">₹${e.miscellaneous}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Abroad</span><span class="text-white">₹${e.amountFromAbroad || 0}</span></div>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-white/10">
                <span class="text-orange-400 font-semibold text-sm">Total</span>
                <span class="text-orange-400 font-bold">₹${e.totalExpense}</span>
            </div>
            ${donationsListHtml(e.donations)}
        </div>
    `).join('');

    document.getElementById('expensesPagination').innerHTML = paginationControlsHtml('expenses', page, total);
}

async function loadExpenses() {
    try {
        expensesCache = await apiCall('/expenses');
        renderExpensesTab();
    } catch (error) {
        console.error('Load expenses error:', error);
    }
}

function handleExpenseAction(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit-expense') openEditExpenseModal(btn.dataset.id);
    if (btn.dataset.action === 'delete-expense') deleteExpense(btn.dataset.id);
}
document.getElementById('expensesTable').addEventListener('click', handleExpenseAction);
document.getElementById('expensesCards').addEventListener('click', handleExpenseAction);

function registrationActionsHtml(r) {
    return `
        <button data-action="approve-registration" data-id="${r.id}" class="text-green-400 hover:text-green-300 px-3 py-1.5 bg-green-500/10 rounded-lg transition btn-pop text-sm font-medium">Approve</button>
        <button data-action="reject-registration" data-id="${r.id}" class="text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-500/10 rounded-lg transition btn-pop text-sm font-medium">Reject</button>
    `;
}

function renderRegistrationsGroup(regs, tableId, cardsId, paginationId, groupKey, showLocationColumn) {
    const { pageItems, page, total } = paginateArray(regs, groupKey);

    document.getElementById(tableId).innerHTML = pageItems.map(r => `
        <tr class="border-b border-white/5 animate-fade-in">
            <td class="py-3 px-4 text-white">${escapeHtml(r.name)}</td>
            <td class="py-3 px-4 text-white">${escapeHtml(r.mobile)}</td>
            <td class="py-3 px-4 text-gray-400">${escapeHtml(r.email || '-')}</td>
            <td class="py-3 px-4 text-gray-400">${escapeHtml(r.whatsapp || '-')}</td>
            ${showLocationColumn ? `<td class="py-3 px-4">${locationBadge(r.location)}</td>` : ''}
            <td class="py-3 px-4 text-gray-400">${escapeHtml(r.address || '-')}</td>
            <td class="py-3 px-4 text-center space-x-2">${registrationActionsHtml(r)}</td>
        </tr>
    `).join('');

    document.getElementById(cardsId).innerHTML = pageItems.map(r => `
        <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in">
            <div class="flex items-start justify-between gap-3 mb-1">
                <p class="text-white font-semibold">${escapeHtml(r.name)}</p>
                ${showLocationColumn ? locationBadge(r.location) : ''}
            </div>
            ${r.email ? `<p class="text-gray-400 text-xs mb-1">Email: ${escapeHtml(r.email)}</p>` : '<p class="text-gray-500 text-xs mb-1">No email provided</p>'}
            <p class="text-gray-500 text-xs mb-1">Mobile: ${escapeHtml(r.mobile)}${r.whatsapp ? ` &middot; WhatsApp: ${escapeHtml(r.whatsapp)}` : ''}</p>
            <p class="text-gray-400 text-sm mb-3">${escapeHtml(r.address || 'No address given')}</p>
            <div class="flex gap-2">${registrationActionsHtml(r)}</div>
        </div>
    `).join('');

    document.getElementById(paginationId).innerHTML = paginationControlsHtml(groupKey, page, total);
}

function renderRegistrationsTab() {
    const empty = document.getElementById('noRegistrations');
    const indiaRegs = registrationsCache.filter(r => isIndia(r.location));
    const outsideRegs = registrationsCache.filter(r => !isIndia(r.location));

    document.getElementById('registrationsIndiaCount').textContent = `(${indiaRegs.length})`;
    document.getElementById('registrationsOutsideCount').textContent = `(${outsideRegs.length})`;

    renderRegistrationsGroup(indiaRegs, 'registrationsTableIndia', 'registrationsCardsIndia', 'registrationsPaginationIndia', 'registrationsIndia', false);
    renderRegistrationsGroup(outsideRegs, 'registrationsTableOutside', 'registrationsCardsOutside', 'registrationsPaginationOutside', 'registrationsOutside', true);

    const count = registrationsCache.length;
    empty.classList.toggle('hidden', count > 0);

    const badge = document.getElementById('pendingBadge');
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);

    document.getElementById('pendingDot').classList.toggle('hidden', count === 0);
}

async function loadRegistrations() {
    try {
        registrationsCache = await apiCall('/registrations');
        renderRegistrationsTab();
    } catch (error) {
        console.error('Load registrations error:', error);
    }
}

function handleRegistrationAction(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'approve-registration') openApproveModal(id);
    if (btn.dataset.action === 'reject-registration') rejectRegistration(id);
}
['registrationsTableIndia', 'registrationsCardsIndia', 'registrationsTableOutside', 'registrationsCardsOutside'].forEach(id => {
    document.getElementById(id).addEventListener('click', handleRegistrationAction);
});

function openApproveModal(id) {
    const registration = registrationsCache.find(r => String(r.id) === String(id));
    if (!registration) return;
    currentApprovingRegistration = registration;
    document.getElementById('approveRegName').textContent = registration.name;
    document.getElementById('approveRegMobile').textContent = registration.mobile;
    document.getElementById('approveRegEmail').textContent = registration.email || 'Not provided';
    document.getElementById('approveRegEmailContainer').classList.toggle('hidden', !registration.email);
    document.getElementById('approvePassword').value = '';
    document.getElementById('approveRole').value = 'member';
    openModal('approveRegistrationModal');
}

async function rejectRegistration(id) {
    const registration = registrationsCache.find(r => String(r.id) === String(id));
    const ok = await showConfirm(`Reject the registration from ${registration ? registration.name : 'this person'}?`);
    if (!ok) return;

    try {
        await apiCall(`/registrations/${id}/reject`, { method: 'POST' });
        toast('Registration rejected', 'success');
        await loadRegistrations();
    } catch (error) {
        toast(error.message, 'error');
    }
}

function openEditModal(memberId) {
    const member = membersCache.find(m => m.memberId === memberId);
    if (!member) return;

    currentEditingMember = member;
    document.getElementById('editMemberId').value = member.memberId;
    document.getElementById('editMemberName').value = member.memberName;
    document.getElementById('editMemberEmail').value = member.email || '';
    document.getElementById('editMemberEmailStatus').textContent = member.emailVerified
        ? 'Verified. Changing this email will require the member to verify it again.'
        : 'Not verified. The member must verify it before email sign-in or recovery.';
    document.getElementById('editMemberRole').value = member.role;
    document.getElementById('editMemberWhatsapp').value = member.whatsapp || '';
    document.getElementById('editMemberLocation').value = member.location || 'India';
    document.getElementById('editMemberBloodGroup').value = member.bloodGroup || '';
    document.getElementById('editMemberPassword').value = '';

    const roleSelect = document.getElementById('editMemberRole');
    const warning = document.getElementById('editWarning');
    warning.classList.add('hidden');

    if (roleChangeHandler) roleSelect.removeEventListener('change', roleChangeHandler);
    roleChangeHandler = () => {
        warning.classList.toggle('hidden', roleSelect.value === member.role);
    };
    roleSelect.addEventListener('change', roleChangeHandler);

    openModal('editMemberModal');
}

async function updateMember() {
    const memberId = document.getElementById('editMemberId').value;
    const memberName = document.getElementById('editMemberName').value;
    const password = document.getElementById('editMemberPassword').value;
    const role = document.getElementById('editMemberRole').value;
    const whatsapp = document.getElementById('editMemberWhatsapp').value;
    const location = document.getElementById('editMemberLocation').value;
    const bloodGroup = document.getElementById('editMemberBloodGroup').value;

    if (!memberName.trim()) {
        toast('Member name cannot be empty', 'error');
        return;
    }

    try {
        const updateData = {
            memberName,
            email: document.getElementById('editMemberEmail').value,
            role,
            whatsapp,
            location,
            bloodGroup
        };
        if (password.trim()) updateData.password = password;

        await apiCall(`/members/${memberId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        closeModal('editMemberModal');
        await loadMembers();
        toast('Member updated successfully!', 'success');

        if (currentUser.memberId === memberId && role === 'member' && currentUser.role === 'admin') {
            setTimeout(() => {
                toast('Your admin access has been revoked. Logging out...', 'info');
                setTimeout(logout, 1200);
            }, 800);
        }
    } catch (error) {
        toast('Error updating member: ' + error.message, 'error');
    }
}

async function deleteMember(memberId) {
    if (memberId === 'brahmastra01') return toast('Cannot delete main admin!', 'error');
    const ok = await showConfirm('This action cannot be undone.', 'Delete this member?');
    if (!ok) return;

    try {
        await apiCall(`/members/${memberId}`, { method: 'DELETE' });
        await loadMembers();
        await loadDashboard();
        toast('Member deleted!', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function deleteExpense(id) {
    const ok = await showConfirm('Delete this expense?');
    if (!ok) return;

    try {
        await apiCall(`/expenses/${id}`, { method: 'DELETE' });
        await loadExpenses();
        await loadDashboard();
        toast('Expense deleted!', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
}

// ==================== MEMBER FUNCTIONS ====================
async function initMember() {
    document.getElementById('memberName').textContent = currentUser.memberName;
    document.getElementById('memberIdDisplay').textContent = currentUser.memberId;
    populateYears();
    await Promise.all([loadMemberDashboardStats(), loadMemberPayments(), loadMemberExpenses(), loadDirectory(), loadGameLeaderboard(), loadDinoLeaderboard()]);
}

async function loadMemberDashboardStats() {
    try {
        const data = await apiCall('/dashboard/stats');
        animateNumber(document.getElementById('memberMonthlyCollection'), data.monthlyCollection);
        animateNumber(document.getElementById('memberMonthlyExpenses'), data.monthlyExpenses);
        animateNumber(document.getElementById('memberNetBalance'), data.netBalance);
    } catch (error) {
        console.error('Load member dashboard stats error:', error);
    }
}

const BLOOD_GROUP_ORDER = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

function renderBloodGroupSummary(members) {
    const counts = {};
    members.forEach(m => {
        if (m.bloodGroup) counts[m.bloodGroup] = (counts[m.bloodGroup] || 0) + 1;
    });

    const present = BLOOD_GROUP_ORDER.filter(bg => counts[bg]);
    const container = document.getElementById('bloodGroupSummary');

    if (present.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-xs">No blood group info on file yet.</p>';
        return;
    }

    container.innerHTML = present.map((bg, i) => `
        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 border border-red-500/25 text-red-300 animate-scale-in" style="animation-delay:${i * 0.05}s">
            ${BLOOD_DROP_SVG}${bg}<span class="text-red-400/60 font-normal">&times;${counts[bg]}</span>
        </span>
    `).join('');
}

async function loadDirectory() {
    try {
        const members = await apiCall('/members/directory');
        renderBloodGroupSummary(members);

        document.getElementById('directoryTable').innerHTML = members.map(m => `
            <tr class="border-b border-white/5 animate-fade-in">
                <td class="py-3 px-4 text-white">${escapeHtml(m.memberName)}</td>
                <td class="py-3 px-4 text-center">${bloodGroupBadge(m.bloodGroup)}</td>
                <td class="py-3 px-4">${locationBadge(m.location)}</td>
                <td class="py-3 px-4 text-gray-300">${escapeHtml(m.whatsapp || '-')}</td>
            </tr>
        `).join('');

        document.getElementById('directoryCards').innerHTML = members.map(m => `
            <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in">
                <div class="flex items-start justify-between gap-3 mb-2">
                    <p class="text-white font-semibold truncate">${escapeHtml(m.memberName)}</p>
                    ${bloodGroupBadge(m.bloodGroup)}
                </div>
                <div class="flex items-center justify-between gap-3">
                    ${locationBadge(m.location)}
                    <p class="text-gray-400 text-sm">${escapeHtml(m.whatsapp || 'No WhatsApp on file')}</p>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load directory error:', error);
    }
}

let memberPaymentsCache = [];

function renderPaymentCalendar() {
    const year = parseInt(document.getElementById('calendarYear').value) || new Date().getFullYear();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    document.getElementById('paymentCalendar').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
        const record = memberPaymentsCache.find(p => p.month === month && p.year === year);
        const isFuture = year > currentYear || (year === currentYear && month > currentMonth);

        let statusClass, statusLabel;
        if (isFuture) {
            statusClass = 'bg-gray-500/10 border-gray-500/25 text-gray-400';
            statusLabel = 'Upcoming';
        } else if (record && record.status === 'paid') {
            statusClass = 'bg-green-500/10 border-green-500/25 text-green-400';
            statusLabel = 'Paid';
        } else {
            statusClass = 'bg-red-500/10 border-red-500/25 text-red-400';
            statusLabel = 'Unpaid';
        }
        const payButton = !isFuture && (!record || record.status !== 'paid')
            ? `<button type="button" data-pay-month="${month}" data-pay-year="${year}" class="mt-2 gradient-bg text-white text-xs font-medium px-3 py-1.5 rounded-lg transition btn-pop">Pay ₹${record && record.amount || 100}</button>`
            : '';

        return `
            <div class="rounded-xl border p-3 text-center animate-fade-in ${statusClass}">
                <p class="font-semibold text-sm text-white">${monthNames[month]}</p>
                <p class="text-xs mt-1">${statusLabel}</p>
                ${payButton}
            </div>
        `;
    }).join('');
}

async function startMembershipPayment(month, year) {
    if (!window.Razorpay) {
        toast('Secure payment checkout is unavailable. Please refresh and try again.', 'error');
        return;
    }

    try {
        const order = await apiCall('/checkout/orders', {
            method: 'POST',
            body: JSON.stringify({ month, year })
        });
        const checkout = new window.Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: 'Brahmastra Arts and Sports Club',
            description: `Membership fee - ${monthNames[month]} ${year}`,
            order_id: order.orderId,
            prefill: { name: order.memberName, contact: order.contact },
            theme: { color: '#ff7a1a' },
            handler: async (response) => {
                try {
                    let result;
                    for (let attempt = 0; attempt < 5; attempt += 1) {
                        result = await apiCall('/checkout/verify', {
                            method: 'POST',
                            body: JSON.stringify(response)
                        });
                        if (result.status !== 'pending') break;
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    if (result.status === 'paid') {
                        toast('Payment verified. This month is now paid.', 'success');
                    } else {
                        toast('Payment is processing. The calendar will update after confirmation.', 'info');
                    }
                    await loadMemberPayments();
                } catch (error) {
                    toast(`Payment was received but could not be verified yet: ${error.message}`, 'error');
                }
            },
            modal: {
                ondismiss: () => {
                    toast('Payment was not confirmed. You can try again later.', 'info');
                }
            }
        });
        checkout.on('payment.failed', (response) => {
            const description = response.error && response.error.description;
            toast(description || 'Payment failed. Please try again.', 'error');
        });
        checkout.open();
    } catch (error) {
        toast(error.message, 'error');
    }
}

document.getElementById('paymentCalendar').addEventListener('click', (event) => {
    const button = event.target.closest('[data-pay-month]');
    if (!button) return;
    startMembershipPayment(Number(button.dataset.payMonth), Number(button.dataset.payYear));
});

function payButtonHtml(p) {
    if (p.status === 'paid') return '<span class="text-gray-600 text-sm">&mdash;</span>';
    return `<button type="button" data-pay-month="${p.month}" data-pay-year="${p.year}" class="inline-block gradient-bg text-white text-sm font-medium px-3 py-1.5 rounded-lg transition btn-pop">Pay securely</button>`;
}

let currentMemberProfile = null;

const MEMBER_PAYMENTS_INITIAL_COUNT = 4;
let memberPaymentsShowAll = false;

function renderMemberPaymentsHistory() {
    const payments = memberPaymentsCache;
    const visible = memberPaymentsShowAll ? payments : payments.slice(0, MEMBER_PAYMENTS_INITIAL_COUNT);

    document.getElementById('memberPaymentsTable').innerHTML = visible.map(p => `
        <tr class="border-b border-white/5 animate-fade-in">
            <td class="py-3 px-4 text-white">${monthNames[p.month]}</td>
            <td class="py-3 px-4 text-white">${p.year}</td>
            <td class="py-3 px-4 text-center text-white">₹${p.amount || 100}</td>
            <td class="py-3 px-4 text-center">
                <span class="${p.status === 'paid' ? 'text-green-400' : 'text-red-400'}">${p.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
            </td>
            <td class="py-3 px-4 text-center">${payButtonHtml(p)}</td>
        </tr>
    `).join('');

    document.getElementById('memberPaymentsCards').innerHTML = visible.map(p => `
        <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in flex items-center justify-between gap-3">
            <div class="min-w-0">
                <p class="text-white font-semibold">${monthNames[p.month]} ${p.year}</p>
                <p class="text-gray-500 text-xs">₹${p.amount || 100}</p>
                <span class="text-sm font-medium ${p.status === 'paid' ? 'text-green-400' : 'text-red-400'}">${p.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
            </div>
            ${payButtonHtml(p)}
        </div>
    `).join('');

    document.getElementById('loadMorePaymentsBtn').classList.toggle('hidden', memberPaymentsShowAll || payments.length <= MEMBER_PAYMENTS_INITIAL_COUNT);
}

document.getElementById('loadMorePaymentsBtn').addEventListener('click', () => {
    memberPaymentsShowAll = true;
    renderMemberPaymentsHistory();
});

document.getElementById('memberPaymentsTable').addEventListener('click', handlePaymentHistoryClick);
document.getElementById('memberPaymentsCards').addEventListener('click', handlePaymentHistoryClick);

function handlePaymentHistoryClick(event) {
    const button = event.target.closest('[data-pay-month]');
    if (!button) return;
    startMembershipPayment(Number(button.dataset.payMonth), Number(button.dataset.payYear));
}

async function loadMemberPayments() {
    try {
        const data = await apiCall('/members/me');
        currentMemberProfile = data;
        memberPaymentsCache = data.monthlyPayments || [];
        memberPaymentsShowAll = false;
        renderPaymentCalendar();
        renderMemberPaymentsHistory();
    } catch (error) {
        console.error('Load member payments error:', error);
    }
}

async function loadMemberExpenses() {
    try {
        const expenses = await apiCall('/expenses');
        const container = document.getElementById('memberExpensesContainer');

        if (expenses.length === 0) {
            container.innerHTML = '<p class="text-gray-400 col-span-full text-center py-8">No expenses recorded yet</p>';
            return;
        }

        container.innerHTML = expenses.slice(0, 6).map((e, i) => `
            <div class="bg-black/30 rounded-2xl p-5 sm:p-6 border border-white/10 card-hover animate-fade-in-up" style="animation-delay:${i * 0.05}s">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-white">${monthNames[e.month]} ${e.year}</h3>
                    <div class="icon-badge gradient-bg">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                        </svg>
                    </div>
                </div>
                <div class="space-y-2">
                    <div class="flex justify-between items-center py-2 border-b border-white/10">
                        <span class="text-gray-400 text-sm">Electricity</span>
                        <span class="text-white font-semibold">₹${e.electricityBill || 0}</span>
                    </div>
                    <div class="flex justify-between items-center py-2 border-b border-white/10">
                        <span class="text-gray-400 text-sm">Water</span>
                        <span class="text-white font-semibold">₹${e.waterBill || 0}</span>
                    </div>
                    <div class="flex justify-between items-center py-2 border-b border-white/10">
                        <span class="text-gray-400 text-sm">Internet</span>
                        <span class="text-white font-semibold">₹${e.internetBill || 0}</span>
                    </div>
                    <div class="flex justify-between items-center py-2 border-b border-white/10">
                        <span class="text-gray-400 text-sm">Rent</span>
                        <span class="text-white font-semibold">₹${e.rent || 0}</span>
                    </div>
                    <div class="flex justify-between items-center py-2 border-b border-white/10">
                        <span class="text-gray-400 text-sm">Miscellaneous</span>
                        <span class="text-white font-semibold">₹${e.miscellaneous || 0}</span>
                    </div>
                    <div class="flex justify-between items-center py-2 border-b border-white/10">
                        <span class="text-gray-400 text-sm">Amount from Abroad</span>
                        <span class="text-white font-semibold">₹${e.amountFromAbroad || 0}</span>
                    </div>
                    <div class="flex justify-between items-center pt-3">
                        <span class="text-orange-400 font-bold">Net Bill</span>
                        <span class="text-2xl text-orange-400 font-bold">₹${e.totalExpense || 0}</span>
                    </div>
                </div>
                ${donationsListHtml(e.donations)}
            </div>
        `).join('');
    } catch (error) {
        console.error('Load member expenses error:', error);
        document.getElementById('memberExpensesContainer').innerHTML = '<p class="text-red-400 col-span-full text-center py-8">Failed to load expenses</p>';
    }
}

// ==================== FORMS ====================
document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await apiCall('/members', {
            method: 'POST',
            body: JSON.stringify({
                mobile: document.getElementById('newMemberMobile').value,
                memberName: document.getElementById('newMemberName').value,
                email: document.getElementById('newMemberEmail').value,
                password: document.getElementById('newMemberPassword').value,
                whatsapp: document.getElementById('newMemberWhatsapp').value,
                location: document.getElementById('newMemberLocation').value,
                bloodGroup: document.getElementById('newMemberBloodGroup').value,
                role: document.getElementById('newMemberRole').value
            })
        });
        closeModal('addMemberModal');
        e.target.reset();
        await loadMembers();
        await loadDashboard();
        toast('Member added!', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
});

document.getElementById('editMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateMember();
});

function createDonationRow(prefill) {
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center';
    row.innerHTML = `
        <input type="text" placeholder="Purpose (e.g. Independence Day event)" class="donation-purpose flex-1 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:border-orange-500 focus:outline-none transition" value="${prefill ? escapeHtml(prefill.purpose) : ''}">
        <input type="number" placeholder="Amount" min="0" class="donation-amount w-24 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:border-orange-500 focus:outline-none transition" value="${prefill ? prefill.amount : ''}">
        <button type="button" class="remove-donation-row text-red-400 hover:text-red-300 p-2 shrink-0" title="Remove donation">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    row.querySelector('.remove-donation-row').addEventListener('click', () => row.remove());
    return row;
}

function setupDonationsUI(checkboxId, containerId, rowsId, addBtnId) {
    document.getElementById(checkboxId).addEventListener('change', (e) => {
        const container = document.getElementById(containerId);
        container.classList.toggle('hidden', !e.target.checked);
        if (e.target.checked && document.getElementById(rowsId).children.length === 0) {
            document.getElementById(rowsId).appendChild(createDonationRow());
        }
    });

    document.getElementById(addBtnId).addEventListener('click', () => {
        document.getElementById(rowsId).appendChild(createDonationRow());
    });
}
setupDonationsUI('hasDonationsCheckbox', 'donationsContainer', 'donationRows', 'addDonationRowBtn');
setupDonationsUI('editHasDonationsCheckbox', 'editDonationsContainer', 'editDonationRows', 'editAddDonationRowBtn');

function collectDonationRows(rowsId) {
    return [...document.querySelectorAll(`#${rowsId} > div`)].map(row => ({
        purpose: row.querySelector('.donation-purpose').value.trim(),
        amount: parseFloat(row.querySelector('.donation-amount').value) || 0
    })).filter(d => d.purpose && d.amount > 0);
}

function resetDonationRows(containerId, rowsId) {
    document.getElementById(rowsId).innerHTML = '';
    document.getElementById(containerId).classList.add('hidden');
}

function populateDonationRows(rowsId, checkboxId, containerId, donations) {
    const rowsContainer = document.getElementById(rowsId);
    rowsContainer.innerHTML = '';
    const hasDonations = donations && donations.length > 0;
    document.getElementById(checkboxId).checked = hasDonations;
    document.getElementById(containerId).classList.toggle('hidden', !hasDonations);
    if (hasDonations) donations.forEach(d => rowsContainer.appendChild(createDonationRow(d)));
}

document.getElementById('addExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await apiCall('/expenses', {
            method: 'POST',
            body: JSON.stringify({
                month: parseInt(document.getElementById('expenseMonth').value),
                year: parseInt(document.getElementById('expenseYear').value),
                electricityBill: parseFloat(document.getElementById('electricityBill').value) || 0,
                waterBill: parseFloat(document.getElementById('waterBill').value) || 0,
                internetBill: parseFloat(document.getElementById('internetBill').value) || 0,
                rent: parseFloat(document.getElementById('rentBill').value) || 0,
                miscellaneous: parseFloat(document.getElementById('miscellaneousBill').value) || 0,
                amountFromAbroad: parseFloat(document.getElementById('expenseAbroad').value) || 0,
                donations: collectDonationRows('donationRows')
            })
        });
        closeModal('addExpenseModal');
        e.target.reset();
        resetDonationRows('donationsContainer', 'donationRows');
        await loadExpenses();
        await loadDashboard();
        toast('Expense added!', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
});

function openEditExpenseModal(expenseId) {
    const expense = expensesCache.find(e => String(e._id) === String(expenseId));
    if (!expense) return;

    document.getElementById('editExpenseId').value = expense._id;
    document.getElementById('editExpenseMonth').value = expense.month;
    document.getElementById('editExpenseYear').value = expense.year;
    document.getElementById('editElectricityBill').value = expense.electricityBill;
    document.getElementById('editWaterBill').value = expense.waterBill;
    document.getElementById('editInternetBill').value = expense.internetBill;
    document.getElementById('editRentBill').value = expense.rent;
    document.getElementById('editMiscellaneousBill').value = expense.miscellaneous;
    document.getElementById('editExpenseAbroad').value = expense.amountFromAbroad || 0;

    populateDonationRows('editDonationRows', 'editHasDonationsCheckbox', 'editDonationsContainer', expense.donations);

    openModal('editExpenseModal');
}

document.getElementById('editExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const expenseId = document.getElementById('editExpenseId').value;
    try {
        await apiCall(`/expenses/${expenseId}`, {
            method: 'PUT',
            body: JSON.stringify({
                month: parseInt(document.getElementById('editExpenseMonth').value),
                year: parseInt(document.getElementById('editExpenseYear').value),
                electricityBill: parseFloat(document.getElementById('editElectricityBill').value) || 0,
                waterBill: parseFloat(document.getElementById('editWaterBill').value) || 0,
                internetBill: parseFloat(document.getElementById('editInternetBill').value) || 0,
                rent: parseFloat(document.getElementById('editRentBill').value) || 0,
                miscellaneous: parseFloat(document.getElementById('editMiscellaneousBill').value) || 0,
                amountFromAbroad: parseFloat(document.getElementById('editExpenseAbroad').value) || 0,
                donations: collectDonationRows('editDonationRows')
            })
        });
        closeModal('editExpenseModal');
        await loadExpenses();
        await loadDashboard();
        toast('Expense updated!', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
});

document.getElementById('approveRegistrationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentApprovingRegistration) return;

    try {
        const result = await apiCall(`/registrations/${currentApprovingRegistration.id}/approve`, {
            method: 'POST',
            body: JSON.stringify({
                password: document.getElementById('approvePassword').value,
                role: document.getElementById('approveRole').value
            })
        });
        closeModal('approveRegistrationModal');
        e.target.reset();
        await Promise.all([loadRegistrations(), loadMembers(), loadDashboard()]);
        if (result.smsSent) {
            toast('Registration approved! Login details sent via SMS.', 'success');
        } else {
            toast('Registration approved, but SMS failed to send — share the password with them manually.', 'info');
        }
    } catch (error) {
        toast(error.message, 'error');
    }
});

// ==================== TABS & YEARS ====================
function setupTabs() {
    // Both the desktop top-tabs row and the mobile bottom-nav share the
    // .tab-btn / data-tab contract, so a click on either keeps both in sync.
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.toggle('tab-active', b.dataset.tab === btn.dataset.tab);
            });

            document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
            document.getElementById(btn.dataset.tab + 'Tab').classList.remove('hidden');

            if (btn.dataset.tab === 'payments') loadPayments();
            if (btn.dataset.tab === 'expenses') loadExpenses();
            if (btn.dataset.tab === 'registrations') loadRegistrations();
        });
    });
}

function populateYears() {
    const year = new Date().getFullYear();
    ['paymentYear', 'expenseYear', 'editExpenseYear', 'calendarYear'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '';
            for (let y = 2024; y <= year + 1; y++) {
                select.innerHTML += `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
            }
        }
    });
    document.getElementById('paymentMonth').value = new Date().getMonth() + 1;
}

// ==================== EVENT LISTENERS ====================
document.getElementById('addMemberBtn').addEventListener('click', () => openModal('addMemberModal'));
document.getElementById('addExpenseBtn').addEventListener('click', () => openModal('addExpenseModal'));
document.getElementById('printPaymentsBtn').addEventListener('click', printPayments);
document.getElementById('remindAllBtn').addEventListener('click', remindAllUnpaid);
document.getElementById('paymentMonth').addEventListener('change', loadPayments);
document.getElementById('paymentYear').addEventListener('change', loadPayments);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('memberLogoutBtn').addEventListener('click', logout);
document.getElementById('calendarYear').addEventListener('change', renderPaymentCalendar);

function logout() {
    localStorage.clear();
    location.reload();
}

// ==================== EDIT PROFILE (member self-service) ====================
function openEditProfileModal() {
    if (!currentMemberProfile) return;
    document.getElementById('editProfileError').classList.add('hidden');
    document.getElementById('profileMemberId').value = currentMemberProfile.memberId;
    document.getElementById('profileName').value = currentMemberProfile.memberName;
    document.getElementById('profileEmail').value = currentMemberProfile.email || '';
    document.getElementById('profileEmailStatus').textContent = currentMemberProfile.emailVerified
        ? 'Verified email — available for sign-in and password recovery.'
        : 'Not verified yet. Verify this address to enable email sign-in and password recovery.';
    document.getElementById('profileEmailCodeFields').classList.add('hidden');
    document.getElementById('profileEmailCode').value = '';
    document.getElementById('profileWhatsapp').value = currentMemberProfile.whatsapp || '';
    document.getElementById('profileLocation').value = currentMemberProfile.location || 'India';
    document.getElementById('profileBloodGroup').value = currentMemberProfile.bloodGroup || '';
    document.getElementById('profileAddress').value = currentMemberProfile.address || '';
    openModal('editProfileModal');
}
document.getElementById('editProfileBtn').addEventListener('click', openEditProfileModal);
document.getElementById('profileChangePasswordBtn').addEventListener('click', () => {
    closeModal('editProfileModal');
    openChangePasswordModal();
});

document.getElementById('sendEmailVerificationBtn').addEventListener('click', async () => {
    const email = document.getElementById('profileEmail').value.trim();
    const status = document.getElementById('profileEmailStatus');
    status.textContent = '';
    if (!email) {
        status.textContent = 'Enter an email address first.';
        return;
    }

    try {
        const result = await apiCall('/auth/email/verification/request', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        status.textContent = result.message;
        if (!currentMemberProfile.emailVerified || currentMemberProfile.email !== email.toLowerCase()) {
            document.getElementById('profileEmailCodeFields').classList.remove('hidden');
        }
    } catch (error) {
        status.textContent = error.message;
    }
});

document.getElementById('verifyProfileEmailBtn').addEventListener('click', async () => {
    const email = document.getElementById('profileEmail').value.trim();
    const code = document.getElementById('profileEmailCode').value.trim();
    const status = document.getElementById('profileEmailStatus');
    try {
        const result = await apiCall('/auth/email/verification/confirm', {
            method: 'POST',
            body: JSON.stringify({ email, code })
        });
        currentMemberProfile.email = result.email;
        currentMemberProfile.emailVerified = true;
        document.getElementById('profileEmail').value = result.email;
        document.getElementById('profileEmailCodeFields').classList.add('hidden');
        status.textContent = 'Verified email — available for sign-in and password recovery.';
        toast('Email verified. You can now sign in and reset your password with this email.', 'success');
    } catch (error) {
        status.textContent = error.message;
    }
});

document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('editProfileError');
    errorDiv.classList.add('hidden');

    const memberName = document.getElementById('profileName').value;
    const whatsapp = document.getElementById('profileWhatsapp').value;
    const location = document.getElementById('profileLocation').value;
    const bloodGroup = document.getElementById('profileBloodGroup').value;
    const address = document.getElementById('profileAddress').value;

    if (!memberName.trim()) {
        errorDiv.textContent = 'Name cannot be empty';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        await apiCall('/members/me', {
            method: 'PUT',
            body: JSON.stringify({ memberName, whatsapp, location, bloodGroup, address })
        });
        closeModal('editProfileModal');

        currentUser.memberName = memberName;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('memberName').textContent = memberName;

        await Promise.all([loadMemberPayments(), loadDirectory()]);
        toast('Profile updated!', 'success');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    }
});

// ==================== CHANGE PASSWORD ====================
function openChangePasswordModal() {
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').classList.add('hidden');
    openModal('changePasswordModal');
}
document.getElementById('changePasswordBtn').addEventListener('click', openChangePasswordModal);
document.getElementById('memberChangePasswordBtn').addEventListener('click', openChangePasswordModal);

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('changePasswordError');
    errorDiv.classList.add('hidden');

    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (newPassword.length < 8 || newPassword.length > 128) {
        errorDiv.textContent = 'New password must be between 8 and 128 characters';
        errorDiv.classList.remove('hidden');
        return;
    }
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        await apiCall('/auth/change-password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });
        closeModal('changePasswordModal');
        toast('Password updated successfully!', 'success');
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    }
});

// ==================== SIX HITTER GAME ====================
const GAME_TOTAL_BALLS = 10;
const GAME_MAX_WICKETS = 3;
const GAME_INITIAL_PERIOD = 1800; // ms per full back-and-forth cycle
const GAME_MIN_PERIOD = 900;
const GAME_PERIOD_STEP = 90;

let gameState = null;

function gameTrackMetrics() {
    const track = document.getElementById('gameTrack');
    const ball = document.getElementById('gameBall');
    const ballWidth = ball.offsetWidth;
    return { trackWidth: track.clientWidth, ballWidth, maxX: track.clientWidth - ballWidth };
}

function updateGameHud() {
    document.getElementById('gameBallCount').textContent = gameState.ballNumber;
    document.getElementById('gameWickets').textContent = gameState.wickets;
    document.getElementById('gameScore').textContent = gameState.score;
}

function stopGameBallAnimation() {
    if (gameState && gameState.animFrameId) {
        cancelAnimationFrame(gameState.animFrameId);
        gameState.animFrameId = null;
    }
}

function startGameBall() {
    const { maxX } = gameTrackMetrics();
    gameState.ballX = 0;
    gameState.direction = 1;
    gameState.lastTimestamp = null;
    gameState.maxX = maxX;

    function tick(timestamp) {
        if (!gameState) return;
        if (gameState.lastTimestamp === null) gameState.lastTimestamp = timestamp;
        const dt = timestamp - gameState.lastTimestamp;
        gameState.lastTimestamp = timestamp;

        const speed = gameState.maxX / (gameState.period / 2);
        gameState.ballX += gameState.direction * speed * dt;

        if (gameState.ballX >= gameState.maxX) {
            gameState.ballX = gameState.maxX;
            gameState.direction = -1;
        } else if (gameState.ballX <= 0) {
            gameState.ballX = 0;
            gameState.direction = 1;
        }

        document.getElementById('gameBall').style.left = `${gameState.ballX}px`;
        gameState.animFrameId = requestAnimationFrame(tick);
    }

    gameState.animFrameId = requestAnimationFrame(tick);
}

function startGame() {
    document.getElementById('gameIntro').classList.add('hidden');
    document.getElementById('gameOverArea').classList.add('hidden');
    document.getElementById('gamePlayArea').classList.remove('hidden');
    document.getElementById('gameLastResult').textContent = '';

    gameState = {
        ballNumber: 1,
        wickets: 0,
        score: 0,
        period: GAME_INITIAL_PERIOD,
        animFrameId: null,
        ballX: 0,
        direction: 1,
        lastTimestamp: null,
        maxX: 0
    };

    updateGameHud();
    startGameBall();
}

function swingBat() {
    if (!gameState) return;
    stopGameBallAnimation();

    const { trackWidth, ballWidth } = gameTrackMetrics();
    const ballCenter = gameState.ballX + ballWidth / 2;
    const zoneStart = trackWidth * 0.4;
    const zoneEnd = trackWidth * 0.6;
    const zoneWidth = zoneEnd - zoneStart;
    const innerStart = zoneStart + zoneWidth * 0.3;
    const innerEnd = zoneEnd - zoneWidth * 0.3;
    const outerMargin = zoneWidth * 0.5;

    let runs = 0;
    let resultText, resultClass;
    let isWicket = false;

    if (ballCenter >= innerStart && ballCenter <= innerEnd) {
        runs = 6;
        resultText = 'SIX!';
        resultClass = 'text-green-400';
    } else if (ballCenter >= zoneStart && ballCenter <= zoneEnd) {
        runs = 4;
        resultText = 'FOUR!';
        resultClass = 'text-blue-400';
    } else if (ballCenter >= zoneStart - outerMargin && ballCenter <= zoneEnd + outerMargin) {
        runs = 1;
        resultText = '1 run';
        resultClass = 'text-gray-300';
    } else {
        resultText = 'OUT!';
        resultClass = 'text-red-500';
        isWicket = true;
    }

    gameState.score += runs;
    if (isWicket) gameState.wickets++;

    const resultEl = document.getElementById('gameLastResult');
    resultEl.textContent = resultText;
    resultEl.className = `text-center text-2xl font-bold mt-3 h-8 ${resultClass}`;
    updateGameHud();

    if (gameState.ballNumber >= GAME_TOTAL_BALLS || gameState.wickets >= GAME_MAX_WICKETS) {
        setTimeout(endGame, 700);
        return;
    }

    gameState.ballNumber++;
    gameState.period = Math.max(GAME_MIN_PERIOD, gameState.period - GAME_PERIOD_STEP);
    setTimeout(startGameBall, 700);
}

async function endGame() {
    const finalScore = gameState.score;
    document.getElementById('gamePlayArea').classList.add('hidden');
    document.getElementById('gameOverArea').classList.remove('hidden');
    document.getElementById('gameFinalScore').textContent = finalScore;
    gameState = null;

    try {
        await apiCall('/game/score', { method: 'POST', body: JSON.stringify({ score: finalScore, game: 'six_hitter' }) });
    } catch (error) {
        console.error('Save game score error:', error);
    }
    loadGameLeaderboard();
}

async function loadGameLeaderboard() {
    try {
        const leaderboard = await apiCall('/game/leaderboard');
        const container = document.getElementById('gameLeaderboard');

        if (leaderboard.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No scores yet — be the first to play!</p>';
            return;
        }

        container.innerHTML = leaderboard.map((entry, i) => {
            const isMe = currentUser && entry.memberId === currentUser.memberId;
            return `
                <div class="flex items-center justify-between px-4 py-2.5 rounded-xl ${isMe ? 'bg-orange-500/15 border border-orange-500/30' : 'bg-black/20'}">
                    <div class="flex items-center gap-3">
                        <span class="text-gray-500 text-sm font-semibold w-5">${i + 1}</span>
                        <span class="text-white text-sm font-medium">${escapeHtml(entry.memberName)}${isMe ? ' (You)' : ''}</span>
                    </div>
                    <span class="text-orange-400 font-bold text-sm">${entry.bestScore}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Load leaderboard error:', error);
    }
}

const gameStartButton = document.getElementById('gameStartBtn');
const gamePlayAgainButton = document.getElementById('gamePlayAgainBtn');
const gameSwingButton = document.getElementById('gameSwingBtn');
if (gameStartButton) gameStartButton.addEventListener('click', startGame);
if (gamePlayAgainButton) gamePlayAgainButton.addEventListener('click', startGame);
if (gameSwingButton) gameSwingButton.addEventListener('click', swingBat);

// ==================== STUMP DASH GAME ====================
const DINO_GRAVITY = 2200; // px/s^2, in canvas coordinate space
const DINO_JUMP_VELOCITY = -750; // px/s
const DINO_GROUND_Y = 160; // y-coordinate of the ball's resting center
const DINO_BALL_X = 60;
const DINO_BALL_RADIUS = 14;
const DINO_INITIAL_SPEED = 260; // px/s
const DINO_MAX_SPEED = 620;
const DINO_SPEED_RAMP = 8; // px/s gained per second survived

let dinoState = null;

function dinoCanvasCtx() {
    const canvas = document.getElementById('dinoCanvas');
    return { canvas, ctx: canvas.getContext('2d') };
}

function startDinoGame() {
    document.getElementById('dinoIntroOverlay').classList.add('hidden');
    document.getElementById('dinoOverOverlay').classList.add('hidden');
    document.getElementById('dinoJumpBtn').classList.remove('hidden');
    document.getElementById('dinoScoreOverlay').textContent = '0';

    dinoState = {
        y: DINO_GROUND_Y,
        vy: 0,
        jumping: false,
        obstacles: [],
        speed: DINO_INITIAL_SPEED,
        elapsed: 0,
        lastSpawn: 0,
        nextSpawnIn: 1.2 + Math.random(),
        score: 0,
        running: true,
        lastTimestamp: null,
        rafId: null
    };

    dinoState.rafId = requestAnimationFrame(dinoTick);
}

function dinoJump() {
    if (!dinoState || !dinoState.running || dinoState.jumping) return;
    dinoState.vy = DINO_JUMP_VELOCITY;
    dinoState.jumping = true;
}

function dinoTick(timestamp) {
    if (!dinoState || !dinoState.running) return;
    if (dinoState.lastTimestamp === null) dinoState.lastTimestamp = timestamp;
    const dt = Math.min((timestamp - dinoState.lastTimestamp) / 1000, 0.05);
    dinoState.lastTimestamp = timestamp;
    dinoState.elapsed += dt;

    dinoState.vy += DINO_GRAVITY * dt;
    dinoState.y += dinoState.vy * dt;
    if (dinoState.y >= DINO_GROUND_Y) {
        dinoState.y = DINO_GROUND_Y;
        dinoState.vy = 0;
        dinoState.jumping = false;
    }

    dinoState.speed = Math.min(DINO_MAX_SPEED, DINO_INITIAL_SPEED + dinoState.elapsed * DINO_SPEED_RAMP);

    const { canvas, ctx } = dinoCanvasCtx();

    dinoState.lastSpawn += dt;
    if (dinoState.lastSpawn >= dinoState.nextSpawnIn) {
        dinoState.lastSpawn = 0;
        dinoState.nextSpawnIn = 1 + Math.random() * 1.3;
        dinoState.obstacles.push({ x: canvas.width, width: 14, height: 30 + Math.random() * 20 });
    }

    dinoState.obstacles.forEach(o => { o.x -= dinoState.speed * dt; });
    dinoState.obstacles = dinoState.obstacles.filter(o => o.x + o.width > 0);

    const ballLeft = DINO_BALL_X - DINO_BALL_RADIUS;
    const ballRight = DINO_BALL_X + DINO_BALL_RADIUS;
    const ballTop = dinoState.y - DINO_BALL_RADIUS;
    const ballBottom = dinoState.y + DINO_BALL_RADIUS;

    for (const o of dinoState.obstacles) {
        const oTop = DINO_GROUND_Y + DINO_BALL_RADIUS - o.height;
        const oBottom = DINO_GROUND_Y + DINO_BALL_RADIUS;
        if (ballRight > o.x && ballLeft < o.x + o.width && ballBottom > oTop && ballTop < oBottom) {
            dinoGameOver();
            return;
        }
    }

    dinoState.score = Math.floor(dinoState.elapsed * 10);
    document.getElementById('dinoScoreOverlay').textContent = dinoState.score;

    dinoDraw(ctx, canvas);
    dinoState.rafId = requestAnimationFrame(dinoTick);
}

function dinoDraw(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, DINO_GROUND_Y + DINO_BALL_RADIUS);
    ctx.lineTo(canvas.width, DINO_GROUND_Y + DINO_BALL_RADIUS);
    ctx.stroke();

    ctx.fillStyle = '#e2b878';
    dinoState.obstacles.forEach(o => {
        const oTop = DINO_GROUND_Y + DINO_BALL_RADIUS - o.height;
        ctx.fillRect(o.x, oTop, o.width, o.height);
    });

    ctx.beginPath();
    ctx.fillStyle = '#c81e1e';
    ctx.strokeStyle = '#7f1414';
    ctx.lineWidth = 1.5;
    ctx.arc(DINO_BALL_X, dinoState.y, DINO_BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

async function dinoGameOver() {
    dinoState.running = false;
    if (dinoState.rafId) cancelAnimationFrame(dinoState.rafId);
    const finalScore = dinoState.score;

    document.getElementById('dinoJumpBtn').classList.add('hidden');
    document.getElementById('dinoFinalScore').textContent = finalScore;
    document.getElementById('dinoOverOverlay').classList.remove('hidden');

    try {
        await apiCall('/game/score', { method: 'POST', body: JSON.stringify({ score: finalScore, game: 'dino_run' }) });
    } catch (error) {
        console.error('Save dino score error:', error);
    }
    loadDinoLeaderboard();
}

async function loadDinoLeaderboard() {
    try {
        const leaderboard = await apiCall('/game/leaderboard?game=dino_run');
        const container = document.getElementById('dinoLeaderboard');

        if (leaderboard.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No scores yet — be the first to play!</p>';
            return;
        }

        container.innerHTML = leaderboard.map((entry, i) => {
            const isMe = currentUser && entry.memberId === currentUser.memberId;
            return `
                <div class="flex items-center justify-between px-4 py-2.5 rounded-xl ${isMe ? 'bg-orange-500/15 border border-orange-500/30' : 'bg-black/20'}">
                    <div class="flex items-center gap-3">
                        <span class="text-gray-500 text-sm font-semibold w-5">${i + 1}</span>
                        <span class="text-white text-sm font-medium">${escapeHtml(entry.memberName)}${isMe ? ' (You)' : ''}</span>
                    </div>
                    <span class="text-orange-400 font-bold text-sm">${entry.bestScore}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Load dino leaderboard error:', error);
    }
}

document.getElementById('dinoStartBtn').addEventListener('click', startDinoGame);
document.getElementById('dinoRestartBtn').addEventListener('click', startDinoGame);
document.getElementById('dinoJumpBtn').addEventListener('click', dinoJump);
document.getElementById('dinoCanvas').addEventListener('click', dinoJump);
document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && dinoState && dinoState.running) {
        e.preventDefault();
        dinoJump();
    }
});

// ==================== INIT ====================
window.addEventListener('load', async () => {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');

    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);

        try {
            if (currentUser.role === 'admin') {
                showPage('adminDashboard');
                await initAdmin();
            } else {
                showPage('memberDashboard');
                await initMember();
            }
        } catch (error) {
            localStorage.clear();
            location.reload();
        }
    }
});
