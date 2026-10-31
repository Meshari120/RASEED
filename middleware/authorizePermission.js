
"use strict";

const { pool } = require("../db");

const VALID_PERMISSIONS = new Set([
    "can_create_team_groups",
    "can_delete_team_groups",
    "can_add_knowledge_documents",
    "can_add_tasks",
    "can_create_reports",
    "can_edit_reports"
]);

module.exports = function authorizePermission(permission) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "يلزم تسجيل الدخول."
            });
        }

        if (!VALID_PERMISSIONS.has(permission)) {
            return res.status(500).json({
                success: false,
                message: "إعداد الصلاحية غير صحيح."
            });
        }

        if (req.user.role === "owner") {
            return next();
        }

        try {
            const [rows] = await pool.execute(
                `SELECT ${permission} AS allowed
                 FROM user_permissions
                 WHERE user_id = ?
                   AND company_id = ?
                 LIMIT 1`,
                [req.user.id, req.user.companyId]
            );

            if (!rows.length || Number(rows[0].allowed) !== 1) {
                return res.status(403).json({
                    success: false,
                    message: "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية."
                });
            }

            return next();
        } catch (error) {
            console.error("Permission check failed:", error.message);

            return res.status(500).json({
                success: false,
                message: "تعذر التحقق من الصلاحيات."
            });
        }
    };
};
