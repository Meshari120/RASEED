
const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");

const router = express.Router();

const COMPANY_ID = 1;

router.post("/", async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            confirmPassword
        } = req.body || {};

        const fullName =
            typeof name === "string" ? name.trim() : "";

        const normalizedEmail =
            typeof email === "string"
                ? email.trim().toLowerCase()
                : "";

        const normalizedPhone =
            typeof phone === "string" ? phone.trim() : "";

        if (
            !fullName ||
            !normalizedEmail ||
            !normalizedPhone ||
            typeof password !== "string" ||
            typeof confirmPassword !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "يرجى تعبئة جميع الحقول."
            });
        }

        if (fullName.length > 150) {
            return res.status(400).json({
                success: false,
                message: "الاسم طويل جدًا."
            });
        }

        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
            normalizedEmail.length > 254
        ) {
            return res.status(400).json({
                success: false,
                message: "البريد الإلكتروني غير صحيح."
            });
        }

        if (!/^\+9665\d{8}$/.test(normalizedPhone)) {
            return res.status(400).json({
                success: false,
                message: "أدخل رقم الجوال بالصيغة +9665XXXXXXXX."
            });
        }

        // الحد الأدنى 6 أحرف، دون حد أعلى محدد هنا.
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل."
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "كلمتا المرور غير متطابقتين."
            });
        }

        const [existingUsers] = await pool.execute(
            `SELECT id
             FROM users
             WHERE email = ? OR phone = ?
             LIMIT 1`,
            [normalizedEmail, normalizedPhone]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message: "البريد الإلكتروني أو رقم الجوال مسجل مسبقًا."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await pool.execute(
            `INSERT INTO users
                (company_id, full_name, email, password_hash,
                 phone, role, status)
             VALUES (?, ?, ?, ?, ?, 'employee', 'pending')`,
            [
                COMPANY_ID,
                fullName,
                normalizedEmail,
                passwordHash,
                normalizedPhone
            ]
        );

        return res.status(201).json({
            success: true,
            message: "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول بعد تفعيل الحساب."
        });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "البريد الإلكتروني أو رقم الجوال مسجل مسبقًا."
            });
        }

        console.error("Registration failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "تعذر إنشاء الحساب حاليًا. حاول مرة أخرى."
        });
    }
});

module.exports = router;
