
"use strict";

module.exports = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "يلزم تسجيل الدخول."
        });
    }

    const role = String(req.user.role || "").toLowerCase();

    if (!allowedRoles.includes(role)) {
        return res.status(403).json({
            success: false,
            message: "لا تملك صلاحية تنفيذ هذه العملية."
        });
    }

    return next();
};
