
"use strict";

const express = require("express");
const { pool } = require("../db");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

router.use(authenticateToken);

// الصلاحيات التشغيلية المعتمدة
const OPERATIONAL_PERMISSIONS = [
    "can_create_team_groups",
    "can_delete_team_groups",
    "can_add_knowledge_documents",
    "can_add_tasks",
    "can_create_reports",
    "can_edit_reports"
];

// حالات الحساب المعتمدة
const ALLOWED_ACCOUNT_STATUSES = [
    "active",
    "pending",
    "suspended"
];

// التحقق من صحة رقم المستخدم
function validId(value) {
    return /^\d+$/.test(String(value)) &&
        Number.isSafeInteger(Number(value)) &&
        Number(value) > 0;
}

// التحقق من أن المستخدم هو مالك الشركة
function isOwner(req) {
    return req.user?.role === "owner";
}

// السماح للمالك والمسؤول بإدارة الصلاحيات التشغيلية
function canManagePermissions(req) {
    return ["owner", "admin"].includes(req.user?.role);
}

// منع الوصول لمن لا يملك صلاحية الإدارة
function denyUnlessManager(req, res) {
    if (!canManagePermissions(req)) {
        res.status(403).json({
            success: false,
            message: "ليس لديك صلاحية إدارة صلاحيات الموظفين."
        });

        return true;
    }

    return false;
}

/*
 * GET /api/permissions/employees
 * عرض موظفي الشركة وصلاحياتهم.
 */
router.get("/employees", async (req, res) => {
    if (denyUnlessManager(req, res)) return;

    try {
        const [employees] = await pool.execute(
            `SELECT
                u.id,
                u.public_id,
                u.full_name,
                u.email,
                u.job_title,
                u.role,
                u.status,

                COALESCE(p.can_create_team_groups, 0) AS can_create_team_groups,
                COALESCE(p.can_delete_team_groups, 0) AS can_delete_team_groups,
                COALESCE(p.can_add_knowledge_documents, 0) AS can_add_knowledge_documents,
                COALESCE(p.can_add_tasks, 0) AS can_add_tasks,
                COALESCE(p.can_create_reports, 0) AS can_create_reports,
                COALESCE(p.can_edit_reports, 0) AS can_edit_reports

            FROM app.users u

            LEFT JOIN app.user_permissions p
                ON p.user_id = u.id
                AND p.company_id = u.company_id

            WHERE u.company_id = ?
                AND u.role <> 'owner'
                AND u.status <> 'deleted'

            ORDER BY u.full_name ASC`,
            [req.user.companyId]
        );

        return res.json({
            success: true,
            employees
        });

    } catch (error) {
        console.error("Load employees failed:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل قائمة الموظفين."
        });
    }
});


/*
 * PUT /api/permissions/employees/:userId
 * حفظ الصلاحيات التشغيلية للموظف.
 */
router.put("/employees/:userId", async (req, res) => {
    if (denyUnlessManager(req, res)) return;

    const targetId = req.params.userId;

    if (!validId(targetId)) {
        return res.status(400).json({
            success: false,
            message: "رقم الموظف غير صحيح."
        });
    }

    const body = req.body || {};

    // التأكد من إرسال جميع الصلاحيات بقيم Boolean
    for (const permission of OPERATIONAL_PERMISSIONS) {
        if (typeof body[permission] !== "boolean") {
            return res.status(400).json({
                success: false,
                message: `يجب تحديد صلاحية ${permission}.`
            });
        }
    }

    try {
        const [users] = await pool.execute(
            `SELECT id, role, status
             FROM app.users
             WHERE id = ?
                AND company_id = ?
                AND role <> 'owner'
                AND status <> 'deleted'
             LIMIT 1`,
            [Number(targetId), req.user.companyId]
        );

        if (!users.length) {
            return res.status(404).json({
                success: false,
                message: "الموظف غير موجود في شركتك."
            });
        }

        // منع المسؤول من تعديل صلاحيات حسابه
        if (
            !isOwner(req) &&
            Number(targetId) === Number(req.user.id)
        ) {
            return res.status(403).json({
                success: false,
                message: "لا يمكنك تعديل صلاحيات حسابك بنفسك."
            });
        }

        // تعديل صلاحيات المسؤولين متاح للمالك فقط
        if (!isOwner(req) && users[0].role === "admin") {
            return res.status(403).json({
                success: false,
                message: "تعديل صلاحيات المسؤولين متاح لمالك الشركة فقط."
            });
        }

        const columns = OPERATIONAL_PERMISSIONS.join(", ");

        const placeholders = OPERATIONAL_PERMISSIONS
            .map(() => "?")
            .join(", ");

        const updateColumns = OPERATIONAL_PERMISSIONS
            .map(column => `${column} = VALUES(${column})`)
            .join(", ");

        const values = OPERATIONAL_PERMISSIONS.map(
            permission => body[permission] ? 1 : 0
        );

        await pool.execute(
            `INSERT INTO app.user_permissions (
                company_id,
                user_id,
                ${columns}
            )
            VALUES (?, ?, ${placeholders})
            ON DUPLICATE KEY UPDATE
                ${updateColumns}`,
            [
                req.user.companyId,
                Number(targetId),
                ...values
            ]
        );

        return res.json({
            success: true,
            message: "تم حفظ صلاحيات الموظف بنجاح."
        });

    } catch (error) {
        console.error("Save employee permissions failed:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر حفظ صلاحيات الموظف."
        });
    }
});


/*
 * PATCH /api/permissions/employees/:userId/role
 * تغيير الرتبة بين موظف ومدير قسم.
 * مالك الشركة فقط.
 */
router.patch("/employees/:userId/role", async (req, res) => {
    if (!isOwner(req)) {
        return res.status(403).json({
            success: false,
            message: "مالك الشركة فقط يستطيع تغيير رتب الموظفين."
        });
    }

    const targetId = req.params.userId;
    const role = req.body?.role;

    if (!validId(targetId)) {
        return res.status(400).json({
            success: false,
            message: "رقم الموظف غير صحيح."
        });
    }

    if (!["employee", "manager"].includes(role)) {
        return res.status(400).json({
            success: false,
            message: "يمكن اختيار موظف أو مدير قسم فقط."
        });
    }

    if (Number(targetId) === Number(req.user.id)) {
        return res.status(403).json({
            success: false,
            message: "لا يمكن تغيير رتبة حساب المالك."
        });
    }

    try {
        const [users] = await pool.execute(
            `SELECT id
             FROM app.users
             WHERE id = ?
                AND company_id = ?
                AND role NOT IN ('owner', 'admin')
                AND status <> 'deleted'
             LIMIT 1`,
            [Number(targetId), req.user.companyId]
        );

        if (!users.length) {
            return res.status(404).json({
                success: false,
                message: "الموظف غير موجود أو لا يمكن تغيير رتبته."
            });
        }

        await pool.execute(
            `UPDATE app.users
             SET role = ?
             WHERE id = ?
                AND company_id = ?
                AND role NOT IN ('owner', 'admin')
                AND status <> 'deleted'`,
            [
                role,
                Number(targetId),
                req.user.companyId
            ]
        );

        return res.json({
            success: true,
            message: role === "manager"
                ? "تم تعيين الموظف مدير قسم."
                : "تم تحويل المدير إلى موظف."
        });

    } catch (error) {
        console.error("Change employee role failed:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تغيير رتبة الموظف."
        });
    }
});


/*
 * PATCH /api/permissions/employees/:userId/status
 * تفعيل أو إيقاف حساب الموظف.
 * مالك الشركة فقط.
 */
router.patch("/employees/:userId/status", async (req, res) => {
    if (!isOwner(req)) {
        return res.status(403).json({
            success: false,
            message: "مالك الشركة فقط يستطيع تغيير حالة الحساب."
        });
    }

    const targetId = req.params.userId;
    const status = req.body?.status;

    if (!validId(targetId)) {
        return res.status(400).json({
            success: false,
            message: "رقم الموظف غير صحيح."
        });
    }

    if (!ALLOWED_ACCOUNT_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            message: "الحالة يجب أن تكون active أو pending أو suspended."
        });
    }

    if (Number(targetId) === Number(req.user.id)) {
        return res.status(403).json({
            success: false,
            message: "لا يمكن تغيير حالة حساب المالك من هذه الصفحة."
        });
    }

    try {
        // التأكد من وجود الموظف داخل الشركة
        const [users] = await pool.execute(
            `SELECT id, role
             FROM app.users
             WHERE id = ?
                AND company_id = ?
                AND role NOT IN ('owner', 'admin')
                AND status <> 'deleted'
             LIMIT 1`,
            [Number(targetId), req.user.companyId]
        );

        if (!users.length) {
            return res.status(404).json({
                success: false,
                message: "الموظف غير موجود أو لا يمكن تغيير حالته."
            });
        }

        // تحديث الحالة في قاعدة البيانات
        await pool.execute(
            `UPDATE app.users
             SET status = ?
             WHERE id = ?
                AND company_id = ?
                AND role NOT IN ('owner', 'admin')
                AND status <> 'deleted'`,
            [
                status,
                Number(targetId),
                req.user.companyId
            ]
        );

        const messages = {
            active: "تم تفعيل الحساب بنجاح.",
            pending: "تم تحويل الحساب إلى بانتظار التفعيل.",
            suspended: "تم إيقاف الحساب بنجاح."
        };

        return res.json({
            success: true,
            message: messages[status],
            status
        });

    } catch (error) {
        console.error("Change employee status failed:", error);

        return res.status(500).json({
            success: false,
            message: "تعذر تغيير حالة الحساب."
        });
    }
});

module.exports = router;
