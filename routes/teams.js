
"use strict";

const express = require("express");
const { pool } = require("../db");
const authenticateToken = require("../middleware/authenticateToken");
const authorizePermission = require("../middleware/authorizePermission");

const router = express.Router();

router.use(authenticateToken);

/* التحقق من صحة المعرف */
function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/* التأكد من عضوية المستخدم في القروب */
async function isTeamMember(teamId, userId, companyId) {
    const [rows] = await pool.execute(
        `SELECT 1
         FROM teams t
         INNER JOIN team_members tm ON tm.team_id = t.id
         WHERE t.id = ?
           AND t.company_id = ?
           AND tm.user_id = ?
         LIMIT 1`,
        [teamId, companyId, userId]
    );

    return rows.length > 0;
}

/* =========================================
   عرض قروبات المستخدم
========================================= */

router.get("/", async (req, res) => {
    try {
        const [teams] = await pool.execute(
            `SELECT
                t.id,
                t.group_id,
                g.name AS group_name,
                t.name,
                t.description,
                t.created_by,
                t.created_at,
                t.updated_at,
                tm.team_role
             FROM teams t
             INNER JOIN team_members tm
                ON tm.team_id = t.id
             LEFT JOIN team_groups g
                ON g.id = t.group_id
             WHERE tm.user_id = ?
               AND t.company_id = ?
               AND t.status = 'active'
             ORDER BY g.name ASC, t.updated_at DESC`,
            [req.user.id, req.user.companyId]
        );

        return res.json({
            success: true,
            teams
        });

    } catch (error) {
        console.error("List teams failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل القروبات."
        });
    }
});

/* =========================================
   عرض المجموعات والقروبات التابعة لها
========================================= */

router.get("/groups", async (req, res) => {
    try {
        const [groups] = await pool.execute(
            `SELECT
                g.id,
                g.name,
                g.description,
                g.created_by,
                g.created_at
             FROM team_groups g
             WHERE g.company_id = ?
               AND g.status = 'active'
               AND EXISTS (
                   SELECT 1
                   FROM teams t
                   INNER JOIN team_members tm
                       ON tm.team_id = t.id
                   WHERE t.group_id = g.id
                     AND tm.user_id = ?
                     AND t.status = 'active'
               )
             ORDER BY g.created_at DESC`,
            [req.user.companyId, req.user.id]
        );

        const [teams] = await pool.execute(
            `SELECT
                t.id,
                t.group_id,
                t.name,
                t.description,
                t.created_by,
                tm.team_role
             FROM teams t
             INNER JOIN team_members tm
                ON tm.team_id = t.id
             WHERE t.company_id = ?
               AND tm.user_id = ?
               AND t.status = 'active'
             ORDER BY t.name ASC`,
            [req.user.companyId, req.user.id]
        );

        const result = groups.map(group => ({
            ...group,
            teams: teams.filter(
                team => Number(team.group_id) === Number(group.id)
            )
        }));

        return res.json({
            success: true,
            groups: result
        });

    } catch (error) {
        console.error("List groups failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل المجموعات."
        });
    }
});

/* =========================================
   إنشاء مجموعة وقروب وقناة محادثة
   يتطلب صلاحية can_create_team_groups
========================================= */

router.post(
    "/",
    authorizePermission("can_create_team_groups"),
    async (req, res) => {

        const groupName =
            typeof req.body?.groupName === "string"
                ? req.body.groupName.trim()
                : "";

        const teamName =
            typeof req.body?.teamName === "string"
                ? req.body.teamName.trim()
                : "";

        const description =
            typeof req.body?.description === "string"
                ? req.body.description.trim()
                : "";

        if (
            !groupName ||
            !teamName ||
            groupName.length > 150 ||
            teamName.length > 150 ||
            description.length > 500
        ) {
            return res.status(400).json({
                success: false,
                message: "يرجى إدخال اسم المجموعة واسم القروب بشكل صحيح."
            });
        }

        let connection;

        try {
            connection = await pool.getConnection();

            await connection.beginTransaction();

            /* التأكد من أن الشركة نشطة */
            const [companies] = await connection.execute(
                `SELECT id
                 FROM companies
                 WHERE id = ?
                   AND status = 'active'
                 LIMIT 1`,
                [req.user.companyId]
            );

            if (!companies.length) {
                await connection.rollback();

                return res.status(403).json({
                    success: false,
                    message: "الشركة غير نشطة."
                });
            }

            /* إنشاء المجموعة */
            const [groupResult] = await connection.execute(
                `INSERT INTO team_groups
                    (company_id, name, description, created_by)
                 VALUES (?, ?, ?, ?)`,
                [
                    req.user.companyId,
                    groupName,
                    null,
                    req.user.id
                ]
            );

            const groupId = groupResult.insertId;

            /* إنشاء القروب داخل المجموعة */
            const [teamResult] = await connection.execute(
                `INSERT INTO teams
                    (company_id, group_id, name, description, created_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    req.user.companyId,
                    groupId,
                    teamName,
                    description || null,
                    req.user.id
                ]
            );

            const teamId = teamResult.insertId;

            /* إضافة المنشئ قائدًا للقروب */
            await connection.execute(
                `INSERT INTO team_members
                    (team_id, user_id, team_role, added_by)
                 VALUES (?, ?, 'leader', ?)`,
                [
                    teamId,
                    req.user.id,
                    req.user.id
                ]
            );

            /* إنشاء قناة المحادثة الخاصة بالقروب */
            const [channelResult] = await connection.execute(
                `INSERT INTO team_channels
                    (team_id, name, description, is_private)
                 VALUES (?, 'عام', NULL, 1)`,
                [teamId]
            );

            await connection.commit();

            return res.status(201).json({
                success: true,
                message: "تم إنشاء المجموعة والقروب بنجاح.",
                group: {
                    id: groupId,
                    name: groupName
                },
                team: {
                    id: teamId,
                    group_id: groupId,
                    company_id: req.user.companyId,
                    name: teamName,
                    description: description || null,
                    created_by: req.user.id
                },
                channel: {
                    id: channelResult.insertId,
                    name: "عام"
                }
            });

        } catch (error) {

            if (connection) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        "Create group rollback failed:",
                        rollbackError.message
                    );
                }
            }

            console.error("Create group and team failed:", error.message);

            return res.status(500).json({
                success: false,
                message: "تعذر إنشاء المجموعة والقروب."
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

/* =========================================
   حذف قروب
========================================= */

router.delete(
    "/:teamId",
    authorizePermission("can_delete_team_groups"),
    async (req, res) => {

        const teamId = validId(req.params.teamId);

        if (!teamId) {
            return res.status(400).json({
                success: false,
                message: "رقم القروب غير صحيح."
            });
        }

        let connection;

        try {
            connection = await pool.getConnection();

            await connection.beginTransaction();

            const [teams] = await connection.execute(
                `SELECT id
                 FROM teams
                 WHERE id = ?
                   AND company_id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [teamId, req.user.companyId]
            );

            if (!teams.length) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message: "القروب غير موجود في شركتك."
                });
            }

            /* حذف قراءات الرسائل */
            await connection.execute(
                `DELETE FROM channel_message_reads
                 WHERE message_id IN (
                     SELECT id
                     FROM channel_messages
                     WHERE channel_id IN (
                         SELECT id
                         FROM team_channels
                         WHERE team_id = ?
                     )
                 )`,
                [teamId]
            );

            /* حذف الرسائل */
            await connection.execute(
                `DELETE FROM channel_messages
                 WHERE channel_id IN (
                     SELECT id
                     FROM team_channels
                     WHERE team_id = ?
                 )`,
                [teamId]
            );

            /* حذف الأعضاء */
            await connection.execute(
                `DELETE FROM team_members
                 WHERE team_id = ?`,
                [teamId]
            );

            /* حذف القناة */
            await connection.execute(
                `DELETE FROM team_channels
                 WHERE team_id = ?`,
                [teamId]
            );

            /* حذف القروب */
            await connection.execute(
                `DELETE FROM teams
                 WHERE id = ?
                   AND company_id = ?`,
                [teamId, req.user.companyId]
            );

            await connection.commit();

            return res.json({
                success: true,
                message: "تم حذف القروب بنجاح."
            });

        } catch (error) {

            if (connection) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        "Delete team rollback failed:",
                        rollbackError.message
                    );
                }
            }

            console.error("Delete team failed:", error.message);

            return res.status(500).json({
                success: false,
                message: "تعذر حذف القروب."
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

/* =========================================
   عرض أعضاء القروب
========================================= */

router.get("/:teamId/members", async (req, res) => {
    const teamId = validId(req.params.teamId);

    if (!teamId) {
        return res.status(400).json({
            success: false,
            message: "رقم القروب غير صحيح."
        });
    }

    try {
        if (
            !(await isTeamMember(
                teamId,
                req.user.id,
                req.user.companyId
            ))
        ) {
            return res.status(403).json({
                success: false,
                message: "لست عضوًا في هذا القروب."
            });
        }

        const [members] = await pool.execute(
            `SELECT
                u.id,
                u.full_name,
                u.email,
                tm.team_role,
                tm.joined_at
             FROM team_members tm
             INNER JOIN teams t
                ON t.id = tm.team_id
             INNER JOIN users u
                ON u.id = tm.user_id
             WHERE tm.team_id = ?
               AND t.company_id = ?
               AND u.company_id = t.company_id
             ORDER BY tm.joined_at ASC`,
            [teamId, req.user.companyId]
        );

        return res.json({
            success: true,
            members
        });

    } catch (error) {
        console.error("List members failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل أعضاء القروب."
        });
    }
});

/* =========================================
   عرض رسائل القروب
========================================= */

router.get("/:teamId/messages", async (req, res) => {
    const teamId = validId(req.params.teamId);

    if (!teamId) {
        return res.status(400).json({
            success: false,
            message: "رقم القروب غير صحيح."
        });
    }

    try {
        if (
            !(await isTeamMember(
                teamId,
                req.user.id,
                req.user.companyId
            ))
        ) {
            return res.status(403).json({
                success: false,
                message: "لست عضوًا في هذا القروب."
            });
        }

        const requestedLimit = Number.parseInt(req.query.limit, 10);

        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(100, requestedLimit))
            : 50;

        const [rows] = await pool.execute(
            `SELECT
                m.id,
                c.team_id,
                m.channel_id,
                m.sender_id,
                u.full_name AS sender_name,
                m.body,
                m.created_at,
                m.edited_at,
                m.deleted_at
             FROM channel_messages m
             INNER JOIN team_channels c
                ON c.id = m.channel_id
             INNER JOIN teams t
                ON t.id = c.team_id
             INNER JOIN users u
                ON u.id = m.sender_id
             INNER JOIN team_members tm
                ON tm.team_id = t.id
               AND tm.user_id = ?
             WHERE c.team_id = ?
               AND t.company_id = ?
               AND u.company_id = t.company_id
               AND m.deleted_at IS NULL
             ORDER BY m.id DESC
             LIMIT ?`,
            [
                req.user.id,
                teamId,
                req.user.companyId,
                limit
            ]
        );

        return res.json({
            success: true,
            messages: rows.reverse()
        });

    } catch (error) {
        console.error("Load messages failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "تعذر تحميل الرسائل."
        });
    }
});

/* =========================================
   إرسال رسالة إلى القروب
========================================= */

router.post("/:teamId/messages", async (req, res) => {
    const teamId = validId(req.params.teamId);

    const body =
        typeof req.body?.body === "string"
            ? req.body.body.trim()
            : "";

    if (!teamId || !body || body.length > 4000) {
        return res.status(400).json({
            success: false,
            message: "تحقق من رقم القروب ومحتوى الرسالة."
        });
    }

    try {
        if (
            !(await isTeamMember(
                teamId,
                req.user.id,
                req.user.companyId
            ))
        ) {
            return res.status(403).json({
                success: false,
                message: "لست عضوًا في هذا القروب."
            });
        }

        const [channels] = await pool.execute(
            `SELECT c.id
             FROM team_channels c
             INNER JOIN teams t
                ON t.id = c.team_id
             WHERE c.team_id = ?
               AND t.company_id = ?
             LIMIT 1`,
            [teamId, req.user.companyId]
        );

        if (!channels.length) {
            return res.status(404).json({
                success: false,
                message: "لا توجد قناة محادثة لهذا القروب."
            });
        }

        const channelId = channels[0].id;

        const [result] = await pool.execute(
            `INSERT INTO channel_messages
                (channel_id, sender_id, body)
             VALUES (?, ?, ?)`,
            [channelId, req.user.id, body]
        );

        await pool.execute(
            `UPDATE teams
             SET updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND company_id = ?`,
            [teamId, req.user.companyId]
        );

        const [rows] = await pool.execute(
            `SELECT
                m.id,
                c.team_id,
                m.channel_id,
                m.sender_id,
                u.full_name AS sender_name,
                m.body,
                m.created_at,
                m.edited_at,
                m.deleted_at
             FROM channel_messages m
             INNER JOIN team_channels c
                ON c.id = m.channel_id
             INNER JOIN teams t
                ON t.id = c.team_id
             INNER JOIN users u
                ON u.id = m.sender_id
             WHERE m.id = ?
               AND t.company_id = ?
               AND u.company_id = t.company_id
             LIMIT 1`,
            [result.insertId, req.user.companyId]
        );

        if (!rows.length) {
            return res.status(500).json({
                success: false,
                message: "تم إرسال الرسالة لكن تعذر تحميل تفاصيلها."
            });
        }

        const message = rows[0];

        const io = req.app.get("io");

        if (io) {
            io.to(`team:${teamId}`).emit(
                "team:new-message",
                message
            );
        }

        return res.status(201).json({
            success: true,
            message
        });

    } catch (error) {
        console.error("Send message failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "تعذر إرسال الرسالة."
        });
    }
});

module.exports = router;
