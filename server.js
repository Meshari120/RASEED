
"use strict";

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const path = require("path");
const dotenv = require("dotenv");
const { Server } = require("socket.io");

/* تحميل متغيرات البيئة من جذر المشروع */
dotenv.config({
    path: path.resolve(__dirname, "../.env")
});

/* تحميل قاعدة البيانات والمسارات بعد تحميل البيئة */
const { testDatabase, pool } = require("./db");

const permissionsRoutes = require("./routes/permissions");
const authRoutes = require("./routes/auth");
const registerRoutes = require("./routes/register");
const conversationsRoutes = require("./routes/conversations");
const teamsRoutes = require("./routes/teams");

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || "";

/* التحقق من مفتاح JWT */
if (
    !JWT_SECRET ||
    JWT_SECRET.length < 32 ||
    JWT_SECRET.startsWith("REPLACE_WITH_")
) {
    throw new Error("ضع JWT_SECRET قويًا في متغيرات البيئة.");
}

/* إعدادات الأمان */
app.disable("x-powered-by");

app.use(helmet({
    contentSecurityPolicy: false
}));

/* إعداد CORS */
const corsOptions = {
    origin: CLIENT_URL || false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};

app.use(cors(corsOptions));

/* استقبال البيانات */
app.use(express.json({
    limit: "100kb",
    strict: true
}));

app.use(express.urlencoded({
    extended: false,
    limit: "20kb"
}));

/* تحديد عدد الطلبات */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "طلبات كثيرة. حاول مرة أخرى لاحقًا."
    }
});

app.use("/api", apiLimiter);

/* فحص السيرفر */
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        server: "running"
    });
});

/* فحص اتصال قاعدة البيانات */
app.get("/api/health/database", async (req, res) => {
    try {
        await pool.execute("SELECT 1");

        res.json({
            success: true,
            database: "connected"
        });
    } catch (error) {
        console.error("Database health check failed:", error.message);

        res.status(500).json({
            success: false,
            database: "disconnected"
        });
    }
});

/* مسارات النظام */
app.use("/api/auth", authRoutes);
app.use("/api/auth/register", registerRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/conversations", conversationsRoutes);
app.use("/api/teams", teamsRoutes);

/* ملفات الواجهة */
const websitePath = path.resolve(__dirname, "../website");

app.use(express.static(websitePath));

app.get("/", (req, res) => {
    res.sendFile(path.join(websitePath, "index.html"));
});

/* إعداد Socket.IO */
const io = new Server(server, {
    cors: {
        origin: CLIENT_URL || false,
        methods: ["GET", "POST"],
        credentials: true
    },
    maxHttpBufferSize: 100000
});

app.set("io", io);

/* التحقق من هوية مستخدم Socket.IO */
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string" || !token) {
        return next(new Error("Authentication required"));
    }

    try {
        socket.user = jwt.verify(token, JWT_SECRET, {
            algorithms: ["HS256"],
            issuer: "app-company-platform",
            audience: "app-client"
        });

        next();
    } catch {
        next(new Error("Invalid or expired token"));
    }
});

/* اتصالات القروبات */
io.on("connection", (socket) => {

    socket.on("team:join", async (payload, callback) => {

        const teamId = Number(payload?.teamId);
        const userId = Number(socket.user?.sub);

        if (
            !Number.isSafeInteger(teamId) ||
            teamId < 1 ||
            !Number.isSafeInteger(userId) ||
            userId < 1
        ) {
            if (typeof callback === "function") {
                callback({
                    success: false,
                    message: "بيانات غير صحيحة."
                });
            }

            return;
        }

        try {
            const [rows] = await pool.execute(
                `SELECT 1
                 FROM team_members
                 WHERE team_id = ? AND user_id = ?
                 LIMIT 1`,
                [teamId, userId]
            );

            if (!rows.length) {
                if (typeof callback === "function") {
                    callback({
                        success: false,
                        message: "لست عضوًا في هذا القروب."
                    });
                }

                return;
            }

            await socket.join(`team:${teamId}`);

            if (typeof callback === "function") {
                callback({
                    success: true
                });
            }

        } catch (error) {
            console.error("Socket team join failed:", error.message);

            if (typeof callback === "function") {
                callback({
                    success: false,
                    message: "تعذر الانضمام."
                });
            }
        }
    });

    socket.on("disconnect", () => {
        // إغلاق الاتصال
    });
});

/* معالجة المسارات غير الموجودة في API */
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "مسار API غير موجود."
    });
});

/* معالجة الصفحات غير الموجودة */
app.use((req, res) => {
    res.status(404).send("الصفحة المطلوبة غير موجودة.");
});

/* معالج الأخطاء */
app.use((error, req, res, next) => {

    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            success: false,
            message: "صيغة البيانات المرسلة غير صحيحة."
        });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            success: false,
            message: "حجم الطلب أكبر من المسموح."
        });
    }

    console.error("Request failed:", error.message);

    return res.status(500).json({
        success: false,
        message: "حدث خطأ داخلي في السيرفر."
    });
});

/* تشغيل السيرفر */
async function startServer() {

    try {
        await testDatabase();

        server.listen(PORT, "0.0.0.0", () => {
            console.log(`RASEED server running on port ${PORT}`);
        });

    } catch (error) {
        console.error("Could not start server:", error.message);

        process.exitCode = 1;

        await pool.end().catch(() => {});
    }
}

/* إغلاق آمن للسيرفر */
async function shutdown() {

    console.log("Shutting down RASEED server...");

    io.close();

    server.close(async () => {
        await pool.end().catch(() => {});
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
