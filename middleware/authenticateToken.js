
"use strict";

const jwt = require("jsonwebtoken");
const { pool } = require("../db");

async function authenticateToken(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "يلزم تسجيل الدخول."
        });
    }

    const token = header.slice(7).trim();

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "رمز الدخول غير موجود."
        });
    }

    try {
        const secret = process.env.JWT_SECRET;

        if (
            !secret ||
            secret.length < 32 ||
            secret.startsWith("REPLACE_WITH_")
        ) {
            console.error("JWT_SECRET is missing or invalid.");

            return res.status(500).json({
                success: false,
                message: "إعدادات المصادقة غير مكتملة."
            });
        }

        // التحقق من صحة التوكن وتوقيعه
        const decoded = jwt.verify(token, secret, {
            algorithms: ["HS256"],
            issuer: "app-company-platform",
            audience: "app-client"
        });

        const userId = Number(decoded.sub);
        const companyId = Number(decoded.companyId);

        if (
            !Number.isSafeInteger(userId) ||
            userId < 1 ||
            !Number.isSafeInteger(companyId) ||
            companyId < 1
        ) {
            return res.status(401).json({
                success: false,
                message: "رمز الدخول غير صالح."
            });
        }

        // جلب أحدث بيانات الحساب والشركة من قاعدة البيانات
        // يتم تنفيذ هذا الاستعلام مع كل طلب محمي
        const [rows] = await pool.execute(
            `SELECT
                u.id,
                u.company_id,
                u.full_name,
                u.email,
                u.phone,
                u.avatar_url,
                u.job_title,
                u.department,
                u.role,
                u.status,
                u.public_id,
                c.status AS company_status

             FROM app.users u

             INNER JOIN app.companies c
                ON c.id = u.company_id

             WHERE u.id = ?
                AND u.company_id = ?
             LIMIT 1`,
            [userId, companyId]
        );

        if (!rows.length) {
            return res.status(401).json({
                success: false,
                message: "الحساب أو الشركة غير موجود."
            });
        }

        const user = rows[0];

        // منع الحساب الموقوف أو غير النشط
        if (user.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "حسابك غير نشط. يرجى التواصل مع مسؤول النظام."
            });
        }

        // منع الوصول إذا كانت الشركة غير نشطة
        if (user.company_status !== "active") {
            return res.status(403).json({
                success: false,
                message: "الشركة غير نشطة حاليًا."
            });
        }

        // اعتماد بيانات المستخدم الحالية من قاعدة البيانات
        req.user = {
            id: Number(user.id),
            companyId: Number(user.company_id),
            name: user.full_name,
            fullName: user.full_name,
            email: user.email,
            phone: user.phone || "",
            avatarUrl: user.avatar_url || "",
            jobTitle: user.job_title || "",
            department: user.department || "",
            role: user.role,
            status: user.status,
            publicId: user.public_id || ""
        };

        return next();

    } catch (error) {
        // أخطاء التوكن
        if (
            [
                "JsonWebTokenError",
                "TokenExpiredError",
                "NotBeforeError"
            ].includes(error.name)
        ) {
            return res.status(401).json({
                success: false,
                message: "رمز الدخول غير صالح أو منتهي."
            });
        }

        console.error("Authentication failed:", error);

        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء التحقق من الحساب."
        });
    }
}

module.exports = authenticateToken;
