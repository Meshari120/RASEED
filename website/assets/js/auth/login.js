

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorBox = document.getElementById("loginError");
  const successBox = document.getElementById("loginSuccess");

  if (!form) {
    console.error("Raseed: loginForm غير موجود في index.html");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (errorBox) errorBox.textContent = "";
    if (successBox) successBox.textContent = "";

    const button = form.querySelector('button[type="submit"]');
    const originalText = button?.textContent || "";

    const email =
      document.getElementById("email")?.value.trim() || "";

    const password =
      document.getElementById("password")?.value || "";

    if (!email || !password) {
      if (errorBox) {
        errorBox.textContent =
          "أدخل البريد الإلكتروني وكلمة المرور.";
      }
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "جارٍ تسجيل الدخول...";
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || "تعذر تسجيل الدخول. تحقق من بياناتك."
        );
      }

      const token = data.token || data.accessToken;

      if (!token) {
        throw new Error(
          "لم يُرجع السيرفر رمز الدخول. تحقق من استجابة تسجيل الدخول."
        );
      }

      localStorage.setItem("app_token", token);

      if (data.user) {
        localStorage.setItem(
          "app_user",
          JSON.stringify(data.user)
        );
      }

      if (successBox) {
        successBox.textContent = "تم تسجيل الدخول بنجاح. جارٍ فتح المنصة...";
      }

      // الانتقال إلى صفحة لوحة التحكم المستقلة
      window.location.href = "/home.html";

    } catch (error) {
      console.error("Raseed login error:", error);

      if (errorBox) {
        errorBox.textContent =
          error.message || "حدث خطأ أثناء تسجيل الدخول.";
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  });
});
