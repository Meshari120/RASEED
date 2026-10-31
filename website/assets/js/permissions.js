
"use strict";

const API_BASE = "/api/permissions";

let token = localStorage.getItem("app_token");
let currentUser = null;
let employees = [];

const permissionGroups = {
    teams: [
        { key: "can_create_team_groups", label: "إنشاء" },
        { key: "can_delete_team_groups", label: "حذف" }
    ],
    knowledge: [
        { key: "can_add_knowledge_documents", label: "إضافة مستندات" }
    ],
    tasks: [
        { key: "can_add_tasks", label: "إضافة مهام" }
    ],
    reports: [
        { key: "can_create_reports", label: "إنشاء" },
        { key: "can_edit_reports", label: "تعديل" }
    ]
};

const allPermissionKeys = Object.values(permissionGroups)
    .flat()
    .map(permission => permission.key);

// العودة للإعدادات
document.getElementById("backButton")?.addEventListener("click", () => {
    window.location.assign("/settings.html");
});

// تسجيل الخروج
function logout() {
    localStorage.removeItem("app_token");
    localStorage.removeItem("app_user");
    window.location.assign("/login.html");
}

// حماية النصوص المعروضة
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

// عرض الرسائل
function showMessage(message, type = "success") {
    const element = document.getElementById("message");

    if (!element) return;

    element.textContent = message;
    element.className = "message " + type;
}

// أسماء الرتب
function roleLabel(role) {
    return {
        owner: "مالك الشركة",
        admin: "مسؤول النظام",
        manager: "مدير قسم",
        employee: "موظف"
    }[role] || "غير محدد";
}

// أسماء حالات الحساب
function statusLabel(status) {
    return {
        active: "مفعّل",
        suspended: "موقوف",
        pending: "بانتظار التفعيل",
        deleted: "محذوف"
    }[status] || "غير محدد";
}

// إرسال طلبات API
async function apiRequest(url, options = {}) {
    if (!token) {
        logout();
        throw new Error("يرجى تسجيل الدخول.");
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        logout();
        throw new Error("انتهت جلسة تسجيل الدخول.");
    }

    if (response.status === 403) {
        throw new Error(data.message || "ليس لديك صلاحية لتنفيذ هذه العملية.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "تعذر تنفيذ الطلب.");
    }

    return data;
}

// التحقق من صلاحية الوصول
function checkAccess() {
    try {
        currentUser = JSON.parse(
            localStorage.getItem("app_user") || "null"
        );
    } catch {
        currentUser = null;
    }

    if (!token || !currentUser) {
        logout();
        return false;
    }

    if (!["owner", "admin"].includes(currentUser.role)) {
        const body = document.getElementById("employeesBody");

        if (body) {
            body.innerHTML = `
                <tr>
                    <td colspan="9" class="empty">
                        ليس لديك صلاحية الوصول إلى هذه الصفحة.
                    </td>
                </tr>
            `;
        }

        return false;
    }

    document.querySelectorAll(".owner-column").forEach(element => {
        element.hidden = currentUser.role !== "owner";
    });

    return true;
}

// إنشاء مربعات الصلاحيات
function permissionCheckbox(employee, permission) {
    const checked = Boolean(employee[permission.key]);

    const disabled =
        !["owner", "admin"].includes(currentUser.role);

    return `
        <label>
            <input
                type="checkbox"
                data-permission="${permission.key}"
                ${checked ? "checked" : ""}
                ${disabled ? "disabled" : ""}
            >
            ${permission.label}
        </label>
    `;
}

// عرض الموظفين
function renderEmployees(list) {
    const body = document.getElementById("employeesBody");

    if (!body) return;

    if (!list.length) {
        body.innerHTML = `
            <tr>
                <td colspan="9" class="empty">
                    لا يوجد موظفون.
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = list.map(employee => {
        const isOwner = currentUser.role === "owner";
        const isSelf =
            String(employee.id) === String(currentUser.id);

        const roleHTML = isOwner && !isSelf
            ? `
                <select data-role-select>
                    <option value="employee"
                        ${employee.role === "employee" ? "selected" : ""}>
                        موظف
                    </option>

                    <option value="manager"
                        ${employee.role === "manager" ? "selected" : ""}>
                        مدير قسم
                    </option>
                </select>
            `
            : `<span>${escapeHTML(roleLabel(employee.role))}</span>`;

        const statusHTML = isOwner && !isSelf
            ? `
                <select data-status-select>
                    <option value="active"
                        ${employee.status === "active" ? "selected" : ""}>
                        مفعّل
                    </option>

                    <option value="suspended"
                        ${employee.status === "suspended" ? "selected" : ""}>
                        موقوف
                    </option>

                    ${employee.status === "pending" ? `
                        <option value="pending" selected>
                            بانتظار التفعيل
                        </option>
                    ` : ""}
                </select>
            `
            : `<span>${escapeHTML(statusLabel(employee.status))}</span>`;

        const actions = `
            ${!isSelf && ["owner", "admin"].includes(currentUser.role) ? `
                <button
                    class="primary"
                    type="button"
                    data-save-permissions>
                    حفظ الصلاحيات
                </button>
            ` : ""}

            ${isOwner && !isSelf ? `
                <button
                    class="secondary"
                    type="button"
                    data-save-account>
                    حفظ الرتبة والحالة
                </button>
            ` : ""}
        `;

        return `
            <tr data-employee-id="${Number(employee.id)}">
                <td>
                    ${escapeHTML(employee.public_id || employee.id)}
                </td>

                <td class="employee-name">
                    ${escapeHTML(employee.full_name || employee.name || "-")}
                </td>

                <td class="permission-cell">
                    <span class="group-title">قروبات الفريق</span>
                    <div class="permission-group">
                        ${permissionGroups.teams
                            .map(p => permissionCheckbox(employee, p))
                            .join("")}
                    </div>
                </td>

                <td class="permission-cell">
                    <span class="group-title">المعرفة</span>
                    <div class="permission-group">
                        ${permissionGroups.knowledge
                            .map(p => permissionCheckbox(employee, p))
                            .join("")}
                    </div>
                </td>

                <td class="permission-cell">
                    <span class="group-title">المهام والقرارات</span>
                    <div class="permission-group">
                        ${permissionGroups.tasks
                            .map(p => permissionCheckbox(employee, p))
                            .join("")}
                    </div>
                </td>

                <td class="permission-cell">
                    <span class="group-title">التقارير</span>
                    <div class="permission-group">
                        ${permissionGroups.reports
                            .map(p => permissionCheckbox(employee, p))
                            .join("")}
                    </div>
                </td>

                ${isOwner ? `
                    <td>${roleHTML}</td>
                    <td>${statusHTML}</td>
                ` : ""}

                <td>
                    <div class="owner-controls">
                        ${actions}
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    bindRowActions();
}

// ربط أزرار الجدول
function bindRowActions() {
    document.querySelectorAll("[data-save-permissions]").forEach(button => {
        button.addEventListener("click", () => {
            savePermissions(button.closest("tr"), button);
        });
    });

    document.querySelectorAll("[data-save-account]").forEach(button => {
        button.addEventListener("click", () => {
            saveAccount(button.closest("tr"), button);
        });
    });
}

// حفظ الصلاحيات التشغيلية
async function savePermissions(row, button) {
    const userId = row.dataset.employeeId;
    const permissions = {};

    allPermissionKeys.forEach(key => {
        const checkbox = row.querySelector(
            `[data-permission="${key}"]`
        );

        permissions[key] = checkbox
            ? checkbox.checked
            : false;
    });

    button.disabled = true;
    button.textContent = "جارٍ الحفظ...";

    try {
        const result = await apiRequest(
            `${API_BASE}/employees/${userId}`,
            {
                method: "PUT",
                body: JSON.stringify(permissions)
            }
        );

        if (!result.success) {
            throw new Error("لم يتم تأكيد حفظ الصلاحيات.");
        }

        showMessage("تم حفظ صلاحيات الموظف بنجاح.");

    } catch (error) {
        showMessage(error.message, "error");

    } finally {
        button.disabled = false;
        button.textContent = "حفظ الصلاحيات";
    }
}

// حفظ الرتبة وحالة الحساب
async function saveAccount(row, button) {
    if (currentUser.role !== "owner") {
        showMessage("هذه العملية متاحة للمالك فقط.", "error");
        return;
    }

    const userId = row.dataset.employeeId;

    const roleSelect = row.querySelector("[data-role-select]");
    const statusSelect = row.querySelector("[data-status-select]");

    if (!roleSelect || !statusSelect) {
        showMessage("تعذر قراءة بيانات الرتبة والحالة.", "error");
        return;
    }

    const role = roleSelect.value;
    const status = statusSelect.value;

    if (!["employee", "manager"].includes(role)) {
        showMessage("الرتبة غير مسموحة.", "error");
        return;
    }

    if (!["active", "suspended"].includes(status)) {
        showMessage(
            "حالة الحساب غير صحيحة. اختر مفعّل أو موقوف.",
            "error"
        );
        return;
    }

    button.disabled = true;
    button.textContent = "جارٍ الحفظ...";

    try {
        // تحديث الرتبة
        const roleResult = await apiRequest(
            `${API_BASE}/employees/${userId}/role`,
            {
                method: "PATCH",
                body: JSON.stringify({ role })
            }
        );

        if (!roleResult.success) {
            throw new Error("لم يتم تأكيد حفظ الرتبة.");
        }

        // تحديث حالة الحساب
        const statusResult = await apiRequest(
            `${API_BASE}/employees/${userId}/status`,
            {
                method: "PATCH",
                body: JSON.stringify({ status })
            }
        );

        if (!statusResult.success) {
            throw new Error("لم يتم تأكيد حفظ حالة الحساب.");
        }

        // إعادة تحميل البيانات والتحقق من نجاحها
        const loaded = await loadEmployees();

        if (!loaded) {
            throw new Error(
                "تم إرسال التحديث، لكن تعذر تحميل البيانات للتحقق منها."
            );
        }

        const updatedEmployee = employees.find(
            employee => String(employee.id) === String(userId)
        );

        if (
            !updatedEmployee ||
            updatedEmployee.role !== role ||
            updatedEmployee.status !== status
        ) {
            throw new Error(
                "البيانات المحفوظة لا تطابق التغييرات المطلوبة."
            );
        }

        showMessage(
            status === "suspended"
                ? "تم إيقاف الحساب وحفظ الحالة بنجاح."
                : "تم تفعيل الحساب وحفظ التغييرات بنجاح."
        );

    } catch (error) {
        showMessage(error.message, "error");

    } finally {
        button.disabled = false;
        button.textContent = "حفظ الرتبة والحالة";
    }
}

// تحميل الموظفين من السيرفر
async function loadEmployees() {
    if (!checkAccess()) return false;

    try {
        const data = await apiRequest(`${API_BASE}/employees`);

        if (!Array.isArray(data.employees)) {
            throw new Error("بيانات الموظفين المستلمة غير صحيحة.");
        }

        employees = data.employees;

        renderEmployees(employees);

        return true;

    } catch (error) {
        showMessage(error.message, "error");

        const body = document.getElementById("employeesBody");

        if (body) {
            body.innerHTML = `
                <tr>
                    <td colspan="9" class="empty">
                        تعذر تحميل الموظفين:
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }

        return false;
    }
}

// البحث عن موظف
document.getElementById("searchInput")?.addEventListener(
    "input",
    event => {
        const query = event.target.value.trim().toLowerCase();

        const filtered = employees.filter(employee => {
            const name = employee.full_name || employee.name || "";
            const id = String(employee.public_id || employee.id || "");

            return (
                name.toLowerCase().includes(query) ||
                id.toLowerCase().includes(query)
            );
        });

        renderEmployees(filtered);
    }
);

// بدء الصفحة
loadEmployees();
