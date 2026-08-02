// ==================== API CONFIGURATION ====================
const API_BASE_URL = '/api';
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let currentEditingMember = null;
let currentApprovingRegistration = null;
let membersCache = [];
let registrationsCache = [];
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
                whatsapp: document.getElementById('regWhatsapp').value,
                location: document.getElementById('regLocation').value,
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

function renderMembersGroup(members, tableId, cardsId, showLocationColumn) {
    document.getElementById(tableId).innerHTML = members.map(m => `
        <tr class="border-b border-white/5 animate-fade-in">
            <td class="py-3 px-4 text-white">${escapeHtml(m.memberId)}</td>
            <td class="py-3 px-4 text-white">${escapeHtml(m.memberName)}</td>
            ${showLocationColumn ? `<td class="py-3 px-4">${locationBadge(m.location)}</td>` : ''}
            <td class="py-3 px-4">${memberRoleBadge(m)}</td>
            <td class="py-3 px-4 text-center space-x-2">${memberActionsHtml(m)}</td>
        </tr>
    `).join('');

    document.getElementById(cardsId).innerHTML = members.map(m => `
        <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in">
            <div class="flex items-start justify-between gap-3 mb-3">
                <div class="min-w-0">
                    <p class="text-white font-semibold truncate">${escapeHtml(m.memberName)}</p>
                    <p class="text-gray-500 text-xs">${escapeHtml(m.memberId)}</p>
                </div>
                <div class="flex flex-col items-end gap-1.5 shrink-0">
                    ${memberRoleBadge(m)}
                    ${showLocationColumn ? locationBadge(m.location) : ''}
                </div>
            </div>
            <div class="flex gap-2">${memberActionsHtml(m)}</div>
        </div>
    `).join('');
}

async function loadMembers() {
    try {
        membersCache = await apiCall('/members');
        const indiaMembers = membersCache.filter(m => isIndia(m.location));
        const outsideMembers = membersCache.filter(m => !isIndia(m.location));

        document.getElementById('membersIndiaCount').textContent = `(${indiaMembers.length})`;
        document.getElementById('membersOutsideCount').textContent = `(${outsideMembers.length})`;

        renderMembersGroup(indiaMembers, 'membersTableIndia', 'membersCardsIndia', false);
        renderMembersGroup(outsideMembers, 'membersTableOutside', 'membersCardsOutside', true);
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

async function loadPayments() {
    const month = parseInt(document.getElementById('paymentMonth').value);
    const year = parseInt(document.getElementById('paymentYear').value);

    try {
        const rows = await apiCall(`/payments?month=${month}&year=${year}`);
        paymentsCache = rows;

        document.getElementById('paymentsTable').innerHTML = rows.map(r => {
            const isPaid = r.status === 'paid';
            return `
                <tr class="border-b border-white/5 animate-fade-in">
                    <td class="py-3 px-4 text-white">${escapeHtml(r.memberName)}</td>
                    <td class="py-3 px-4 text-center text-white">₹${r.amount}</td>
                    <td class="py-3 px-4 text-center">
                        <label class="flex items-center justify-center cursor-pointer">
                            <input type="checkbox" class="payment-check accent-orange-500 w-4 h-4" data-member="${escapeHtml(r.memberId)}" ${isPaid ? 'checked' : ''}>
                            <span class="ml-2 ${isPaid ? 'text-green-400' : 'text-red-400'}">${isPaid ? 'Paid' : 'Not Paid'}</span>
                        </label>
                    </td>
                </tr>
            `;
        }).join('');

        document.getElementById('paymentsCards').innerHTML = rows.map(r => {
            const isPaid = r.status === 'paid';
            return `
                <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in flex items-center justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-white font-semibold truncate">${escapeHtml(r.memberName)}</p>
                        <p class="text-gray-500 text-xs">₹${r.amount}</p>
                    </div>
                    <label class="flex items-center gap-2 cursor-pointer shrink-0">
                        <input type="checkbox" class="payment-check accent-orange-500 w-5 h-5" data-member="${escapeHtml(r.memberId)}" ${isPaid ? 'checked' : ''}>
                        <span class="text-sm font-medium ${isPaid ? 'text-green-400' : 'text-red-400'}">${isPaid ? 'Paid' : 'Not Paid'}</span>
                    </label>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.payment-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const label = cb.parentElement.querySelector('span');
                label.textContent = cb.checked ? 'Paid' : 'Not Paid';
                label.classList.toggle('text-green-400', cb.checked);
                label.classList.toggle('text-red-400', !cb.checked);
                document.querySelectorAll(`.payment-check[data-member="${cb.dataset.member}"]`).forEach(other => {
                    if (other !== cb) other.checked = cb.checked;
                });
            });
        });
    } catch (error) {
        console.error('Load payments error:', error);
    }
}

async function savePayments() {
    const month = parseInt(document.getElementById('paymentMonth').value);
    const year = parseInt(document.getElementById('paymentYear').value);

    // Table and mobile-card checkboxes both exist in the DOM (one hidden via
    // responsive classes) and are kept in sync, so dedupe by memberId here.
    const paymentsByMember = new Map();
    document.querySelectorAll('.payment-check').forEach(cb => {
        paymentsByMember.set(cb.dataset.member, {
            memberId: cb.dataset.member,
            status: cb.checked ? 'paid' : 'not_paid',
            amount: 100
        });
    });
    const payments = [...paymentsByMember.values()];

    try {
        await apiCall('/payments', {
            method: 'POST',
            body: JSON.stringify({ month, year, payments })
        });
        toast('Payments saved!', 'success');
        await loadDashboard();
    } catch (error) {
        toast(error.message, 'error');
    }
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
            <td>${r.status === 'paid' ? 'Paid' : 'Not Paid'}</td>
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

async function loadExpenses() {
    try {
        const expenses = await apiCall('/expenses');

        document.getElementById('expensesTable').innerHTML = expenses.map(e => `
            <tr class="border-b border-white/5 animate-fade-in">
                <td class="py-3 px-4 text-white">${monthNames[e.month]} ${e.year}</td>
                <td class="py-3 px-4 text-center text-white">₹${e.electricityBill}</td>
                <td class="py-3 px-4 text-center text-white">₹${e.waterBill}</td>
                <td class="py-3 px-4 text-center text-white">₹${e.internetBill}</td>
                <td class="py-3 px-4 text-center text-white">₹${e.rent}</td>
                <td class="py-3 px-4 text-center text-white">₹${e.miscellaneous}</td>
                <td class="py-3 px-4 text-center text-green-400">₹${e.totalExpense}</td>
                <td class="py-3 px-4 text-center">
                    <button data-action="delete-expense" data-id="${e._id}" class="text-red-400 hover:text-red-300 transition btn-pop">Delete</button>
                </td>
            </tr>
        `).join('');

        document.getElementById('expensesCards').innerHTML = expenses.map(e => `
            <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in">
                <div class="flex items-center justify-between mb-3">
                    <p class="text-white font-semibold">${monthNames[e.month]} ${e.year}</p>
                    <button data-action="delete-expense" data-id="${e._id}" class="text-red-400 hover:text-red-300 transition btn-pop text-sm font-medium">Delete</button>
                </div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                    <div class="flex justify-between"><span class="text-gray-500">Electricity</span><span class="text-white">₹${e.electricityBill}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">Water</span><span class="text-white">₹${e.waterBill}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">Internet</span><span class="text-white">₹${e.internetBill}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">Rent</span><span class="text-white">₹${e.rent}</span></div>
                    <div class="flex justify-between"><span class="text-gray-500">Misc</span><span class="text-white">₹${e.miscellaneous}</span></div>
                </div>
                <div class="flex justify-between items-center pt-2 border-t border-white/10">
                    <span class="text-orange-400 font-semibold text-sm">Total</span>
                    <span class="text-orange-400 font-bold">₹${e.totalExpense}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load expenses error:', error);
    }
}

function handleExpenseAction(e) {
    const btn = e.target.closest('button[data-action="delete-expense"]');
    if (btn) deleteExpense(btn.dataset.id);
}
document.getElementById('expensesTable').addEventListener('click', handleExpenseAction);
document.getElementById('expensesCards').addEventListener('click', handleExpenseAction);

function registrationActionsHtml(r) {
    return `
        <button data-action="approve-registration" data-id="${r.id}" class="text-green-400 hover:text-green-300 px-3 py-1.5 bg-green-500/10 rounded-lg transition btn-pop text-sm font-medium">Approve</button>
        <button data-action="reject-registration" data-id="${r.id}" class="text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-500/10 rounded-lg transition btn-pop text-sm font-medium">Reject</button>
    `;
}

function renderRegistrationsGroup(regs, tableId, cardsId, showLocationColumn) {
    document.getElementById(tableId).innerHTML = regs.map(r => `
        <tr class="border-b border-white/5 animate-fade-in">
            <td class="py-3 px-4 text-white">${escapeHtml(r.name)}</td>
            <td class="py-3 px-4 text-white">${escapeHtml(r.mobile)}</td>
            <td class="py-3 px-4 text-gray-400">${escapeHtml(r.whatsapp || '-')}</td>
            ${showLocationColumn ? `<td class="py-3 px-4">${locationBadge(r.location)}</td>` : ''}
            <td class="py-3 px-4 text-gray-400">${escapeHtml(r.address || '-')}</td>
            <td class="py-3 px-4 text-center space-x-2">${registrationActionsHtml(r)}</td>
        </tr>
    `).join('');

    document.getElementById(cardsId).innerHTML = regs.map(r => `
        <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in">
            <div class="flex items-start justify-between gap-3 mb-1">
                <p class="text-white font-semibold">${escapeHtml(r.name)}</p>
                ${showLocationColumn ? locationBadge(r.location) : ''}
            </div>
            <p class="text-gray-500 text-xs mb-1">Mobile: ${escapeHtml(r.mobile)}${r.whatsapp ? ` &middot; WhatsApp: ${escapeHtml(r.whatsapp)}` : ''}</p>
            <p class="text-gray-400 text-sm mb-3">${escapeHtml(r.address || 'No address given')}</p>
            <div class="flex gap-2">${registrationActionsHtml(r)}</div>
        </div>
    `).join('');
}

async function loadRegistrations() {
    try {
        registrationsCache = await apiCall('/registrations');
        const empty = document.getElementById('noRegistrations');
        const indiaRegs = registrationsCache.filter(r => isIndia(r.location));
        const outsideRegs = registrationsCache.filter(r => !isIndia(r.location));

        document.getElementById('registrationsIndiaCount').textContent = `(${indiaRegs.length})`;
        document.getElementById('registrationsOutsideCount').textContent = `(${outsideRegs.length})`;

        renderRegistrationsGroup(indiaRegs, 'registrationsTableIndia', 'registrationsCardsIndia', false);
        renderRegistrationsGroup(outsideRegs, 'registrationsTableOutside', 'registrationsCardsOutside', true);

        const count = registrationsCache.length;
        empty.classList.toggle('hidden', count > 0);

        const badge = document.getElementById('pendingBadge');
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);

        document.getElementById('pendingDot').classList.toggle('hidden', count === 0);
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
    document.getElementById('editMemberRole').value = member.role;
    document.getElementById('editMemberWhatsapp').value = member.whatsapp || '';
    document.getElementById('editMemberLocation').value = member.location || 'India';
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

    if (!memberName.trim()) {
        toast('Member name cannot be empty', 'error');
        return;
    }

    try {
        const updateData = { memberName, role, whatsapp, location };
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
    await loadMemberPayments();
    await loadMemberExpenses();
}

const CLUB_UPI_ID = 'kiransathyadevan@okicici';
const CLUB_UPI_PAYEE_NAME = 'Brahmastra Arts and Sports Club';

function buildUpiLink(amount, note) {
    const params = new URLSearchParams({
        pa: CLUB_UPI_ID,
        pn: CLUB_UPI_PAYEE_NAME,
        am: String(amount),
        cu: 'INR',
        tn: note
    });
    return `upi://pay?${params.toString()}`;
}

function payButtonHtml(p) {
    if (p.status === 'paid') return '<span class="text-gray-600 text-sm">&mdash;</span>';
    const note = `Brahmastra Club fee - ${monthNames[p.month]} ${p.year}`;
    return `<a href="${buildUpiLink(p.amount || 100, note)}" class="inline-block gradient-bg text-white text-sm font-medium px-3 py-1.5 rounded-lg transition btn-pop">Pay via UPI</a>`;
}

async function loadMemberPayments() {
    try {
        const data = await apiCall('/members/me');
        const payments = data.monthlyPayments || [];

        document.getElementById('memberPaymentsTable').innerHTML = payments.map(p => `
            <tr class="border-b border-white/5 animate-fade-in">
                <td class="py-3 px-4 text-white">${monthNames[p.month]}</td>
                <td class="py-3 px-4 text-white">${p.year}</td>
                <td class="py-3 px-4 text-center text-white">₹${p.amount || 100}</td>
                <td class="py-3 px-4 text-center">
                    <span class="${p.status === 'paid' ? 'text-green-400' : 'text-red-400'}">${p.status === 'paid' ? 'Paid' : 'Not Paid'}</span>
                </td>
                <td class="py-3 px-4 text-center">${payButtonHtml(p)}</td>
            </tr>
        `).join('');

        document.getElementById('memberPaymentsCards').innerHTML = payments.map(p => `
            <div class="bg-black/30 border border-white/10 rounded-2xl p-4 animate-fade-in flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-white font-semibold">${monthNames[p.month]} ${p.year}</p>
                    <p class="text-gray-500 text-xs">₹${p.amount || 100}</p>
                    <span class="text-sm font-medium ${p.status === 'paid' ? 'text-green-400' : 'text-red-400'}">${p.status === 'paid' ? 'Paid' : 'Not Paid'}</span>
                </div>
                ${payButtonHtml(p)}
            </div>
        `).join('');
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
                    <div class="flex justify-between items-center pt-3">
                        <span class="text-orange-400 font-bold">Net Bill</span>
                        <span class="text-2xl text-orange-400 font-bold">₹${e.totalExpense || 0}</span>
                    </div>
                </div>
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
                password: document.getElementById('newMemberPassword').value,
                whatsapp: document.getElementById('newMemberWhatsapp').value,
                location: document.getElementById('newMemberLocation').value,
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
                miscellaneous: parseFloat(document.getElementById('miscellaneousBill').value) || 0
            })
        });
        closeModal('addExpenseModal');
        e.target.reset();
        await loadExpenses();
        await loadDashboard();
        toast('Expense added!', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
});

document.getElementById('approveRegistrationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentApprovingRegistration) return;

    try {
        await apiCall(`/registrations/${currentApprovingRegistration.id}/approve`, {
            method: 'POST',
            body: JSON.stringify({
                password: document.getElementById('approvePassword').value,
                role: document.getElementById('approveRole').value
            })
        });
        closeModal('approveRegistrationModal');
        e.target.reset();
        await Promise.all([loadRegistrations(), loadMembers(), loadDashboard()]);
        toast('Registration approved! Share the password with them — their mobile number is their login ID.', 'success');
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
    ['paymentYear', 'expenseYear'].forEach(id => {
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
document.getElementById('savePaymentsBtn').addEventListener('click', savePayments);
document.getElementById('printPaymentsBtn').addEventListener('click', printPayments);
document.getElementById('paymentMonth').addEventListener('change', loadPayments);
document.getElementById('paymentYear').addEventListener('change', loadPayments);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('memberLogoutBtn').addEventListener('click', logout);

function logout() {
    localStorage.clear();
    location.reload();
}

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
