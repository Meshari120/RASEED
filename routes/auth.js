
"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

/* =========================
   محدد محاولات تسجيل الدخول
========================= */

const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "محاولات كثيرة. حاول بعد 5 دقيقة."
    }
});

/* =========================
   دالة عرض الرتبة
========================= */

function getRoleLabel(role) {
    const roles = {
        owner: "مالك الشركة",
        admin: "مسؤول النظام",
        manager: "مدير",
        employee: "موظف"
    };

    return roles[String(role || "").toLowerCase()] || "غير محدد";
}

/* =========================
   تسجيل الدخول
   POST /api/auth/login
========================= */

router.post("/login", loginLimiter, async (req, res) => {
    try {
        const email =
            typeof req.body?.email === "string"
                ? req.body.email.trim().toLowerCase()
                : "";

        const password =
            typeof req.body?.password === "string"
                ? req.body.password
                : "";

        if (
            !email ||
            email.length > 255 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            !password ||
            password.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "تحقق من البريد الإلكتروني وكلمة المرور."
            });
        }

        // جلب بيانات المستخدم الحالية من قاعدة البيانات
        const [rows] = await pool.execute(
            `SELECT
                id,
                company_id,
                full_name,
                email,
                password_hash,
                phone,
                avatar_url,
                job_title,
                department,
                role,
                status,
                public_id
             FROM app.users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        const user = rows[0];

        if (
            !user ||
            !user.password_hash ||
            !(await bcrypt.compare(password, user.password_hash))
        ) {
            return res.status(401).json({
                success: false,
                message: "البريد الإلكتروني أو كلمة المرور غير صحيحة."
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "حسابك غير نشط. يرجى التواصل مع مسؤول النظام."
            });
        }

        // التحقق من حالة الشركة
        const [companies] = await pool.execute(
            `SELECT status
             FROM app.companies
             WHERE id = ?
             LIMIT 1`,
            [user.company_id]
        );

        if (!companies.length || companies[0].status !== "active") {
            return res.status(403).json({
                success: false,
                message: "الشركة غير نشطة حاليًا."
            });
        }

        // التحقق من مفتاح JWT
        const jwtSecret = process.env.JWT_SECRET;

        if (
            !jwtSecret ||
            jwtSecret.length < 32 ||
            jwtSecret.startsWith("REPLACE_WITH_")
        ) {
            throw new Error("JWT_SECRET is missing or invalid.");
        }

        // عنوان IP الذي يراه السيرفر
        // يعتمد req.ip على إعداد trust proxy في Express إن وجد
        const clientIp = (
            req.ip ||
            req.socket?.remoteAddress ||
            ""
        ).slice(0, 45);

        // تسجيل آخر دخول في قاعدة البيانات
        await pool.execute(
            `UPDATE app.users
             SET last_login_ip = ?,
                 last_login_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND company_id = ?`,
            [
                clientIp || null,
                user.id,
                user.company_id
            ]
        );

        // إنشاء رمز الدخول
        const token = jwt.sign(
            {
                sub: String(user.id),
                companyId: String(user.company_id)
            },
            jwtSecret,
            {
                algorithm: "HS256",
                expiresIn: "30m",
                issuer: "app-company-platform",
                audience: "app-client"
            }
        );

        return res.json({
            success: true,
            message: "تم تسجيل الدخول بنجاح.",
            token,

            user: {
                id: user.id,
                companyId: user.company_id,
                name: user.full_name,
                fullName: user.full_name,
                email: user.email,
                phone: user.phone || "",
                avatarUrl: user.avatar_url || "",
                jobTitle: user.job_title || "",
                department: user.department || "",
                role: user.role,
                roleLabel: getRoleLabel(user.role),
                status: user.status,
                publicId: user.public_id || "",
                lastLoginIp: clientIp || ""
            }
        });

    } catch (error) {
        console.error("Login failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "حدث خطأ داخلي أثناء تسجيل الدخول."
        });
    }
});

/* =========================
   تحميل الإعدادات
   GET /api/auth/settings
========================= */

router.get("/settings", authenticateToken, async (req, res) => {
    try {
        // قراءة أحدث بيانات الحساب من قاعدة البيانات
        const [users] = await pool.execute(
            `SELECT
                id,
                company_id,
                full_name,
                email,
                phone,
                job_title,
                department,
                role,
                status,
                public_id,
                last_login_ip,
                last_login_at
             FROM app.users
             WHERE id = ?
               AND company_id = ?
               AND status = 'active'
             LIMIT 1`,
            [req.user.id, req.user.companyId]
        );

        if (!users.length) {
            return res.status(404).json({
                success: false,
                message: "لم يتم العثور على الحساب."
            });
        }

        const user = users[0];

        // جلب تفضيلات المستخدم
        const [preferences] = await pool.execute(
            `SELECT
                task_notifications,
                chat_notifications,
                weekly_summary
             FROM app.user_preferences
             WHERE user_id = ?
               AND company_id = ?
             LIMIT 1`,
            [req.user.id, req.user.companyId]
        );

        const saved = preferences[0] || {};

        return res.json({
            success: true,

            user: {
                id: user.id,
                companyId: user.company_id,
                fullName: user.full_name,
                email: user.email,
                phone: user.phone || "",
                jobTitle: user.job_title || "",
                department: user.department || "",
                role: user.role,
                roleLabel: getRoleLabel(user.role),
                status: user.status,
                publicId: user.public_id || "",
                lastLoginIp: user.last_login_ip || "",
                lastLoginAt: user.last_login_at || null
            },

            preferences: {
                taskNotifications:
                    saved.task_notifications == null
                        ? true
                        : Boolean(saved.task_notifications),

                chatNotifications:
                    saved.chat_notifications == null
                        ? true
                        : Boolean(saved.chat_notifications),

                weeklySummary:
                    saved.weekly_summary == null
                        ? false
                        : Boolean(saved.weekly_summary)
            }
        });

    } catch (error) {
        console.error("Load settings failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل الإعدادات."
        });
    }
});

/* =========================
   تحديث الملف الشخصي
   PUT /api/auth/settings/profile
========================= */

router.put("/settings/profile", authenticateToken, async (req, res) => {
    try {
        const fullName =
            typeof req.body?.fullName === "string"
                ? req.body.fullName.trim()
                : "";

        const email =
            typeof req.body?.email === "string"
                ? req.body.email.trim().toLowerCase()
                : "";

        const phone =
            typeof req.body?.phone === "string"
                ? req.body.phone.trim()
                : "";

        const jobTitle =
            typeof req.body?.jobTitle === "string"
                ? req.body.jobTitle.trim()
                : "";

        if (!fullName || fullName.length > 200) {
            return res.status(400).json({
                success: false,
                message: "الاسم مطلوب ويجب ألا يتجاوز 200 حرف."
            });
        }

        if (
            !email ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return res.status(400).json({
                success: false,
                message: "البريد الإلكتروني غير صحيح."
            });
        }

        if (phone.length > 30 || jobTitle.length > 150) {
            return res.status(400).json({
                success: false,
                message: "تحقق من طول رقم الجوال والمسمى الوظيفي."
            });
        }

        // التأكد من عدم استخدام البريد في حساب آخر
        const [duplicate] = await pool.execute(
            `SELECT id
             FROM app.users
             WHERE email = ?
               AND id <> ?
             LIMIT 1`,
            [email, req.user.id]
        );

        if (duplicate.length) {
            return res.status(409).json({
                success: false,
                message: "البريد الإلكتروني مستخدم من حساب آخر."
            });
        }

        // تحديث بيانات الحساب
        const [result] = await pool.execute(
            `UPDATE app.users
             SET full_name = ?,
                 email = ?,
                 phone = ?,
                 job_title = ?
             WHERE id = ?
               AND company_id = ?
               AND status = 'active'`,
            [
                fullName,
                email,
                phone || null,
                jobTitle || null,
                req.user.id,
                req.user.companyId
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "لم يتم تحديث الحساب."
            });
        }

        return res.json({
            success: true,
            message: "تم تحديث بيانات الحساب.",

            user: {
                fullName,
                email,
                phone,
                jobTitle
            }
        });

    } catch (error) {
        console.error("Update profile failed:", error.message);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "البريد الإلكتروني مستخدم بالفعل."
            });
        }

        return res.status(500).json({
            success: false,
            message: "تعذر تحديث بيانات الحساب."
        });
    }
});

/* =========================
   حفظ تفضيلات المنصة
   PUT /api/auth/settings/preferences
========================= */

router.put(
    "/settings/preferences",
    authenticateToken,
    async (req, res) => {
        try {
            const body = req.body || {};

            const keys = [
                "taskNotifications",
                "chatNotifications",
                "weeklySummary"
            ];

            for (const key of keys) {
                if (typeof body[key] !== "boolean") {
                    return res.status(400).json({
                        success: false,
                        message: "يرجى تحديد جميع تفضيلات المنصة."
                    });
                }
            }

            const [users] = await pool.execute(
                `SELECT id
                 FROM app.users
                 WHERE id = ?
                   AND company_id = ?
                   AND status = 'active'
                 LIMIT 1`,
                [req.user.id, req.user.companyId]
            );

            if (!users.length) {
                return res.status(403).json({
                    success: false,
                    message: "الحساب غير نشط أو غير موجود."
                });
            }

            await pool.execute(
                `INSERT INTO app.user_preferences
                    (
                        user_id,
                        company_id,
                        task_notifications,
                        chat_notifications,
                        weekly_summary
                    )
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    company_id = VALUES(company_id),
                    task_notifications = VALUES(task_notifications),
                    chat_notifications = VALUES(chat_notifications),
                    weekly_summary = VALUES(weekly_summary)`,
                [
                    req.user.id,
                    req.user.companyId,
                    Number(body.taskNotifications),
                    Number(body.chatNotifications),
                    Number(body.weeklySummary)
                ]
            );

            return res.json({
                success: true,
                message: "تم حفظ التفضيلات."
            });

        } catch (error) {
            console.error("Save preferences failed:", error.message);

            return res.status(500).json({
                success: false,
                message: "تعذر حفظ التفضيلات."
            });
        }
    }
);

/* =========================
   تغيير كلمة المرور
   PUT /api/auth/settings/password
========================= */

router.put(
    "/settings/password",
    authenticateToken,
    async (req, res) => {
        try {
            const currentPassword =
                typeof req.body?.currentPassword === "string"
                    ? req.body.currentPassword
                    : "";

            const newPassword =
                typeof req.body?.newPassword === "string"
                    ? req.body.newPassword
                    : "";

            if (
                !currentPassword ||
                !newPassword ||
                newPassword.length < 12 ||
                newPassword.length > 128
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "كلمة المرور الجديدة يجب أن تكون بين 12 و128 حرفًا."
                });
            }

            const [rows] = await pool.execute(
                `SELECT password_hash
                 FROM app.users
                 WHERE id = ?
                   AND company_id = ?
                   AND status = 'active'
                 LIMIT 1`,
                [req.user.id, req.user.companyId]
            );

            if (!rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "لم يتم العثور على الحساب."
                });
            }

            const matches = await bcrypt.compare(
                currentPassword,
                rows[0].password_hash
            );

            if (!matches) {
                return res.status(400).json({
                    success: false,
                    message: "كلمة المرور الحالية غير صحيحة."
                });
            }

            if (currentPassword === newPassword) {
                return res.status(400).json({
                    success: false,
                    message: "اختر كلمة مرور مختلفة عن الحالية."
                });
            }

            const passwordHash = await bcrypt.hash(newPassword, 12);

            const [result] = await pool.execute(
                `UPDATE app.users
                 SET password_hash = ?
                 WHERE id = ?
                   AND company_id = ?
                   AND status = 'active'`,
                [
                    passwordHash,
                    req.user.id,
                    req.user.companyId
                ]
            );

            if (!result.affectedRows) {
                return res.status(400).json({
                    success: false,
                    message: "لم يتم تغيير كلمة المرور."
                });
            }

            return res.json({
                success: true,
                message: "تم تغيير كلمة المرور بنجاح."
            });

        } catch (error) {
            console.error("Change password failed:", error.message);

            return res.status(500).json({
                success: false,
                message: "تعذر تغيير كلمة المرور."
            });
        }
    }
);

module.exports = router;
